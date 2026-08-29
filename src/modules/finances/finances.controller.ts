import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { FinancesService } from './finances.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GymId } from '../../auth/decorators/gym-id.decorator';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancesController {
  constructor(private readonly service: FinancesService) {}

  @Post()
  create(@GymId() gymId: string, @Body() dto: CreateTransactionDto) { return this.service.create(gymId, dto); }

  @Get()
  findAll(@GymId() gymId: string, @Query('type') type?: TransactionType) { return this.service.findAll(gymId, type); }

  // Income vs expense vs balance — only owner/admin.
  @Get('summary')
  @Roles('OWNER', 'ADMIN')
  summary(@GymId() gymId: string) { return this.service.summary(gymId); }

  @Get(':id')
  findOne(@GymId() gymId: string, @Param('id') id: string) { return this.service.findOne(gymId, id); }

  @Patch(':id')
  update(@GymId() gymId: string, @Param('id') id: string, @Body() dto: UpdateTransactionDto) { return this.service.update(gymId, id, dto); }

  @Delete(':id')
  remove(@GymId() gymId: string, @Param('id') id: string) { return this.service.remove(gymId, id); }
}
