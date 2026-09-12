import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { WhatsappService } from "./whatsapp.service";
import { SystemPrismaService } from "src/prisma/system-prisma.service";

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  //  EL CAMBIO CLAVE: SystemPrismaService (BYPASSRLS), no el scoped.
  constructor(private readonly prisma: SystemPrismaService, private readonly whatsapp: WhatsappService) {}

  private waLink(
    phone: string | null | undefined,
    message: string,
  ): string | null {
    if (!phone) return null;

    let digits = phone.replace(/\D/g, "");
    const cc = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.replace(/\D/g, "");

    if (cc) {
      if (!digits.startsWith(cc)) {
        // Quita el 0 inicial de móviles venezolanos (0414 → 414) antes del código. 
        if (digits.startsWith("0")) digits = digits.slice(1);
        digits = cc + digits;
      }
    }

    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  private message(name: string, plan: string, endDate: Date): string {
    const fecha = endDate.toLocaleDateString("es-VE");
    return `¡Hola ${name}! Te recordamos que tu membresía ${plan} vence el ${fecha}. Renueva pronto y sigue rompiendo tus límites. ¡Nos vemos en tu próximo entreno!`;
  }

  // Lista para UN gym. SIEMPRE filtra por gymId explícito, porque este
  // cliente ignora el RLS: el aislamiento lo garantiza este where.
  async buildForGym(gymId: string, days = 7) {
    const limit = new Date();
    limit.setDate(limit.getDate() + days);

    const memberships = await this.prisma.membership.findMany({
      where: {
        gymId, // obligatorio: la base NO filtra por vos con este cliente
        status: "active",
        endDate: { lte: limit, gte: new Date() }, // vence pronto, aún no vencida
      },
      orderBy: { endDate: "asc" },
      include: {
        member: {
          include: {
            user: {
              include: {
                profile: {
                  select: { firstName: true, lastName: true, phone: true },
                },
              },
            },
          },
        },
        plan: { select: { name: true } },
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

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runDailyForAllGyms() {
    // Sin RLS, este findMany ve TODOS los gyms. Correcto: iteramos uno por uno.
    const gyms = await this.prisma.gym.findMany({
      select: { id: true, name: true },
    });

    for (const gym of gyms) {
      const reminders = await this.buildForGym(gym.id);
      if (reminders.length === 0) continue;
      this.logger.log(
        `[${gym.name}] ${reminders.length} membresía(s) por vencer`,
      );
      // Punto de extensión: envío automático vía WhatsApp Cloud API (futuro).
      /*for (const r of reminders) {
        if (!r.phone) continue; // sin teléfono, no hay envío

        const to = r.phone.replace(/\D/g, ""); // normalizá igual que el wa.me
        const fecha = r.endDate.toLocaleDateString("es-VE");

        // "vencimiento_membresia" es tu plantilla aprobada, con 3 variables.
        const ok = await this.whatsapp.sendTemplate(
          to,
          "vencimiento_membresia",
          [r.memberName, r.plan, fecha], // {{1}}, {{2}}, {{3}}
        );

        this.logger.log(`${r.memberName}: ${ok ? "enviado" : "omitido/falló"}`);
      }*/
    }
  }
}
