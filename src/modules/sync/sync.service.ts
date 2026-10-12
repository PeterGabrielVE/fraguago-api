import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { MembersService } from '../members/members.service';
import {
  SyncCheckInPayload,
  SyncMemberCreatePayload,
  SyncOperationDto,
  SyncOperationType,
} from './dto/sync-operation.dto';
import { SyncRejection } from './sync-rejection';

// Una operación se considera "en vivo" (hecha con conexión) si se envía antes
// de este margen; pasado, es una operación diferida que ya ocurrió.
const LIVE_WINDOW_MS = 2 * 60_000;
const DAY_MS = 86_400_000;

// Roles que pueden hacer cada operación (los mismos que su endpoint normal).
const ALLOWED_ROLES: Record<SyncOperationType, Role[]> = {
  'attendance.checkIn': [Role.ADMIN, Role.STAFF, Role.TRAINER],
  'member.create': [Role.ADMIN, Role.STAFF],
};

const ENTITY: Record<SyncOperationType, string> = {
  'attendance.checkIn': 'attendance',
  'member.create': 'member',
};

export type SyncResult =
  | { id: string; status: 'applied' | 'duplicate'; entityId: string | null; result: unknown }
  | { id: string; status: 'rejected' | 'conflict'; code: string; message: string };

@Injectable()
export class SyncService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly attendance: AttendanceService,
    private readonly members: MembersService,
  ) {}

  // Antigüedad máxima de una operación diferida (SYNC_MAX_AGE_DAYS, 30 por defecto).
  private maxAgeMs() {
    const days = Number(process.env.SYNC_MAX_AGE_DAYS);
    return (Number.isFinite(days) && days > 0 ? days : 30) * DAY_MS;
  }

  // POST /sync/operations — aplica una operación de la cola del cliente, una
  // sola vez. Los rechazos de negocio se devuelven como resultado (no como
  // error HTTP) y no se guardan: al reintentar se vuelven a evaluar.
  async apply(
    gymId: string,
    user: { id: string; role: string },
    dto: SyncOperationDto,
  ): Promise<SyncResult> {
    const prior = await this.prisma.syncOperation.findUnique({
      where: { gymId_id: { gymId, id: dto.id } },
    });
    if (prior) {
      return { id: dto.id, status: 'duplicate', entityId: prior.entityId, result: prior.result };
    }

    try {
      if (dto.gymId && dto.gymId !== gymId) {
        throw new SyncRejection('TENANT_MISMATCH', 'La operación pertenece a otro gimnasio.');
      }
      if (user.role !== Role.OWNER && !ALLOWED_ROLES[dto.type].includes(user.role as Role)) {
        throw new SyncRejection('FORBIDDEN', 'Tu rol no puede realizar esta operación.');
      }

      // Tiempo transcurrido según el reloj del propio dispositivo; la hora real
      // se calcula restándolo a la del servidor.
      const elapsed = Math.max(0, new Date(dto.sentAt).getTime() - new Date(dto.createdAt).getTime());
      if (elapsed > this.maxAgeMs()) {
        throw new SyncRejection('TOO_OLD', 'La operación es demasiado antigua para sincronizarse.');
      }
      const occurredAt = new Date(Date.now() - elapsed);

      const { entityId, result } = await this.run(gymId, dto, occurredAt, elapsed < LIVE_WINDOW_MS);
      await this.record(gymId, user.id, dto, entityId, result);
      return { id: dto.id, status: 'applied', entityId, result };
    } catch (err) {
      if (err instanceof SyncRejection) {
        return { id: dto.id, status: err.kind, code: err.code, message: err.message };
      }
      throw err;
    }
  }

  private async run(gymId: string, dto: SyncOperationDto, occurredAt: Date, live: boolean) {
    switch (dto.type) {
      case 'attendance.checkIn': {
        const payload = await this.payload(SyncCheckInPayload, dto.payload);
        const { attendance } = await this.attendance.syncCheckIn(gymId, {
          id: dto.entityId,
          memberId: payload.memberId,
          occurredAt,
          live,
        });
        // attendance.id difiere de entityId si se reutilizó la entrada que ya
        // había registrado otro dispositivo.
        return { entityId: attendance.id, result: attendance };
      }
      case 'member.create': {
        const payload = await this.payload(SyncMemberCreatePayload, dto.payload);
        const member = await this.members.syncCreate(gymId, dto.entityId, payload);
        return { entityId: member.id, result: member };
      }
    }
  }

  // Valida el payload con las mismas reglas que el ValidationPipe global.
  private async payload<T extends object>(cls: new () => T, raw: Record<string, unknown>): Promise<T> {
    const instance = plainToInstance(cls, raw);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? { [e.property]: `${e.property} no es válido` }));
      throw new SyncRejection('VALIDATION', messages.join('; '));
    }
    return instance;
  }

  private async record(
    gymId: string,
    userId: string,
    dto: SyncOperationDto,
    entityId: string,
    result: unknown,
  ) {
    try {
      await this.prisma.syncOperation.create({
        data: {
          gymId,
          id: dto.id,
          userId,
          type: dto.type,
          entity: ENTITY[dto.type],
          entityId,
          // Pasa por JSON: Prisma no acepta Date/Decimal en una columna Json.
          result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
          clientCreatedAt: new Date(dto.createdAt),
        },
      });
    } catch (err) {
      // Otra petición con la misma clave la registró primero: ya está.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
  }
}
