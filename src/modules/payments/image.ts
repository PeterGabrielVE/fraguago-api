import { BadRequestException } from '@nestjs/common';

export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024; // 3 MB (el navegador ya la reduce)

// Tipo real de la imagen por su firma ("magic bytes"), no por la extensión
// ni por el Content-Type que manda el cliente (ambos se pueden falsear).
export function detectImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function assertReceiptImage(file: Express.Multer.File | undefined) {
  if (!file?.buffer?.length) throw new BadRequestException('Adjunta la imagen del comprobante');
  if (file.buffer.length > MAX_RECEIPT_BYTES) throw new BadRequestException('La imagen supera los 3 MB');
  const mimeType = detectImageType(file.buffer);
  if (!mimeType) throw new BadRequestException('El archivo no es una imagen válida (JPG, PNG o WebP)');
  return { buffer: file.buffer, mimeType };
}
