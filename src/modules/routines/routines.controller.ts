import {
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
import { RoutinesService } from './routines.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('routines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoutinesController {
  constructor(private readonly service: RoutinesService) {}

  // ROUT-B02
  @Post()
  @Roles(Role.ADMIN, Role.TRAINER)
  create(@GymId() gymId: string, @Body() dto: CreateRoutineDto) {
    return this.service.create(gymId, dto);
  }

  // ROUT-B01
  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(@GymId() gymId: string, @Query() pagination: PaginationDto) {
    return this.service.findAll(gymId, pagination);
  }

  // ROUT-B03
  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.findOne(gymId, id);
  }

  // ROUT-B04
  @Patch(':id')
  @Roles(Role.ADMIN, Role.TRAINER)
  update(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoutineDto,
  ) {
    return this.service.update(gymId, id, dto);
  }

  // ROUT-B05
  @Delete(':id')
  @Roles(Role.ADMIN, Role.TRAINER)
  remove(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.remove(gymId, id);
  }
}