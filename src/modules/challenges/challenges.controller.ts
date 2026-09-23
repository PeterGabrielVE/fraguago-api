import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Observable, catchError, defer, of, switchMap } from 'rxjs';
import { ChallengesService } from './challenges.service';
import { ChallengeEventsService } from './challenge-events.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';
import { ListChallengesQueryDto } from './dto/list-challenges-query.dto';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

// Stream SSE de "el leaderboard cambió". Valida el reto antes de abrirlo; si
// falla, manda un evento `error` y cierra (ya no se pueden cambiar headers).
export function leaderboardStream(
  check: () => Promise<unknown>,
  stream: () => Observable<MessageEvent>,
): Observable<MessageEvent> {
  return defer(check).pipe(
    switchMap(stream),
    catchError((err) => of<MessageEvent>({ type: 'error', data: { message: err?.message ?? 'Error' } })),
  );
}

// Gestión de retos desde el panel (staff). La vista del socio vive en el
// portal (/me/challenges/**).
@Controller('challenges')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChallengesController {
  constructor(
    private readonly service: ChallengesService,
    private readonly events: ChallengeEventsService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.TRAINER)
  create(
    @GymId() gymId: string,
    @Body() dto: CreateChallengeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(gymId, dto, user.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(@GymId() gymId: string, @Query() query: ListChallengesQueryDto) {
    return this.service.findAll(gymId, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(gymId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TRAINER)
  update(
    @GymId() gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChallengeDto,
  ) {
    return this.service.update(gymId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(gymId, id);
  }

  // COM-B02 — clasificación completa (nombres sin anonimizar para el staff).
  @Get(':id/leaderboard')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  leaderboard(
    @GymId() gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LeaderboardQueryDto,
  ) {
    return this.service.leaderboard(gymId, id, { limit: query.limit });
  }

  // COM-F02 — avisos en tiempo real de cambios en el leaderboard.
  @Sse(':id/stream')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  stream(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return leaderboardStream(
      () => this.service.assertStreamable(gymId, id, false),
      () => this.events.stream(gymId, id),
    );
  }

  // Recalcula el progreso de todos (p. ej. tras corregir asistencias).
  @Post(':id/recalculate')
  @Roles(Role.ADMIN, Role.TRAINER)
  recalculate(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.recalculateAll(gymId, id);
  }
}
