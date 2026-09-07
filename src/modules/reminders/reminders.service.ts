import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  // Builds a click-to-chat WhatsApp link with a pre-filled message. Free.
  private waLink(
    phone: string | null | undefined,
    message: string,
  ): string | null {
    if (!phone) return null;

    let digits = phone.replace(/\D/g, "");

    const cc = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.replace(/\D/g, "");

    // Prepend country code if missing.
    if (cc && digits.length <= 10) {
      digits = cc + digits;
    }

    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  private message(name: string, plan: string, endDate: Date): string {
    const fecha = endDate.toLocaleDateString("es-MX");

    return `Hola ${name}, te recordamos que tu membresía ${plan} vence el ${fecha}. ¡Te esperamos en el gym!`;
  }

  // ============================================================
  // REMINDERS FOR ONE GYM
  // ============================================================

  // On-demand list for ONE gym.
  // Used by the endpoint the owner opens daily.
  async buildForGym(gymId: string, days = 7) {
    const limit = new Date();

    limit.setDate(limit.getDate() + days);

    const memberships = await this.prisma.membership.findMany({
      where: {
        gymId,
        status: "active",
        endDate: {
          lte: limit,
        },
      },

      orderBy: {
        endDate: "asc",
      },

      include: {
        member: {
          include: {
            user: {
              include: {
                profile: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },

        plan: {
          select: {
            name: true,
          },
        },
      },
    });

    return memberships.map((m) => {
      const name =
        `${m.member.user.profile?.firstName ?? ""} ${m.member.user.profile?.lastName ?? ""}`.trim();

      const phone = m.member.user.profile?.phone ?? null;

      return {
        memberName: name,
        plan: m.plan.name,
        endDate: m.endDate,
        phone,
        whatsappLink: this.waLink(
          phone,
          this.message(name, m.plan.name, m.endDate),
        ),
      };
    });
  }

  // ============================================================
  // DAILY JOB
  // ============================================================

  // Daily job across ALL gyms.
  //
  // This is intentionally executed at system level because there
  // is no request/gymId context.
  //
  // This is a legitimate exception to normal request-level
  // tenant scoping because we explicitly iterate through every gym.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runDailyForAllGyms() {
    const gyms = await this.prisma.gym.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    for (const gym of gyms) {
      const reminders = await this.buildForGym(gym.id);

      if (reminders.length === 0) {
        continue;
      }

      this.logger.log(
        `[${gym.name}] ${reminders.length} membership(s) expiring soon`,
      );

      // ==========================================================
      // EXTENSION POINT
      // ==========================================================
      //
      // Free/manual model (default):
      //
      // The owner opens:
      //
      // GET /api/reminders
      //
      // and taps each wa.me link manually.
      //
      // Cost: $0
      //
      // Automated model:
      //
      // Loop through `reminders` and send each message through:
      //
      // - Twilio
      // - WhatsApp Cloud API
      //
      // That path has a per-message cost.
      // ==========================================================
    }
  }
}
