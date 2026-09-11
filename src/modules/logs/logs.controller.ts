import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { LogsService } from './logs.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LogsController {
  constructor(private readonly service: LogsService) {}

  // AUDIT-B01
  @Get()
  @Roles(Role.OWNER, Role.ADMIN)
  findAll(@GymId() gymId: string, @Query() query: AuditQueryDto) {
    return this.service.findAll(gymId, query);
  }

  // AUDIT-B02
  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  findOne(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.findOne(gymId, id);
  }
}