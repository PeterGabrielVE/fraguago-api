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
import { TrainersService } from './trainers.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateTrainerDto } from './dto/update-trainer.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('trainers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrainersController {
  constructor(private readonly service: TrainersService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  create(@GymId() gymId: string, @Body() dto: CreateTrainerDto) {
    return this.service.create(gymId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(@GymId() gymId: string, @Query() pagination: PaginationDto) {
    return this.service.findAll(gymId, pagination);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.findOne(gymId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTrainerDto,
  ) {
    return this.service.update(gymId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.remove(gymId, id);
  }
}