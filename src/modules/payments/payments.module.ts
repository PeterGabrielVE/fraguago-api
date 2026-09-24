import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentOcrService } from './payment-ocr.service';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentOcrService, ReceiptsService],
  exports: [ReceiptsService],
})
export class PaymentsModule {}
