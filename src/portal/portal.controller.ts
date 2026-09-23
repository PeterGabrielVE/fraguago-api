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
import { Observable } from 'rxjs';
import { Role } from '@prisma/client';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../auth/decorators/gym-id.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { MarkBadgesSeenDto } from '../modules/gamification/dto/mark-badges-seen.dto';
import { ListChallengesQueryDto } from '../modules/challenges/dto/list-challenges-query.dto';
import { LeaderboardQueryDto } from '../modules/challenges/dto/leaderboard-query.dto';
import { leaderboardStream } from '../modules/challenges/challenges.controller';
import { ChallengeEventsService } from '../modules/challenges/challenge-events.service';

// Portal de autoservicio: solo socios (Role.MEMBER) pueden acceder. ADMIN,
// STAFF y TRAINER reciben 403 acá (intencional): este board es exclusivo
// para que un socio autoconsulte/edite SUS PROPIOS datos. OWNER siempre pasa
// por la regla especial de RolesGuard.
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MEMBER)
export class PortalController {
  constructor(
    private readonly service: PortalService,
    private readonly challengeEvents: ChallengeEventsService,
  ) {}

  @Get('profile')
  getProfile(@GymId() gymId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getProfile(gymId, user.id);
  }

  @Patch('profile')
  updateProfile(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.updateProfile(gymId, user.id, dto);
  }

  @Get('membership')
  getMembership(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.getMembership(gymId, user.id, pagination);
  }

  @Get('attendances')
  getAttendances(@GymId() gymId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getAttendances(gymId, user.id);
  }

  @Post('check-in')
  checkIn(@GymId() gymId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.checkIn(gymId, user.id);
  }

  @Get('routine')
  getRoutine(@GymId() gymId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getRoutine(gymId, user.id);
  }

  // COM-B03 — marcar una rutina propia como completada hoy.
  @Post('routine/:routineId/complete')
  completeRoutine(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('routineId', ParseUUIDPipe) routineId: string,
  ) {
    return this.service.completeRoutine(gymId, user.id, routineId);
  }

  @Get('progress')
  getProgress(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.getProgress(gymId, user.id, pagination);
  }

  // GAM-B02 — saldo, nivel e insignias del socio.
  @Get('gamification')
  getGamification(@GymId() gymId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getGamification(gymId, user.id);
  }

  @Get('points')
  getPoints(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.getPoints(gymId, user.id, pagination);
  }

  // GAM-F02 — insignias desbloqueadas pendientes de mostrar en pop-up.
  @Get('badges/unseen')
  getUnseenBadges(@GymId() gymId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getUnseenBadges(gymId, user.id);
  }

  @Post('badges/seen')
  markBadgesSeen(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkBadgesSeenDto,
  ) {
    return this.service.markBadgesSeen(gymId, user.id, dto.ids);
  }

  // GAM-01 — catálogo canjeable y canje.
  @Get('rewards')
  getRewards(@GymId() gymId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getRewards(gymId, user.id);
  }

  @Post('rewards/:rewardId/redeem')
  redeemReward(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('rewardId') rewardId: string,
  ) {
    return this.service.redeemReward(gymId, user.id, rewardId);
  }

  @Get('redemptions')
  getRedemptions(@GymId() gymId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getRedemptions(gymId, user.id);
  }

  // COM-F01 — retos activos / próximos / pasados con mi participación.
  @Get('challenges')
  getChallenges(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListChallengesQueryDto,
  ) {
    return this.service.getChallenges(gymId, user.id, query.status);
  }

  @Get('challenges/:id')
  getChallenge(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getChallenge(gymId, user.id, id);
  }

  @Post('challenges/:id/join')
  joinChallenge(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.joinChallenge(gymId, user.id, id);
  }

  @Delete('challenges/:id/join')
  leaveChallenge(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.leaveChallenge(gymId, user.id, id);
  }

  // COM-B02 / COM-F02 — clasificación del reto + avisos en tiempo real.
  @Get('challenges/:id/leaderboard')
  getChallengeLeaderboard(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LeaderboardQueryDto,
  ) {
    return this.service.getChallengeLeaderboard(gymId, user.id, id, query.limit);
  }

  @Sse('challenges/:id/stream')
  streamChallenge(
    @GymId() gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Observable<MessageEvent> {
    return leaderboardStream(
      () => this.service.assertChallengeStreamable(gymId, id),
      () => this.challengeEvents.stream(gymId, id),
    );
  }
}
