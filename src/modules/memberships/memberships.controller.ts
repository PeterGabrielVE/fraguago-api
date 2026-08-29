import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';

@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly service: MembershipsService) {}

  @Post()
  assign(@GymId() gymId: string, @Body() dto: { memberId: string; planId: string; startDate?: string }) {
    return this.service.assign(gymId, dto);
  }

  @Get()
  findAll(@GymId() gymId: string) { return this.service.findAll(gymId); }

  // GET /api/memberships/expiring?days=7
  @Get('expiring')
  expiring(@GymId() gymId: string, @Query('days') days?: string) {
    return this.service.expiring(gymId, days ? Number(days) : 7);
  }
}
