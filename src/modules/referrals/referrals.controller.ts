import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { ApplyReferralDto, ListReferralsQueryDto, ValidateReferralQueryDto } from './dto/referral.dto';

// RET-B04 — programa de referidos (staff). El socio ve su código en /me/referral.
@Controller('referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  findAll(@GymId() gymId: string, @Query() query: ListReferralsQueryDto) {
    return this.service.findAll(gymId, query.status, query.page, query.pageSize);
  }

  // Validación en vivo desde el formulario (no crea nada).
  @Get('validate')
  @Roles(Role.ADMIN, Role.STAFF)
  validate(@GymId() gymId: string, @Query() query: ValidateReferralQueryDto) {
    return this.service.validate(gymId, query.code, query.memberId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  apply(
    @GymId() gymId: string,
    @Body() dto: ApplyReferralDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.apply(gymId, dto.code, dto.referredMemberId, user.id);
  }
}
