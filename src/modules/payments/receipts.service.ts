import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';

// Comprobantes sin adjuntar a un pago se borran pasado este tiempo.
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

// Fotos de comprobantes de pago (opcionales).
@Injectable()
export class ReceiptsService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  async create(gymId: string, buffer: Buffer, mimeType: string, userId?: string, ocrData?: unknown) {
    const receipt = await this.prisma.paymentReceipt.create({
      data: {
        gymId,
        mimeType,
        size: buffer.length,
        data: buffer,
        uploadedById: userId,
        ocrData: (ocrData ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true, mimeType: true, size: true, createdAt: true },
    });
    return receipt;
  }

  async get(gymId: string, id: string) {
    const receipt = await this.prisma.paymentReceipt.findFirst({
      where: { id, gymId },
      select: { data: true, mimeType: true, size: true },
    });
    if (!receipt) throw new NotFoundException('Comprobante no encontrado');
    return receipt;
  }

  // Job diario: borra fotos que se subieron pero nunca se asociaron a un pago
  // (formulario cancelado, pago rechazado por referencia duplicada…).
  async cleanupOrphans(gymId: string) {
    const { count } = await this.prisma.paymentReceipt.deleteMany({
      where: { gymId, transactionId: null, createdAt: { lt: new Date(Date.now() - ORPHAN_TTL_MS) } },
    });
    return count;
  }
}
