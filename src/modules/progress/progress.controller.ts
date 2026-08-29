import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';

@Controller('progress')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProgressController {
  constructor(private readonly service: ProgressService) {}
  @Post() create(@GymId() g: string, @Body() dto: any) { return this.service.create(g, dto); }
  @Get() findAll(@GymId() g: string) { return this.service.findAll(g); }
  @Get(':id') findOne(@GymId() g: string, @Param('id') id: string) { return this.service.findOne(g, id); }
  @Patch(':id') update(@GymId() g: string, @Param('id') id: string, @Body() dto: any) { return this.service.update(g, id, dto); }
  @Delete(':id') remove(@GymId() g: string, @Param('id') id: string) { return this.service.remove(g, id); }
}
