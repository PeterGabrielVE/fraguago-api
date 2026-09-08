import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { AuthPrismaService } from "./auth-prisma.service";
import { createHash, randomBytes } from "crypto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // =====================================================================
  // LOGIN
  // =====================================================================

    async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { gym: true, profile: true },
    });

    if (!user) throw new UnauthorizedException("Invalid credentials");

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedException("Invalid credentials");

    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      gymId: user.gymId,
      role: user.role,
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
  // REFRESH  ← el nuevo endpoint
  // =====================================================================
  async refresh(refreshToken?: string) {

    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token");
    }
    // 1) Verificar firma y expiración del JWT
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // 2) Buscar el token guardado (por su hash) y que no esté revocado
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revoked: false },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (stored.revoked) {
      // token ya usado antes → posible robo
      await this.logoutAll(payload.sub);
      throw new UnauthorizedException("Refresh token reuse detected");
    }


    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    // 3) Rotación: revocamos el actual antes de emitir uno nuevo
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    // 4) Traer datos frescos del usuario (rol/gym pueden haber cambiado)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException("Invalid refresh token");

    // 5) Emitir par de tokens nuevo
    return this.issueTokens({
      sub: user.id,
      email: user.email,
      gymId: user.gymId,
      role: user.role,
    });
  }

  // =====================================================================
  // LOGOUT  (revoca el refresh token)
  // =====================================================================
  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
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
      where: {
        email: input.ownerEmail,
      },
    });

    if (existingUser) {
      throw new BadRequestException("That email already has an account");
    }

    const passwordHash = await bcrypt.hash(input.ownerPassword, 12);

    const [firstName, ...lastNameParts] = input.ownerName.trim().split(/\s+/);
    const lastName = lastNameParts.join(" ");

    const result = await this.prisma.$transaction(async (tx) => {
      const gym = await tx.gym.create({
        data: {
          name: input.gymName,
        },
      });

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
        include: {
          profile: true,
        },
      });

      return {
        gym,
        user,
      };
    });

    return {
      gymId: result.gym.id,
      userId: result.user.id,
    };
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
      expiresIn: (process.env.JWT_ACCESS_EXPIRES ?? "15m") as JwtSignOptions["expiresIn"],
    };

    const refreshOptions: JwtSignOptions = {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES ?? "7d") as JwtSignOptions["expiresIn"],
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

   // =====================================================================
  // LOGOUT ALL (revoca TODOS los refresh tokens del usuario)
  // =====================================================================
  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    return { success: true };
  }
}
