import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { AuditSkip } from '../../common/audit.interceptor';
import { PaymentOcrService } from './payment-ocr.service';
import { ReceiptsService } from './receipts.service';
import { MAX_RECEIPT_BYTES, assertReceiptImage } from './image';

const uploadLimits = { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1, fields: 0 } };

// Comprobantes de pago: lectura automática (OCR) y fotos opcionales.
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class PaymentsController {
  constructor(
    private readonly ocr: PaymentOcrService,
    private readonly receipts: ReceiptsService,
  ) {}

  // Lee la captura y devuelve los datos para autocompletar. No guarda nada.
  @Post('ocr')
  @AuditSkip()
  @UseInterceptors(FileInterceptor('file', uploadLimits))
  async readReceipt(@UploadedFile() file: Express.Multer.File | undefined) {
    const { buffer, mimeType } = assertReceiptImage(file);
    return this.ocr.extract(buffer, mimeType);
  }

  // Guarda la foto (opcional) y devuelve su id para adjuntarla al pago.
  @Post('receipts')
  @UseInterceptors(FileInterceptor('file', uploadLimits))
  async uploadReceipt(
    @GymId() gymId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { buffer, mimeType } = assertReceiptImage(file);
    return this.receipts.create(gymId, buffer, mimeType, user.id);
  }

  @Get('receipts/:id')
  async getReceipt(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    const receipt = await this.receipts.get(gymId, id);
    return new StreamableFile(Buffer.from(receipt.data), {
      type: receipt.mimeType,
      length: receipt.size,
      disposition: 'inline',
    });
  }
}
