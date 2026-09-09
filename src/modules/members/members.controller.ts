import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";

import { MembersService } from "./members.service";

import { CreateMemberDto } from "./dto/create-member.dto";
import { ChangeStatusDto, UpdateMemberDto } from "./dto/update-member.dto";

import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/roles.guard";
import { GymId } from "../../auth/decorators/gym-id.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { Role } from "@prisma/client";
import { EmergencyContactResponseDto } from "./dto/emergency-contact-response.dto";
import { UpsertEmergencyContactDto } from "./dto/upsert-emergency-contact.dto";
import { UpsertMedicalProfileDto } from "./dto/upsert-medical-profile.dto";
import { SearchMembersDto } from "./dto/search-members.dto";

@Controller("members")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembersController {
  constructor(private readonly service: MembersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  create(@GymId() gymId: string, @Body() dto: CreateMemberDto) {
    return this.service.create(gymId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(@GymId() gymId: string, @Query() query: SearchMembersDto) {
    return this.service.findAll(gymId, query);
  }

  @Get(":id")
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(@GymId() gymId: string, @Param("id") id: string) {
    return this.service.findOne(gymId, id);
  }

  // Data for a member ID card.
  // The actual PDF/print is done in the frontend.
  @Get(":id/card")
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  card(@GymId() gymId: string, @Param("id") id: string) {
    return this.service.cardData(gymId, id);
  }

  @Patch(":id")
  @Roles(Role.ADMIN, Role.STAFF)
  update(
    @GymId() gymId: string,
    @Param("id") id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.service.update(gymId, id, dto);
  }

  @Delete(":id")
  @Roles(Role.ADMIN, Role.STAFF)
  remove(@GymId() gymId: string, @Param("id") id: string) {
    return this.service.remove(gymId, id);
  }

  @Patch(":id/status")
  @Roles(Role.ADMIN) // más restrictivo que el update normal
  changeStatus(
    @GymId() gymId: string,
    @Param("id") id: string,
    @Body() dto: ChangeStatusDto, // { status: MemberStatus }
  ) {
    return this.service.changeStatus(gymId, id, dto.status);
  }

  @Get(":id/emergency-contact")
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  getEmergencyContact(
    @GymId() gymId: string,
    @Param("id") id: string,
  ): Promise<EmergencyContactResponseDto> {
    return this.service.getEmergencyContact(gymId, id);
  }

  @Put(":id/emergency-contact")
  @Roles(Role.ADMIN, Role.STAFF)
  upsertEmergencyContact(
    @GymId() gymId: string,
    @Param("id") id: string,
    @Body() dto: UpsertEmergencyContactDto,
  ): Promise<EmergencyContactResponseDto> {
    return this.service.upsertEmergencyContact(gymId, id, dto);
  }

  @Get(":id/medical-profile")
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  getMedicalProfile(@Param("id") id: string) {
    return this.service.findByMember(id);
  }

  @Put(":id/medical-profile")
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  upsertMedicalProfile(
    @GymId() gymId: string,
    @Param("id") id: string,
    @Body() dto: UpsertMedicalProfileDto,
  ) {
    return this.service.upsertMedicalProfile(gymId, id, dto);
  }
}
