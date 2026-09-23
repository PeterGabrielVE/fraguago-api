import { Inject, Injectable } from '@nestjs/common';
import { AutomationTrigger, MessageChannel, MessageStatus } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { WhatsappService } from '../reminders/whatsapp.service';
import { EmailService } from './email.service';
import { toEmailHtml } from './template';

export type OutgoingMessage = {
  gymId: string;
  gymName: string;
  channel: MessageChannel;
  email?: string | null;
  phone?: string | null;
  subject?: string | null;
  body: string;
  // WhatsApp: plantilla aprobada en Meta y sus variables {{1}}, {{2}}…
  whatsappTemplate?: string | null;
  whatsappVariables?: string[];
  memberId?: string | null;
  automatedMessageId?: string | null;
  trigger?: AutomationTrigger | null;
};

// Normaliza un teléfono a solo dígitos con código de país (WhatsApp Cloud
// API). Mismo criterio que los links wa.me de RemindersService.
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  const cc = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.replace(/\D/g, '');
  if (cc && !digits.startsWith(cc)) {
    if (digits.startsWith('0')) digits = digits.slice(1); // 0414 → 414
    digits = cc + digits;
  }
  return digits;
}

// RET-B01 — punto único de envío. Elige el canal, envía y SIEMPRE deja
// constancia en MessageLog (SENT / FAILED / SKIPPED), que además es la base
// del anti-spam de los mensajes automáticos. Usa el cliente tenant, así que
// debe llamarse dentro de un contexto de gym (request o tenantContext.run).
@Injectable()
export class MessagingService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
  ) {}

  channelsStatus() {
    return { EMAIL: this.email.isConfigured, WHATSAPP: this.whatsapp.isConfigured };
  }

  async send(msg: OutgoingMessage) {
    const { status, recipient, error } = await this.deliver(msg);
    return this.prisma.messageLog.create({
      data: {
        gymId: msg.gymId,
        memberId: msg.memberId ?? null,
        automatedMessageId: msg.automatedMessageId ?? null,
        trigger: msg.trigger ?? null,
        channel: msg.channel,
        recipient,
        subject: msg.subject ?? null,
        body: msg.body,
        status,
        error: error ?? null,
      },
    });
  }

  private async deliver(msg: OutgoingMessage): Promise<{ status: MessageStatus; recipient: string; error?: string }> {
    if (msg.channel === 'EMAIL') {
      const to = msg.email?.trim();
      if (!to) return { status: 'SKIPPED', recipient: '—', error: 'El socio no tiene email' };
      if (!this.email.isConfigured) {
        return { status: 'SKIPPED', recipient: to, error: 'Email no configurado en el servidor' };
      }
      const subject = msg.subject?.trim() || msg.gymName;
      const result = await this.email.send(to, subject, msg.body, toEmailHtml(msg.body, msg.gymName));
      return { status: result.ok ? 'SENT' : 'FAILED', recipient: to, error: result.error };
    }

    const phone = msg.phone ? normalizePhone(msg.phone) : '';
    if (!phone) return { status: 'SKIPPED', recipient: '—', error: 'El socio no tiene teléfono' };
    if (!this.whatsapp.isConfigured) {
      return { status: 'SKIPPED', recipient: phone, error: 'WhatsApp no configurado en el servidor' };
    }
    if (!msg.whatsappTemplate) {
      return { status: 'SKIPPED', recipient: phone, error: 'Falta la plantilla de WhatsApp' };
    }
    const ok = await this.whatsapp.sendTemplate(phone, msg.whatsappTemplate, msg.whatsappVariables ?? []);
    return { status: ok ? 'SENT' : 'FAILED', recipient: phone, error: ok ? undefined : 'Error de la API de WhatsApp (ver logs)' };
  }
}
