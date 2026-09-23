import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MessagingService } from './messaging.service';
import { WhatsappService } from '../reminders/whatsapp.service';

// RET-B01 — servicio de mensajería (email + WhatsApp) para cualquier módulo.
@Module({
  providers: [EmailService, WhatsappService, MessagingService],
  exports: [MessagingService, EmailService],
})
export class MessagingModule {}
