import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AutomatedMessage, AutomationTrigger, MessageChannel, Prisma, MembershipStatus } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { TemplateValues, renderTemplate, unknownVariables } from '../messaging/template';
import { CreateAutomatedMessageDto } from './dto/create-automated-message.dto';
import { UpdateAutomatedMessageDto } from './dto/update-automated-message.dto';
import { MessageLogQueryDto } from './dto/retention-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
// Tope de destinatarios por ejecución, para no saturar el SMTP ni la API de Meta.
const MAX_TARGETS_PER_RUN = 500;

const SAMPLE_VALUES: TemplateValues = {
  nombre: 'Ana',
  apellido: 'Pérez',
  gimnasio: 'Tu gimnasio',
  dias_inactivo: '5',
  ultima_visita: new Date(Date.now() - 5 * DAY_MS).toLocaleDateString('es-VE'),
  plan: 'Mensual',
  vence: new Date(Date.now() + 3 * DAY_MS).toLocaleDateString('es-VE'),
};

type Target = {
  memberId: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  lastAttendance: Date | null;
  referenceDate: Date; // desde cuándo cuenta la inasistencia
  plan: string | null;
  membershipEnd: Date | null;
};

export type RunResult = {
  automationId: string;
  evaluated: number;
  sent: number;
  failed: number;
  skipped: number;
  alreadyNotified: number;
};

