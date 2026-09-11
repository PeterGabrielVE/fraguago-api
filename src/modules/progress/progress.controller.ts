import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { UpdateMeasurementDto } from './dto/update-measurement.dto';

@Controller() // <--- Se deja vacío para usar rutas absolutas
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProgressController {
  constructor(private readonly service: ProgressService) {}

  // MEAS-B02
  @Post('members/:memberId/measurements')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  create(
    @GymId() gymId: string,
    @Param('memberId') memberId: string, // Extraído de la URL
    @Body() dto: CreateMeasurementDto
  ) {
    return this.service.create(gymId, memberId, dto);
  }

  // MEAS-B01
  @Get('members/:memberId/measurements')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(
    @GymId() gymId: string,
    @Param('memberId') memberId: string, // Extraído de la URL
    @Query() pagination: PaginationDto
  ) {
    return this.service.findAll(gymId, pagination, memberId);
  }

  // MEAS-B03
  @Get('measurements/:id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(
    @GymId() gymId: string,
    @Param('id') id: string
  ) {
    return this.service.findOne(gymId, id);
  }

  // MEAS-B04
  @Patch('measurements/:id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  update(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMeasurementDto
  ) {
    return this.service.update(gymId, id, dto);
  }

  // MEAS-B05
  @Delete('measurements/:id')
  @Roles(Role.ADMIN)
  remove(
    @GymId() gymId: string,
    @Param('id') id: string
  ) {
    return this.service.remove(gymId, id);
  }
}