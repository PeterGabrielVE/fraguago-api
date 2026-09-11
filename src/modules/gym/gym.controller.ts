import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { GymService } from './gym.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UpdateGymDto } from './dto/update-gym.dto';

@Controller('gym')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GymController {
  constructor(private readonly service: GymService) {}

  // GYM-B01
  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  findMine(@GymId() gymId: string) {
    return this.service.findMine(gymId);
  }

  // GYM-B02
  @Patch()
  @Roles(Role.OWNER, Role.ADMIN)
  update(@GymId() gymId: string, @Body() dto: UpdateGymDto) {
    return this.service.update(gymId, dto);
  }
}