import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { dirname, join } from 'path';
import sharp from 'sharp';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { parseReceiptText, type OcrMethod } from './receipt-parser';

export type { OcrMethod } from './receipt-parser';

export type PaymentOcrResult = {
  isPaymentReceipt: boolean;
  paymentMethod: OcrMethod | null;
  reference: string | null;
  amount: number | null;
  currency: 'VES' | 'USD' | 'EUR' | null;
  bank: string | null;
  payerPhone: string | null;
  payerName: string | null;
  date: string | null; // YYYY-MM-DD
  confidence: number;  // 0..1
};

const OCR_TIMEOUT_MS = 25_000;

// Modelo de español incluido en el paquete @tesseract.js-data/spa: se lee del
// disco, sin descargar nada de internet (funciona sin conexión). Lee también
// el texto en inglés de Zelle/PayPal (mismo alfabeto).
const LANG_PATH = join(dirname(require.resolve('@tesseract.js-data/spa/package.json')), '4.0.0_best_int');

// OCR de comprobantes SIN IA: sharp prepara la imagen, Tesseract (tesseract.js,
// WebAssembly, local) extrae el texto y receipt-parser lo interpreta con reglas
// (etiquetas de los bancos venezolanos, formatos de montos, teléfonos y fechas).
// Devuelve los campos para AUTOCOMPLETAR el formulario: el staff siempre revisa
// antes de guardar. La imagen no se almacena aquí.
@Injectable()
export class PaymentOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(PaymentOcrService.name);
  private worker: Promise<Worker> | null = null;
  // Tesseract procesa una imagen a la vez por worker: las lecturas se encolan.
  private queue: Promise<unknown> = Promise.resolve();

  // El worker (~5 MB de modelos) se crea con la primera lectura y se reutiliza.
  private getWorker() {
    if (!this.worker) {
      this.worker = (async () => {
        const worker = await createWorker('spa', OEM.LSTM_ONLY, { langPath: LANG_PATH, gzip: true, cacheMethod: 'none' });
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
        return worker;
      })();
      this.worker.catch(() => { this.worker = null; });
    }
    return this.worker;
  }

  async onModuleDestroy() {
    if (this.worker) await (await this.worker).terminate().catch(() => undefined);
  }

  async extract(buffer: Buffer, _mimeType: string): Promise<PaymentOcrResult> {
    let text: string;
    let ocrConfidence: number;
    try {
      const image = await this.prepare(buffer);
      const run = this.queue.then(async () => {
        const worker = await this.getWorker();
        return worker.recognize(image);
      });
      this.queue = run.catch(() => undefined);
      const { data } = await withTimeout(run, OCR_TIMEOUT_MS);
      text = data.text;
      ocrConfidence = data.confidence / 100;
    } catch (err: any) {
      this.logger.error(`OCR falló: ${err?.message ?? err}`);
      throw new ServiceUnavailableException('No se pudo leer el comprobante. Completa los datos a mano.');
    }

    const parsed = parseReceiptText(text);
    if (!parsed.isPaymentReceipt) {
      throw new UnprocessableEntityException('La imagen no parece un comprobante de pago o no se lee bien. Completa los datos a mano.');
    }
    const { completeness, ...fields } = parsed;
    return {
      ...fields,
      // Qué tan legible fue la imagen × cuántos datos clave se reconocieron.
      confidence: Math.round(Math.min(1, Math.max(0, ocrConfidence * (0.4 + 0.6 * completeness))) * 100) / 100,
    };
  }

  // Tesseract lee mejor texto oscuro sobre fondo claro, en gris y con buena
  // resolución: se corrige la orientación (EXIF), se escala a ~1600 px de
  // ancho, se invierte si la captura es en modo oscuro y se realza el contraste.
  private async prepare(buffer: Buffer): Promise<Buffer> {
    const base = sharp(buffer, { failOn: 'none' }).rotate();
    const { width = 0 } = await base.metadata();
    let pipeline = base
      .resize({ width: Math.min(Math.max(width, 1600), 2400), withoutEnlargement: false })
      .grayscale();
    const { channels } = await pipeline.clone().stats();
    if (channels[0].mean < 110) pipeline = pipeline.negate({ alpha: false });
    return pipeline.normalise().sharpen().png().toBuffer();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`OCR tardó más de ${ms / 1000}s`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
