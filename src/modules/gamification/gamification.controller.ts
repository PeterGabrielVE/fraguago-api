import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RedemptionStatus, Role } from '@prisma/client';
import { GamificationService } from './gamification.service';
import { RewardsService } from './rewards.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { AdjustPointsDto } from './dto/adjust-points.dto';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { CreateBadgeDto } from './dto/create-badge.dto';
import { UpdateBadgeDto } from './dto/update-badge.dto';
import { AwardBadgeDto } from './dto/award-badge.dto';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';

// Gestión de gamificación desde el panel (staff). La vista del socio vive en
// el portal (/me/gamification, /me/rewards…).
@Controller('gamification')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GamificationController {
  constructor(
    private readonly service: GamificationService,
    private readonly rewards: RewardsService,
  ) {}

  // --- Niveles ---

  // ?custom=true devuelve solo los niveles configurados por el gym (sin el
  // set por defecto), para la pantalla de administración.
  @Get('tiers')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findTiers(@GymId() gymId: string, @Query('custom') custom?: string) {
    return custom === 'true'
      ? this.service.findCustomTiers(gymId)
      : this.service.findTiers(gymId);
  }

  @Post('tiers')
  @Roles(Role.ADMIN)
  createTier(@GymId() gymId: string, @Body() dto: CreateTierDto) {
    return this.service.createTier(gymId, dto);
  }

  @Patch('tiers/:id')
  @Roles(Role.ADMIN)
  updateTier(@GymId() gymId: string, @Param('id') id: string, @Body() dto: UpdateTierDto) {
    return this.service.updateTier(gymId, id, dto);
  }

  @Delete('tiers/:id')
  @Roles(Role.ADMIN)
  removeTier(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.removeTier(gymId, id);
  }

  // --- Insignias (estáticas antes de :id) ---

  @Get('badges')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findBadges(@GymId() gymId: string) {
    return this.service.findBadges(gymId);
  }

  @Post('badges')
  @Roles(Role.ADMIN)
  createBadge(@GymId() gymId: string, @Body() dto: CreateBadgeDto) {
    return this.service.createBadge(gymId, dto);
  }

  @Post('badges/defaults')
  @Roles(Role.ADMIN)
  createDefaultBadges(@GymId() gymId: string) {
    return this.service.createDefaultBadges(gymId);
  }

  @Patch('badges/:id')
  @Roles(Role.ADMIN)
  updateBadge(@GymId() gymId: string, @Param('id') id: string, @Body() dto: UpdateBadgeDto) {
    return this.service.updateBadge(gymId, id, dto);
  }

  @Delete('badges/:id')
  @Roles(Role.ADMIN)
  removeBadge(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.removeBadge(gymId, id);
  }

  @Post('badges/:id/award')
  @Roles(Role.ADMIN, Role.STAFF)
  awardBadge(@GymId() gymId: string, @Param('id') id: string, @Body() dto: AwardBadgeDto) {
    return this.service.awardBadge(gymId, id, dto.memberId);
  }

  // --- GAM-01: catálogo de recompensas ---

  @Get('rewards')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findRewards(@GymId() gymId: string) {
    return this.rewards.findAll(gymId);
  }

  @Post('rewards')
  @Roles(Role.ADMIN)
  createReward(@GymId() gymId: string, @Body() dto: CreateRewardDto) {
    return this.rewards.create(gymId, dto);
  }

  @Get('rewards/:id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findReward(@GymId() gymId: string, @Param('id') id: string) {
    return this.rewards.findOne(gymId, id);
  }

  @Patch('rewards/:id')
  @Roles(Role.ADMIN)
  updateReward(@GymId() gymId: string, @Param('id') id: string, @Body() dto: UpdateRewardDto) {
    return this.rewards.update(gymId, id, dto);
  }

  @Delete('rewards/:id')
  @Roles(Role.ADMIN)
  removeReward(@GymId() gymId: string, @Param('id') id: string) {
    return this.rewards.remove(gymId, id);
  }

  // --- GAM-01: canjes (estáticas antes de :id) ---

  @Get('redemptions')
  @Roles(Role.ADMIN, Role.STAFF)
  findRedemptions(
    @GymId() gymId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: RedemptionStatus,
  ) {
    if (status && !Object.values(RedemptionStatus).includes(status)) {
      throw new BadRequestException(
        `status debe ser uno de: ${Object.values(RedemptionStatus).join(', ')}`,
      );
    }
    return this.rewards.findRedemptions(
      gymId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      status,
    );
  }

  // Recepción valida el código que muestra el socio antes de entregar.
  @Get('redemptions/code/:code')
  @Roles(Role.ADMIN, Role.STAFF)
  findRedemptionByCode(@GymId() gymId: string, @Param('code') code: string) {
    return this.rewards.findByCode(gymId, code);
  }

  @Patch('redemptions/:id/fulfill')
  @Roles(Role.ADMIN, Role.STAFF)
  fulfill(@GymId() gymId: string, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rewards.fulfill(gymId, id, user.id);
  }

  @Patch('redemptions/:id/cancel')
  @Roles(Role.ADMIN, Role.STAFF)
  cancel(@GymId() gymId: string, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rewards.cancel(gymId, id, user.id);
  }

  // --- GAM-B02: puntos del socio ---

  @Get('members/:memberId')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  summary(@GymId() gymId: string, @Param('memberId') memberId: string) {
    return this.service.summary(gymId, memberId);
  }

  @Get('members/:memberId/points')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  pointsHistory(
    @GymId() gymId: string,
    @Param('memberId') memberId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.pointsHistory(
      gymId,
      memberId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Post('members/:memberId/points')
  @Roles(Role.ADMIN, Role.STAFF)
  awardPoints(
    @GymId() gymId: string,
    @Param('memberId') memberId: string,
    @Body() dto: AdjustPointsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.awardPoints(gymId, memberId, dto.points, dto.reason, user.id);
  }

  @Post('members/:memberId/points/deduct')
  @Roles(Role.ADMIN, Role.STAFF)
  deductPoints(
    @GymId() gymId: string,
    @Param('memberId') memberId: string,
    @Body() dto: AdjustPointsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.deductPoints(gymId, memberId, dto.points, dto.reason, user.id);
  }
}
