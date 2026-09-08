import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF) // Permite a recepción/staff registrar nuevo inventario
  create(
    @GymId() g: string, 
    @Body() dto: any
  ) { 
    return this.service.create(g, dto); 
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER) // Todos pueden ver la lista de productos disponibles
  findAll(
    @GymId() g: string
  ) { 
    return this.service.findAll(g); 
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(
    @GymId() g: string, 
    @Param('id') id: string
  ) { 
    return this.service.findOne(g, id); 
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.STAFF) // Staff y Admin pueden actualizar precios, nombres o stock
  update(
    @GymId() g: string, 
    @Param('id') id: string, 
    @Body() dto: any
  ) { 
    return this.service.update(g, id, dto); 
  }

  @Delete(':id')
  @Roles(Role.ADMIN) // Solo Admin para evitar eliminar registros de productos accidentalmente
  remove(
    @GymId() g: string, 
    @Param('id') id: string
  ) { 
    return this.service.remove(g, id); 
  }
}