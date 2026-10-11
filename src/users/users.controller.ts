import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Role } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolesDto } from './dto/update-roles.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { RolesGuard } from 'src/common/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GymId } from 'src/auth/decorators/gym-id.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  create(@GymId() gymId: string, @Body() dto: CreateUserDto, @CurrentUser() actor: any) {
    return this.service.create(gymId, dto, actor);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN)
  findAll(@GymId() gymId: string, @Query() pagination: PaginationDto) {
    return this.service.findAll(gymId, pagination);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  findOne(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.findOne(gymId, id);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(@GymId() gymId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(gymId, id, dto);
  }

  // :id/role — ruta más específica, Nest la resuelve antes que :id
  // Compatibilidad: reemplaza todos los roles por uno solo.
  @Patch(':id/role')
  @Roles(Role.OWNER, Role.ADMIN)
  updateRole(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: any,
  ) {
    return this.service.updateRoles(gymId, id, [dto.role], actor);
  }

  @Patch(':id/roles')
  @Roles(Role.OWNER, Role.ADMIN)
  updateRoles(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRolesDto,
    @CurrentUser() actor: any,
  ) {
    return this.service.updateRoles(gymId, id, dto.roles, actor);
  }

  @Patch(':id/password')
  @Roles(Role.OWNER, Role.ADMIN)
  changePassword(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() actor: any,
  ) {
    return this.service.changePassword(gymId, id, dto, actor);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(
    @GymId() gymId: string,
    @Param('id') id: string,
    @CurrentUser() actor: any,
  ) {
    return this.service.remove(gymId, id, actor.id);
  }
}