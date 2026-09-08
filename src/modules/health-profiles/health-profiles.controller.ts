import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HealthProfilesService } from './health-profiles.service';
import { UpsertMedicalProfileDto } from './dto/upsert-medical-profile.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('health-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HealthProfilesController {
  constructor(private readonly service: HealthProfilesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  find(
    @GymId() gymId: string, 
    @Query('memberId') memberId: string
  ) {
    return this.service.findByMember(gymId, memberId);
  }

  @Put()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  upsert(
    @GymId() gymId: string,
    @Query('memberId') memberId: string,
    @Body() dto: UpsertMedicalProfileDto,
  ) {
    return this.service.upsert(gymId, memberId, dto);
  }
}