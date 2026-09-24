import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';

export type OcrMethod = 'PAGO_MOVIL' | 'TRANSFER' | 'ZELLE' | 'CARD' | 'CASH' | 'OTHER';

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
  confidence: number;  // 0..1, estimada por el modelo
};

const OCR_TIMEOUT_MS = 25_000;

const SYSTEM = [
  'Extraes datos de comprobantes de pago de Venezuela (capturas de pago móvil,',
  'transferencias bancarias, Zelle, vouchers de punto de venta). Devuelves SOLO',
  'lo que ves escrito en la imagen: si un dato no aparece, usa null; nunca lo',
  'inventes. La referencia es el número de operación/referencia/confirmación',
  '(no el teléfono ni la cédula). "bank" es el banco EMISOR (desde donde se',
  'pagó, suele ser el del logo o encabezado), nunca el banco destino.',
  '"payerPhone" es el teléfono de ORIGEN/emisor, nunca el de destino.',
  'Montos en Bs usan coma decimal (1.234,56 = 1234.56). Si la imagen no es un',
  'comprobante de pago, isPaymentReceipt=false.',
].join(' ');

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isPaymentReceipt: { type: Type.BOOLEAN },
    paymentMethod: { type: Type.STRING, nullable: true, enum: ['PAGO_MOVIL', 'TRANSFER', 'ZELLE', 'CARD', 'CASH', 'OTHER'] },
    reference: { type: Type.STRING, nullable: true },
    amount: { type: Type.NUMBER, nullable: true },
    currency: { type: Type.STRING, nullable: true, enum: ['VES', 'USD', 'EUR'] },
    bank: { type: Type.STRING, nullable: true },
    payerPhone: { type: Type.STRING, nullable: true },
    payerName: { type: Type.STRING, nullable: true },
    date: { type: Type.STRING, nullable: true, description: 'Fecha del pago en formato YYYY-MM-DD' },
    confidence: { type: Type.NUMBER, description: 'Qué tan legible y seguro es lo extraído, de 0 a 1' },
  },
  required: ['isPaymentReceipt', 'confidence'],
};

// OCR de comprobantes con Gemini (ya configurado para las rutinas con IA).
// Lee la captura y devuelve los campos para AUTOCOMPLETAR el formulario: el
// staff siempre revisa antes de guardar. La imagen no se almacena aquí.
@Injectable()
export class PaymentOcrService {
  private readonly logger = new Logger(PaymentOcrService.name);
  private readonly client: GoogleGenAI | null;
  private readonly model = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';

  constructor() {
    this.client = process.env.GEMINI_API_KEY
      ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: OCR_TIMEOUT_MS } })
      : null;
  }

  get isConfigured() {
    return this.client !== null;
  }

  async extract(buffer: Buffer, mimeType: string): Promise<PaymentOcrResult> {
    if (!this.client) {
      throw new ServiceUnavailableException('La lectura automática de comprobantes no está configurada (GEMINI_API_KEY)');
    }
    let raw: Partial<PaymentOcrResult>;
    try {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: buffer.toString('base64') } },
            { text: 'Extrae los datos de este comprobante de pago.' },
          ],
        }],
        config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
      });
      raw = JSON.parse(res.text ?? '{}');
    } catch (err: any) {
      this.logger.error(`OCR falló: ${err?.status ?? ''} ${err?.message ?? err}`);
      throw new ServiceUnavailableException(
        err?.status === 429 || err?.status === 503
          ? 'El servicio de lectura está saturado. Intenta de nuevo en unos segundos o completa los datos a mano.'
          : 'No se pudo leer el comprobante. Completa los datos a mano.',
      );
    }
    const result = this.sanitize(raw);
    if (!result.isPaymentReceipt) {
      throw new UnprocessableEntityException('La imagen no parece un comprobante de pago');
    }
    return result;
  }

  // Nunca se confía ciegamente en la salida del modelo: se normaliza y se
  // descarta lo que no tenga forma válida.
  private sanitize(raw: Partial<PaymentOcrResult>): PaymentOcrResult {
    const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const methods: OcrMethod[] = ['PAGO_MOVIL', 'TRANSFER', 'ZELLE', 'CARD', 'CASH', 'OTHER'];
    const method = methods.includes(raw.paymentMethod as OcrMethod) ? (raw.paymentMethod as OcrMethod) : null;

    let reference = text(raw.reference, 40);
    if (reference) {
      reference = method === 'PAGO_MOVIL' ? reference.replace(/\D/g, '') : reference.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (reference.length < 4) reference = null;
    }
    const amount = typeof raw.amount === 'number' && Number.isFinite(raw.amount) && raw.amount > 0
      ? Math.round(raw.amount * 100) / 100
      : null;
    const currency = ['VES', 'USD', 'EUR'].includes(raw.currency as string) ? (raw.currency as PaymentOcrResult['currency']) : null;
    const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && !Number.isNaN(Date.parse(raw.date))
      ? raw.date
      : null;
    const phone = text(raw.payerPhone, 20)?.replace(/[^\d+]/g, '') || null;
    const confidence = typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0;

    return {
      isPaymentReceipt: raw.isPaymentReceipt !== false,
      paymentMethod: method,
      reference,
      amount,
      currency,
      bank: text(raw.bank, 60),
      payerPhone: phone && phone.replace(/\D/g, '').length >= 7 ? phone : null,
      payerName: text(raw.payerName, 100),
      date,
      confidence,
    };
  }
}
