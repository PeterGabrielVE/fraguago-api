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

@Controller('health-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HealthProfilesController {
  constructor(private readonly service: HealthProfilesService) {}

  @Get()
  find(@GymId() gymId: string, @Query('memberId') memberId: string) {
    return this.service.findByMember(gymId, memberId);
  }

  @Put()
  upsert(
    @GymId() gymId: string,
    @Query('memberId') memberId: string,
    @Body() dto: UpsertMedicalProfileDto,
  ) {
    return this.service.upsert(gymId, memberId, dto);
  }
}