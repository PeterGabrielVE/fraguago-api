import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { MembersService } from "./members.service";
import { PublicRegisterMemberDto } from "./dto/public-register-member.dto";
import { Public } from "../../auth/decorators/public.decorator";
import { PublicCheckInThrottlerGuard } from "../attendance/public-check-in.limiter";

// Formulario público de inscripción: el gym comparte el enlace
// /registro/<slug> y cada socio llena su ficha. Sin token: el gym sale de la
// URL (su slug o, por compatibilidad, su id). Reusa el guard por IP + gym de
// la pantalla de asistencia, con límites más bajos porque nadie se inscribe
// varias veces por minuto (salvo varios socios desde el Wi-Fi del gym, de ahí
// el margen). El parámetro se llama gymId porque el guard lo usa para separar
// la cuenta por gym.
@Controller("public/members/:gymId")
@Public()
@UseGuards(PublicCheckInThrottlerGuard)
@Throttle({
  burst: { ttl: 10_000, limit: 3 },
  sustained: { ttl: 60_000, limit: 10 },
})
export class PublicMembersController {
  constructor(private readonly service: MembersService) {}

  // GET /public/members/:slug — nombre del gym para el encabezado.
  @Get()
  gym(@Param("gymId") gymRef: string) {
    return this.service.publicGym(gymRef);
  }

  // POST /public/members/:slug/register — el socio envía su ficha.
  @Post("register")
  register(
    @Param("gymId") gymRef: string,
    @Body() dto: PublicRegisterMemberDto,
  ) {
    return this.service.publicRegister(gymRef, dto);
  }
}
