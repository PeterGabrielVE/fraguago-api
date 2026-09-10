import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { MembershipsService } from "./memberships.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/roles.guard";
import { GymId } from "../../auth/decorators/gym-id.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { Role } from "@prisma/client";
import { AssignMembershipDto } from "./dto/assign-membership.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";

@Controller("members/:memberId/memberships")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MemberMembershipsController {
  constructor(private readonly service: MembershipsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  assign(
    @GymId() gymId: string,
    @Param("memberId") memberId: string,
    @Body() dto: AssignMembershipDto,
  ) {
    return this.service.assign(gymId, { memberId, ...dto });
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findByMember(
    @GymId() gymId: string,
    @Param("memberId") memberId: string,
    @Query() query: PaginationDto,
  ) {
    return this.service.findByMember(gymId, memberId, query);
  }
}
