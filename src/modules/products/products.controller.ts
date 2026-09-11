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
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  // PROD-B02
  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  create(@GymId() gymId: string, @Body() dto: CreateProductDto) {
    return this.service.create(gymId, dto);
  }

  // PROD-B01
  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(@GymId() gymId: string, @Query() pagination: PaginationDto) {
    return this.service.findAll(gymId, pagination);
  }

  // PROD-B07 — DEBE ir antes de :id
  @Get('low-stock')
  @Roles(Role.ADMIN, Role.STAFF)
  lowStock(@GymId() gymId: string, @Query() query: LowStockQueryDto) {
    return this.service.lowStock(gymId, query);
  }

  // PROD-B03
  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.findOne(gymId, id);
  }

  // PROD-B04
  @Patch(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  update(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(gymId, id, dto);
  }

  // PROD-B06 — ajuste de stock
  @Patch(':id/stock')
  @Roles(Role.ADMIN, Role.STAFF)
  adjustStock(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.service.adjustStock(gymId, id, dto);
  }

  // PROD-B05
  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.remove(gymId, id);
  }
}