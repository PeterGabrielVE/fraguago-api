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
import { TransactionType, Role } from '@prisma/client';
import { FinancesService } from './finances.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancesController {
  constructor(private readonly service: FinancesService) {}

  // FIN-B03
  @Post()
  @Roles(Role.ADMIN, Role.STAFF) // Staff necesita registrar pagos
  create(@GymId() gymId: string, @Body() dto: CreateTransactionDto) {
    return this.service.create(gymId, dto);
  }

  // FIN-B02 — listado paginado con filtro opcional ?type=INCOME|EXPENSE
  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  findAll(
    @GymId() gymId: string,
    @Query() pagination: PaginationDto,
    @Query('type') type?: TransactionType,
  ) {
    return this.service.findAll(gymId, pagination, type);
  }

  // FIN-B07 — income vs expense vs balance (solo owner/admin)
  @Get('summary')
  @Roles(Role.OWNER, Role.ADMIN)
  summary(
    @GymId() gymId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.summary(gymId, from, to);
  }

  // FIN-B04
  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  findOne(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.findOne(gymId, id);
  }

  // FIN-B05
  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN) // Protege registros financieros
  update(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.service.update(gymId, id, dto);
  }

  // FIN-B06
  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN) // Protege registros financieros
  remove(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.remove(gymId, id);
  }
}