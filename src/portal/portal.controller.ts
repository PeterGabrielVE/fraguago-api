import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

// Portal de autoservicio: solo socios (Role.MEMBER) pueden acceder. ADMIN,
// STAFF y TRAINER reciben 403 acá (intencional): este board es exclusivo
// para que un socio autoconsulte/edite SUS PROPIOS datos. OWNER siempre pasa
// por la regla especial de RolesGuard.
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MEMBER)
export class PortalController {
  constructor(private readonly service: PortalService) {}

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
}
