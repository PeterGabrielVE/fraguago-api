import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

import { AuthService, refreshTtlSec } from "./auth.service";
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterGymDto,
  RefreshDto,
} from "./dto/auth.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { Request, Response } from "express";

const REFRESH_COOKIE = "refresh_token";

// SameSite: "lax" sirve cuando la web hace de proxy de /api (mismo origen).
// Si web y API se sirven en dominios distintos sin proxy, usar
// REFRESH_COOKIE_SAMESITE=none (exige HTTPS): con "lax" el navegador no manda
// la cookie en el fetch cross-site, el refresh falla y la sesión se cae a los
// 15 min del access token.
const refreshCookieOptions = () => {
  const sameSite = (process.env.REFRESH_COOKIE_SAMESITE ?? "lax") as "lax" | "strict" | "none";
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    path: "/api/auth", // la cookie solo se manda a rutas /auth
    maxAge: refreshTtlSec() * 1000,
  };
};

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...rest } = await this.auth.login(
      dto.email,
      dto.password,
      { ip: req.ip, userAgent: req.get("User-Agent") },
    );
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    // devolvemos accessToken + user, PERO no el refresh (ya va en la cookie)
    return rest;
  }

  @Public()
  @Post("register-gym")
  registerGym(@Body() dto: RegisterGymDto) {
    return this.auth.registerGym(dto);
  }

  @Public()
  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const { refreshToken, ...rest } = await this.auth.refresh(token);
    // rotación: seteamos el refresh nuevo en la cookie
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return rest; // solo el accessToken nuevo
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    await this.auth.logout(
      token,
      { id: user.id, gymId: user.gymId },
      { ip: req.ip },
    );
    res.clearCookie(REFRESH_COOKIE, {
      ...refreshCookieOptions(),
      maxAge: undefined,
    });
    return { success: true };
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(user.id, { gymId: user.gymId }, { ip: req.ip });
    res.clearCookie(REFRESH_COOKIE, {
      ...refreshCookieOptions(),
      maxAge: undefined,
    });
    return { success: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return user;
  }
}
