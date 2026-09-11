import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SalesService } from "./sales.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/roles.guard";
import { GymId } from "../../auth/decorators/gym-id.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { Role } from "@prisma/client";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../../auth/decorators/current-user.decorator"; // ajustá la ruta si difiere
import { CreateSaleDto } from "./dto/create-sale.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Controller("sales")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF) // recepción y admin registran ventas
  create(
    @GymId() gymId: string,
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(gymId, dto, user.id);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  findAll(@GymId() gymId: string, @Query() pagination: PaginationDto) {
    return this.service.findAll(gymId, pagination);
  }

  @Get("today")
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  today(@GymId() gymId: string) {
    return this.service.today(gymId);
  }

  // SALE-B05 — resumen de ventas (ANTES de :id)
  @Get("summary")
  @Roles(Role.OWNER, Role.ADMIN)
  summary(
    @GymId() gymId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.summary(gymId, from, to);
  }

  @Get(":id")
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  findOne(@GymId() gymId: string, @Param("id") id: string) {
    return this.service.findOne(gymId, id);
  }
}
