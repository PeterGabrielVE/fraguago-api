import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { RemindersService } from "./reminders.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { GymId } from "../../auth/decorators/gym-id.decorator";
import { Role } from "@prisma/client";
import { WhatsappService } from "./whatsapp.service";

@Controller("reminders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RemindersController {
  constructor(
    private readonly service: RemindersService,
    private readonly whatsapp: WhatsappService,
  ) {}

  // The daily "who to charge" list, each with a ready-to-send WhatsApp link.
  // GET /api/reminders?days=7
  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  list(@GymId() gymId: string, @Query("days") days?: string) {
    return this.service.buildForGym(gymId, days ? Number(days) : 7);
  }

  @Post("test-whatsapp")
  @Roles(Role.OWNER, Role.ADMIN)
  async testWhatsapp() {
    const ok = await this.whatsapp.sendTemplate(
      "584245710793", // ej: 584141234567 (tu número, el que registraste en Meta)
      "hello_world", // plantilla de fábrica, ya aprobada
      [], // hello_world no tiene variables
      "en_US", // hello_world está en inglés
    );
    return { enviado: ok };
  }
}
