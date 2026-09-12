import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  // ¿Están las credenciales? Si no, el envío automático se salta (fallback a wa.me).
  get isConfigured(): boolean {
    return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  }

  // Envía un mensaje de PLANTILLA (lo único permitido para iniciar conversación).
  async sendTemplate(
    to: string,
    templateName: string,
    variables: string[],
    lang = 'es',
  ): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('WhatsApp no configurado; se omite envío automático.');
      return false;
    }

    const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      to, // número destino con código de país, solo dígitos: 584141234567
      type: 'template',
      template: {
        name: templateName, // el nombre EXACTO de la plantilla aprobada en Meta
        language: { code: lang },
        components: [
          {
            type: 'body',
            parameters: variables.map((v) => ({ type: 'text', text: v })),
          },
        ],
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        this.logger.error(`WhatsApp API error ${res.status}: ${err}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error(`Fallo enviando WhatsApp: ${e}`);
      return false;
    }
  }
}