@Injectable()
export class AutomationsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly messaging: MessagingService,
  ) {}

  // ------------------------------------------------------------------
  // RET-B03 — CRUD
  // ------------------------------------------------------------------

  // Reglas entre campos, sobre el estado final (lo guardado + los cambios).
  private assertRules(data: {
    channel: MessageChannel;
    subject?: string | null;
    body: string;
    whatsappTemplate?: string | null;
  }) {
    const unknown = unknownVariables(`${data.subject ?? ''} ${data.body}`);
    if (unknown.length) {
      throw new BadRequestException(
        `Variables no reconocidas: ${unknown.map((v) => `{{${v}}}`).join(', ')}`,
      );
    }
    if (data.channel === 'EMAIL' && !data.subject?.trim()) {
      throw new BadRequestException('Los mensajes por email necesitan un asunto');
    }
    if (data.channel === 'WHATSAPP' && !data.whatsappTemplate) {
      throw new BadRequestException(
        'Los mensajes por WhatsApp necesitan el nombre de una plantilla aprobada en Meta',
      );
    }
  }

  findAll(gymId: string) {
    return this.prisma.automatedMessage.findMany({
      where: { gymId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { logs: true } } },
    });
  }

  async findOne(gymId: string, id: string) {
    const row = await this.prisma.automatedMessage.findFirst({ where: { id, gymId } });
    if (!row) throw new NotFoundException('Mensaje automático no encontrado');
    return row;
  }

  create(gymId: string, dto: CreateAutomatedMessageDto) {
    this.assertRules({ ...dto, channel: dto.channel ?? 'EMAIL' });
    return this.prisma.automatedMessage.create({ data: { ...dto, gymId } });
  }

  async update(gymId: string, id: string, dto: UpdateAutomatedMessageDto) {
    const current = await this.findOne(gymId, id);
    this.assertRules({
      channel: dto.channel ?? current.channel,
      subject: dto.subject ?? current.subject,
      body: dto.body ?? current.body,
      whatsappTemplate: dto.whatsappTemplate ?? current.whatsappTemplate,
    });
    return this.prisma.automatedMessage.update({ where: { id }, data: dto });
  }

  // El historial de envíos se conserva (MessageLog.automatedMessageId → null).
  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.prisma.automatedMessage.delete({ where: { id } });
  }

  // Vista previa con datos de ejemplo; valida las variables usadas.
  preview(subject: string | undefined, body: string, gymName?: string) {
    const unknown = unknownVariables(`${subject ?? ''} ${body}`);
    const values = { ...SAMPLE_VALUES, gimnasio: gymName ?? SAMPLE_VALUES.gimnasio };
    return {
      subject: subject ? renderTemplate(subject, values) : null,
      body: renderTemplate(body, values),
      unknownVariables: unknown,
    };
  }

  private async gymName(gymId: string) {
    const gym = await this.prisma.gym.findFirst({ where: { id: gymId }, select: { name: true } });
    return gym?.name ?? 'FraguaGo';
  }

  async previewFor(gymId: string, subject: string | undefined, body: string) {
    return this.preview(subject, body, await this.gymName(gymId));
  }

  // Envío de prueba al usuario del panel que lo pide (datos de ejemplo).
  async sendTest(gymId: string, id: string, userId: string) {
    const automation = await this.findOne(gymId, id);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, gymId },
      select: { email: true, profile: { select: { phone: true, firstName: true } } },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const gymName = await this.gymName(gymId);
    const values = { ...SAMPLE_VALUES, gimnasio: gymName, nombre: user.profile?.firstName ?? SAMPLE_VALUES.nombre };
    const log = await this.messaging.send({
      gymId,
      gymName,
      channel: automation.channel,
      email: user.email,
      phone: user.profile?.phone,
      subject: automation.subject ? `[Prueba] ${renderTemplate(automation.subject, values)}` : null,
      body: renderTemplate(automation.body, values),
      whatsappTemplate: automation.whatsappTemplate,
      whatsappVariables: this.whatsappVariables(automation.trigger, values),
      automatedMessageId: null, // las pruebas no cuentan para el anti-spam
      trigger: automation.trigger,
    });
    return log;
  }

  // ------------------------------------------------------------------
  // RET-B02 — detección de destinatarios
  // ------------------------------------------------------------------

  private readonly memberSelect = (now: Date) => ({
    id: true,
    joinedAt: true,
    user: {
      select: {
        email: true,
        profile: { select: { firstName: true, lastName: true, phone: true } },
      },
    },
    attendances: {
      orderBy: { checkedInAt: 'desc' as const },
      take: 1,
      select: { checkedInAt: true },
    },
    memberships: {
      where: { status: MembershipStatus.ACTIVE, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { endDate: 'desc' as const },
      take: 1,
      select: { endDate: true, plan: { select: { name: true } } },
    },
  });

  // Socios ACTIVOS, con membresía vigente, que no asisten hace más de `days`
  // días. Los recién inscritos tienen el mismo margen (joinedAt <= corte).
  async inactiveTargets(gymId: string, days: number, now = new Date()): Promise<Target[]> {
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const members = await this.prisma.member.findMany({
      where: {
        gymId,
        status: 'ACTIVE',
        joinedAt: { lte: cutoff },
        memberships: { some: { gymId, status: MembershipStatus.ACTIVE, startDate: { lte: now }, endDate: { gte: now } } },
        attendances: { none: { checkedInAt: { gte: cutoff } } },
      },
      select: this.memberSelect(now),
      take: MAX_TARGETS_PER_RUN,
    });

    return members
      .map((m) => {
        const last = m.attendances[0]?.checkedInAt ?? null;
        return {
          memberId: m.id,
          email: m.user.email,
          phone: m.user.profile?.phone ?? null,
          firstName: m.user.profile?.firstName ?? '',
          lastName: m.user.profile?.lastName ?? '',
          lastAttendance: last,
          referenceDate: last ?? m.joinedAt,
          plan: m.memberships[0]?.plan.name ?? null,
          membershipEnd: m.memberships[0]?.endDate ?? null,
        };
      })
      .sort((a, b) => a.referenceDate.getTime() - b.referenceDate.getTime());
  }

  // Socios ACTIVOS cuya membresía vigente vence en los próximos `days` días.
  private async expiringTargets(gymId: string, days: number, now = new Date()): Promise<Target[]> {
    const limit = new Date(now.getTime() + days * DAY_MS);
    const members = await this.prisma.member.findMany({
      where: {
        gymId,
        status: 'ACTIVE',
        memberships: { some: { gymId, status: MembershipStatus.ACTIVE, startDate: { lte: now }, endDate: { gte: now, lte: limit } } },
      },
      select: this.memberSelect(now),
      take: MAX_TARGETS_PER_RUN,
    });
    return members.map((m) => ({
      memberId: m.id,
      email: m.user.email,
      phone: m.user.profile?.phone ?? null,
      firstName: m.user.profile?.firstName ?? '',
      lastName: m.user.profile?.lastName ?? '',
      lastAttendance: m.attendances[0]?.checkedInAt ?? null,
      referenceDate: m.attendances[0]?.checkedInAt ?? m.joinedAt,
      plan: m.memberships[0]?.plan.name ?? null,
      membershipEnd: m.memberships[0]?.endDate ?? null,
    }));
  }

  // RET-B02 — listado para el panel: socios inactivos y cuándo se les avisó.
  async inactiveMembers(gymId: string, days = 4) {
    const now = new Date();
    const targets = await this.inactiveTargets(gymId, days, now);
    const lastLogs = targets.length
      ? await this.prisma.messageLog.groupBy({
          by: ['memberId'],
          where: { gymId, trigger: 'INACTIVITY', status: 'SENT', memberId: { in: targets.map((t) => t.memberId) } },
          _max: { createdAt: true },
        })
      : [];
    const lastNotified = new Map(lastLogs.map((l) => [l.memberId, l._max.createdAt]));

    return {
      days,
      total: targets.length,
      data: targets.map((t) => ({
        memberId: t.memberId,
        name: `${t.firstName} ${t.lastName}`.trim(),
        email: t.email,
        phone: t.phone,
        lastAttendance: t.lastAttendance,
        daysInactive: Math.floor((now.getTime() - t.referenceDate.getTime()) / DAY_MS),
        plan: t.plan,
        membershipEnd: t.membershipEnd,
        lastNotifiedAt: lastNotified.get(t.memberId) ?? null,
      })),
    };
  }

  // ------------------------------------------------------------------
  // Ejecución (cron o "Ejecutar ahora")
  // ------------------------------------------------------------------

  private templateValues(target: Target, gymName: string, now: Date): TemplateValues {
    return {
      nombre: target.firstName || 'socio',
      apellido: target.lastName,
      gimnasio: gymName,
      dias_inactivo: String(Math.floor((now.getTime() - target.referenceDate.getTime()) / DAY_MS)),
      ultima_visita: target.lastAttendance ? target.lastAttendance.toLocaleDateString('es-VE') : 'sin registro',
      plan: target.plan ?? '',
      vence: target.membershipEnd ? target.membershipEnd.toLocaleDateString('es-VE') : '',
    };
  }

  // Variables {{1}}, {{2}}, {{3}} de la plantilla de WhatsApp: nombre,
  // gimnasio y el dato del disparador (días sin venir / fecha de vencimiento).
  private whatsappVariables(trigger: AutomationTrigger, values: TemplateValues): string[] {
    return [
      values.nombre ?? '',
      values.gimnasio ?? '',
      (trigger === 'INACTIVITY' ? values.dias_inactivo : values.vence) ?? '',
    ];
  }

  // Envía el mensaje a quienes cumplen el disparador, sin repetir:
  //  - nunca dos veces dentro de `cooldownDays`;
  //  - en inactividad, además, una sola vez por racha: si el socio volvió a
  //    venir después del último aviso, puede recibir uno nuevo.
  // Los SKIPPED también cuentan, para no llenar el historial a diario cuando
  // el canal no está configurado o falta el dato de contacto.
  async runAutomation(gymId: string, automation: AutomatedMessage, now = new Date()): Promise<RunResult> {
    const targets = automation.trigger === 'INACTIVITY'
      ? await this.inactiveTargets(gymId, automation.triggerDays, now)
      : await this.expiringTargets(gymId, automation.triggerDays, now);

    const result: RunResult = {
      automationId: automation.id,
      evaluated: targets.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      alreadyNotified: 0,
    };

    if (targets.length > 0) {
      const since = new Date(now.getTime() - automation.cooldownDays * DAY_MS);
      const recent = await this.prisma.messageLog.findMany({
        where: {
          gymId,
          automatedMessageId: automation.id,
          memberId: { in: targets.map((t) => t.memberId) },
          status: { in: ['SENT', 'SKIPPED'] },
          createdAt: { gte: since },
        },
        select: { memberId: true, createdAt: true },
      });
      const lastByMember = new Map<string, Date>();
      for (const log of recent) {
        if (!log.memberId) continue;
        const prev = lastByMember.get(log.memberId);
        if (!prev || log.createdAt > prev) lastByMember.set(log.memberId, log.createdAt);
      }

      const gymName = await this.gymName(gymId);
      for (const target of targets) {
        const lastSent = lastByMember.get(target.memberId);
        const notifiedThisStreak = lastSent
          && (automation.trigger !== 'INACTIVITY' || !target.lastAttendance || lastSent > target.lastAttendance);
        if (notifiedThisStreak) {
          result.alreadyNotified++;
          continue;
        }

        const values = this.templateValues(target, gymName, now);
        const log = await this.messaging.send({
          gymId,
          gymName,
          channel: automation.channel,
          email: target.email,
          phone: target.phone,
          subject: automation.subject ? renderTemplate(automation.subject, values) : null,
          body: renderTemplate(automation.body, values),
          whatsappTemplate: automation.whatsappTemplate,
          whatsappVariables: this.whatsappVariables(automation.trigger, values),
          memberId: target.memberId,
          automatedMessageId: automation.id,
          trigger: automation.trigger,
        });
        if (log.status === 'SENT') result.sent++;
        else if (log.status === 'FAILED') result.failed++;
        else result.skipped++;
      }
    }

    await this.prisma.automatedMessage.update({
      where: { id: automation.id },
      data: { lastRunAt: now },
    });
    return result;
  }

  async runNow(gymId: string, id: string) {
    const automation = await this.findOne(gymId, id);
    if (!automation.active) {
      throw new BadRequestException('Activa el mensaje antes de ejecutarlo');
    }
    return this.runAutomation(gymId, automation);
  }

  async runAllForGym(gymId: string) {
    const automations = await this.prisma.automatedMessage.findMany({
      where: { gymId, active: true },
    });
    const results: RunResult[] = [];
    for (const automation of automations) {
      results.push(await this.runAutomation(gymId, automation));
    }
    return results;
  }

  // ------------------------------------------------------------------
  // RET-B01 — historial de envíos
  // ------------------------------------------------------------------

  async messageLogs(gymId: string, { status, page = 1, pageSize = 20 }: MessageLogQueryDto) {
    const where: Prisma.MessageLogWhereInput = { gymId, ...(status ? { status } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.messageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          automatedMessage: { select: { id: true, name: true } },
          member: {
            select: {
              id: true,
              user: { select: { profile: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      }),
      this.prisma.messageLog.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  channels() {
    return this.messaging.channelsStatus();
  }
}
