import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import { AuthPrismaService } from "./auth-prisma.service";
import { PasswordService } from "./password.service";
import { AuthAuditService } from "./auth-audit.service";

@Injectable()
export class AuthService {
  // Hash bcrypt real para igualar el tiempo de cómputo cuando el email
  // no existe (evita enumeración de usuarios por timing). Reemplázalo por
  // uno generado en tu entorno (ver nota abajo).
  private readonly DUMMY_HASH =
    "$2b$12$Qj/b6I7d6tI7S7juF0qcjOv76BMt3vgDyd8Zn6peXnjMvOA5QWota";

  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly jwtService: JwtService,
    private readonly passwords: PasswordService,
    private readonly audit: AuthAuditService,
  ) {}

  // =====================================================================
  // LOGIN
  // =====================================================================
  async login(
    email: string,
    password: string,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { gym: true, profile: true },
    });

    // Comparamos SIEMPRE (contra el dummy si no hay user) para que el tiempo
    // de respuesta no revele si el email existe.
    const hashToCompare = user?.passwordHash ?? this.DUMMY_HASH;
    const passwordValid = await this.passwords.verify(password, hashToCompare);

    if (!user || !passwordValid) {
      if (user) {
        await this.audit.log({
          gymId: user.gymId,
          userId: user.id,
          action: "LOGIN_FAILED",
          meta: { email, reason: "bad_password", ip: ctx?.ip },
        });
      }
      throw new UnauthorizedException("Invalid credentials");
    }

    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      gymId: user.gymId,
      role: user.role,
    });

    await this.audit.log({
      gymId: user.gymId,
      userId: user.id,
      action: "LOGIN_SUCCESS",
      meta: { ip: ctx?.ip, userAgent: ctx?.userAgent },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName,
        fullName: user.profile
          ? `${user.profile.firstName} ${user.profile.lastName}`
          : undefined,
        role: user.role,
        gymId: user.gymId,
        gym: user.gym,
      },
    };
  }

  // =====================================================================
  // REFRESH
  // =====================================================================
  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token");
    }

    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Buscamos SIN filtrar por revoked, para poder detectar reuso.
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Token ya revocado que se reusa → posible robo: quemamos todo.
    if (stored.revoked) {
      const u = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (u) {
        await this.audit.log({
          gymId: u.gymId,
          userId: u.id,
          action: 'TOKEN_REUSE_DETECTED',
          meta: { severity: 'high' },
        });
      }
      await this.logoutAll(payload.sub);
      throw new UnauthorizedException("Refresh token reuse detected");
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    // Rotación: revocamos el actual antes de emitir el nuevo.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException("Invalid refresh token");

    await this.audit.log({
      gymId: user.gymId,
      userId: user.id,
      action: 'TOKEN_REFRESH',
    });
    return this.issueTokens({
      sub: user.id,
      email: user.email,
      gymId: user.gymId,
      role: user.role,
    });
  }

  // =====================================================================
  // LOGOUT (revoca un refresh token)
  // =====================================================================
  async logout(
    refreshToken: string | undefined,
    actor?: { id: string; gymId: string },
    ctx?: { ip?: string },
  ) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revoked: false },
        data: { revoked: true },
      });
    }

    if (actor) {
      await this.audit.log({
        gymId: actor.gymId,
        userId: actor.id,
        action: "LOGOUT",
        meta: { ip: ctx?.ip },
      });
    }
    return { success: true };
  }

  // =====================================================================
  // LOGOUT ALL (revoca TODOS los refresh tokens del usuario)
  // =====================================================================
  async logoutAll(
    userId: string,
    actor?: { gymId: string },
    ctx?: { ip?: string },
  ) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    if (actor) {
      await this.audit.log({
        gymId: actor.gymId,
        userId,
        action: "LOGOUT_ALL",
        meta: { ip: ctx?.ip },
      });
    }
    return { success: true };
  }

  // =====================================================================
  // REGISTER GYM
  // =====================================================================
  async registerGym(input: {
    gymName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerName: string;
  }) {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: input.ownerEmail },
    });
    if (existingUser) {
      throw new BadRequestException("That email already has an account");
    }

    // Ahora vía PasswordService (valida el límite de 72 bytes de bcrypt).
    const passwordHash = await this.passwords.hash(input.ownerPassword);

    const [firstName, ...lastNameParts] = input.ownerName.trim().split(/\s+/);
    const lastName = lastNameParts.join(" ");

    const result = await this.prisma.$transaction(async (tx) => {
      const gym = await tx.gym.create({ data: { name: input.gymName } });
      const user = await tx.user.create({
        data: {
          email: input.ownerEmail,
          passwordHash,
          gymId: gym.id,
          role: "OWNER",
          profile: {
            create: {
              firstName,
              lastName: lastName || firstName,
              gymId: gym.id,
            },
          },
        },
        include: { profile: true },
      });
      return { gym, user };
    });

    return { gymId: result.gym.id, userId: result.user.id };
  }

  // =====================================================================
  // HELPERS
  // =====================================================================
  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async issueTokens(payload: {
    sub: string;
    email: string;
    gymId: string;
    role: string;
  }) {
    const accessOptions: JwtSignOptions = {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: Number(process.env.JWT_ACCESS_EXPIRES_SEC ?? 900), 
    };

    const refreshOptions: JwtSignOptions = {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: Number(process.env.JWT_REFRESH_EXPIRES_SEC ?? 604800),
    };

    const accessToken = await this.jwtService.signAsync(payload, accessOptions);

    const refreshToken = await this.jwtService.signAsync(
      { sub: payload.sub, jti: randomBytes(16).toString("hex") },
      refreshOptions,
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}
