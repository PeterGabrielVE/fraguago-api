import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";

import { AuthService } from "./auth.service";
import { LoginDto, RegisterGymDto, RefreshDto } from "./dto/auth.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { Request, Response } from 'express';

const REFRESH_COOKIE = "refresh_token";

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // solo HTTPS en prod
  sameSite: "lax" as const, // 'none' si front y back están en dominios distintos (+ secure:true)
  path: '/api/auth', // la cookie solo se manda a rutas /auth
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
};

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...rest } = await this.auth.login(
      dto.email,
      dto.password,
    );
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    // devolvemos accessToken + user, PERO no el refresh (ya va en la cookie)
    return rest;
  }

  @Public()
  @Post("register-gym")
  registerGym(@Body() dto: RegisterGymDto) {
    return this.auth.registerGym(dto);
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
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    return rest; // solo el accessToken nuevo
  }


  @Post("logout")
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await this.auth.logout(token);
    // limpiar la cookie (mismas opciones, si no el navegador no la borra)
    res.clearCookie(REFRESH_COOKIE, {
      ...refreshCookieOptions,
      maxAge: undefined,
    });
    return { success: true };
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: any) {
    return this.auth.logoutAll(user.id ?? user.sub);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return user;
  }
}
