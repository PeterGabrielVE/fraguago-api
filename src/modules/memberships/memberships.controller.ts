import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RenewMembershipDto } from './dto/renew-membership.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';

@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly service: MembershipsService) {}

  // Listado global. La asignación  vive en MemberMembershipsController
  // bajo /members/:memberId/memberships.
  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(@GymId() gymId: string, @Query() query: PaginationDto) {
    return this.service.findAll(gymId, query);
  }


  @Get('expiring')
  @Roles(Role.ADMIN, Role.STAFF)
  expiring(
    @GymId() gymId: string,
    @Query('days') days?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.expiring(
      gymId,
      days ? Number(days) : 7,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }


  @Get('expired')
  @Roles(Role.ADMIN, Role.STAFF)
  expired(
    @GymId() gymId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.expired(
      gymId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Post(':id/renew')
  @Roles(Role.ADMIN, Role.STAFF)
  renew(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: RenewMembershipDto,
  ) {
    return this.service.renew(gymId, id, dto);
  }
}