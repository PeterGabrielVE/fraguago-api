import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { MembersService } from './members.service';

import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';

@Controller('members')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembersController {
  constructor(private readonly service: MembersService) {}

  @Post()
  create(
    @GymId() gymId: string,
    @Body() dto: CreateMemberDto,
  ) {
    return this.service.create(gymId, dto);
  }

  @Get()
  findAll(@GymId() gymId: string) {
    return this.service.findAll(gymId);
  }

  @Get(':id')
  findOne(
    @GymId() gymId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(gymId, id);
  }

  // Data for a member ID card.
  // The actual PDF/print is done in the frontend.
  @Get(':id/card')
  card(
    @GymId() gymId: string,
    @Param('id') id: string,
  ) {
    return this.service.cardData(gymId, id);
  }

  @Patch(':id')
  update(
    @GymId() gymId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.service.update(gymId, id, dto);
  }

  @Delete(':id')
  remove(
    @GymId() gymId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(gymId, id);
  }
}