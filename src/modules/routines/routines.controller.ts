import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';

@Controller('routines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoutinesController {
  constructor(private readonly service: RoutinesService) {}

  @Post()
  create(@GymId() gymId: string, @Body() dto: any) { return this.service.create(gymId, dto); }

  @Get()
  findAll(@GymId() gymId: string) { return this.service.findAll(gymId); }

  @Get(':id')
  findOne(@GymId() gymId: string, @Param('id') id: string) { return this.service.findOne(gymId, id); }

  @Patch(':id')
  update(@GymId() gymId: string, @Param('id') id: string, @Body() dto: any) { return this.service.update(gymId, id, dto); }

  @Delete(':id')
  remove(@GymId() gymId: string, @Param('id') id: string) { return this.service.remove(gymId, id); }
}
