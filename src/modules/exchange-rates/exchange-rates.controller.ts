import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Currency, Role } from '@prisma/client';
import { ExchangeRatesService } from './exchange-rates.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('exchange-rates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExchangeRatesController {
  constructor(private readonly service: ExchangeRatesService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF) // staff registra la tasa del día
  create(@GymId() gymId: string, @Body() dto: CreateExchangeRateDto) {
    return this.service.create(gymId, dto);
  }

  // Debe ir antes de rutas con :id implícitas — no hay ninguna aquí, pero se mantiene el orden por convención.
  @Get('latest')
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  latest(@GymId() gymId: string) {
    return this.service.latest(gymId);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  findAll(
    @GymId() gymId: string,
    @Query() pagination: PaginationDto,
    @Query('currency') currency?: Currency,
  ) {
    return this.service.findAll(gymId, pagination, currency);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.remove(gymId, id);
  }
}
