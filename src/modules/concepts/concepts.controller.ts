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
import { ConceptsService } from './concepts.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateConceptDto } from './dto/create-concept.dto';
import { UpdateConceptDto } from './dto/update-concept.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';


@Controller('concepts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConceptsController {
  constructor(private readonly service: ConceptsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  create(@GymId() gymId: string, @Body() dto: CreateConceptDto) {
    return this.service.create(gymId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(@GymId() gymId: string, @Query() query: PaginationDto) {
    return this.service.findAll(gymId, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.findOne(gymId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN) // Restringido solo a ADMIN (ajusta si STAFF también debe editar)
  update(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConceptDto,
  ) {
    return this.service.update(gymId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN) // Restringido solo a ADMIN para evitar borrados accidentales
  remove(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.remove(gymId, id);
  }
}