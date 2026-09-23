import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

export type SendResult = { ok: boolean; error?: string };

// RET-B01 — envío de email por SMTP (Gmail, SES, Brevo, Mailtrap…). Sin
// SMTP_HOST configurado, isConfigured = false y el llamador registra el envío
// como SKIPPED en vez de fallar.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  get isConfigured(): boolean {
    return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const port = Number(process.env.SMTP_PORT ?? 587);
      this.transporter = createTransport({
        host: process.env.SMTP_HOST,
        port,
        // 465 = TLS directo; 587/25 = STARTTLS. Se puede forzar con SMTP_SECURE.
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    return this.transporter;
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<SendResult> {
    if (!this.isConfigured) return { ok: false, error: 'Email no configurado (SMTP_HOST/SMTP_FROM)' };
    try {
      await this.getTransporter().sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        text,
        html,
      });
      return { ok: true };
    } catch (err) {
      const error = (err as Error)?.message ?? String(err);
      this.logger.error(`Fallo enviando email a ${to}: ${error}`);
      return { ok: false, error };
    }
  }
}
