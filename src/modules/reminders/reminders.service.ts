import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  constructor(private readonly prisma: PrismaService) {}

  // Builds a click-to-chat WhatsApp link with a pre-filled message. Free.
  private waLink(phone: string | null | undefined, message: string): string | null {
    if (!phone) return null;
    let digits = phone.replace(/\D/g, '');
    const cc = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.replace(/\D/g, '');
    if (cc && digits.length <= 10) digits = cc + digits;   // prepend country code if missing
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  private message(name: string, plan: string, endDate: Date): string {
    const fecha = endDate.toLocaleDateString('es-MX');
    return `Hola ${name}, te recordamos que tu membresía ${plan} vence el ${fecha}. ¡Te esperamos en el gym!`;
  }

  // On-demand list for ONE gym (used by the endpoint the owner opens daily).
  async buildForGym(gymId: string, days = 7) {
    const limit = new Date();
    limit.setDate(limit.getDate() + days);
    const memberships = await this.prisma.membership.findMany({
      where: { gymId, status: 'active', endDate: { lte: limit } },
      orderBy: { endDate: 'asc' },
      include: {
        member: { select: { fullName: true, phone: true } },
        plan: { select: { name: true } },
      },
    });
    return memberships.map((m) => ({
      memberName: m.member.fullName,
      plan: m.plan.name,
      endDate: m.endDate,
      phone: m.member.phone,
      whatsappLink: this.waLink(m.member.phone, this.message(m.member.fullName, m.plan.name, m.endDate)),
    }));
  }

  // Daily job across ALL gyms. Runs at system level (no request/gymId context),
  // which is the legitimate exception to per-request tenant scoping.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runDailyForAllGyms() {
    const gyms = await this.prisma.gym.findMany({ select: { id: true, name: true } });
    for (const gym of gyms) {
      const reminders = await this.buildForGym(gym.id);
      if (reminders.length === 0) continue;
      this.logger.log(`[${gym.name}] ${reminders.length} membership(s) expiring soon`);

      // --- EXTENSION POINT ------------------------------------------------
      // Free/manual model (default): the owner opens GET /api/reminders and
      // taps each wa.me link to send the message himself. Cost: $0.
      //
      // Automated model: loop `reminders` and send each via Twilio / the
      // WhatsApp Cloud API here. That path has a per-message cost.
      // --------------------------------------------------------------------
    }
  }
}
