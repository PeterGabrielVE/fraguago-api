import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import { AuthPrismaService } from "./auth-prisma.service";
import { PasswordService } from "./password.service";
import { AuthAuditService } from "./auth-audit.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { uniqueSlug } from "../common/slug";
import { userRoles } from "./user-roles";

// Token temporal entre "contraseña correcta" y "rol elegido". Solo sirve para
// /auth/select-role (lleva purpose) y vence rápido.
const ROLE_SELECTION_PURPOSE = "role-select";
const ROLE_SELECTION_TTL_SEC = 5 * 60;

type LoginContext = { ip?: string; userAgent?: string };

// Duración de los tokens (segundos). Se leen en cada llamada para respetar el
// .env aunque se cargue después de importar este módulo.
//  - Access: corto (15 min); el front lo renueva solo con el refresh token.
//  - Refresh: 7 días deslizantes (cada renovación emite uno nuevo). El cierre
//    por inactividad (30 min) lo controla el front con aviso previo.
export const accessTtlSec = () => Number(process.env.JWT_ACCESS_EXPIRES_SEC ?? 900);
export const refreshTtlSec = () => Number(process.env.JWT_REFRESH_EXPIRES_SEC ?? 604800);

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
    private readonly analytics: AnalyticsService,
  ) {}

  // =====================================================================
  // LOGIN
  // =====================================================================
  async login(
    email: string,
    password: string,
    ctx?: LoginContext,
    requestedRole?: Role,
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
        this.analytics.capture(user.id, "login_failed", { reason: "bad_password" }, user.gymId);
      }
      throw new UnauthorizedException("Invalid credentials");
    }

    const roles = userRoles(user);
    if (requestedRole) {
      return this.completeLogin(user, requestedRole, ctx);
    }
    if (roles.length === 1) {
      return this.completeLogin(user, roles[0], ctx);
    }

    // Varios roles: todavía no hay sesión, el usuario elige con cuál entrar.
    const selectionToken = await this.jwtService.signAsync(
      { sub: user.id, purpose: ROLE_SELECTION_PURPOSE },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ROLE_SELECTION_TTL_SEC },
    );
    return {
      roleSelectionRequired: true as const,
      roles,
      selectionToken,
      user: { firstName: user.profile?.firstName, email: user.email },
    };
  }

  // Segundo paso del login cuando el usuario tiene varios roles.
  async selectRole(selectionToken: string, role: Role, ctx?: LoginContext) {
    let payload: { sub: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(selectionToken, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException("La selección de rol expiró, vuelve a iniciar sesión");
    }
    if (payload.purpose !== ROLE_SELECTION_PURPOSE) {
      throw new UnauthorizedException("Invalid selection token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { gym: true, profile: true },
    });
    if (!user) throw new UnauthorizedException("Invalid selection token");
    return this.completeLogin(user, role, ctx);
  }

  private async completeLogin(
    user: {
      id: string;
      email: string;
      gymId: string;
      role: Role;
      roles: Role[];
      gym: unknown;
      profile: { firstName: string; lastName: string } | null;
    },
    role: Role,
    ctx?: LoginContext,
  ) {
    const roles = userRoles(user);
    if (!roles.includes(role)) {
      throw new ForbiddenException("No tienes ese rol asignado");
    }

    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      gymId: user.gymId,
      role,
    });

    await this.audit.log({
      gymId: user.gymId,
      userId: user.id,
      action: "LOGIN_SUCCESS",
      meta: { ip: ctx?.ip, userAgent: ctx?.userAgent, role },
    });

    this.analytics.identify(user.id, { role, gymId: user.gymId });
    this.analytics.groupIdentify(user.gymId, { name: (user.gym as { name?: string } | null)?.name });
    this.analytics.capture(user.id, "user_logged_in", { role }, user.gymId);

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
        // role = rol con el que entró en esta sesión.
        role,
        roles,
        gymId: user.gymId,
        gym: user.gym,
      },
    };
  }

  // =====================================================================
  // ROLES DE LA SESIÓN
  // =====================================================================
  // Roles actuales del usuario (desde la BD, no del token: pueden haber cambiado).
  async myRoles(userId: string, activeRole: Role) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, roles: true },
    });
    if (!user) throw new UnauthorizedException();
    return { active: activeRole, roles: userRoles(user) };
  }

  // Datos de la sesión más el nombre del perfil, para que cualquier rol pueda
  // mostrar quién está conectado sin pasar por /users (solo OWNER/ADMIN).
  async me(actor: { id: string; email: string; gymId: string; role: Role }) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { profile: { select: { firstName: true, lastName: true } } },
    });
    if (!user) throw new UnauthorizedException();
    return {
      ...actor,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
    };
  }

  // Cambia el rol de la sesión sin pedir la contraseña: ya está autenticado y
  // solo puede pasar a un rol que tenga asignado. Rota los tokens.
  async switchRole(
    actor: { id: string; gymId: string; role: Role },
    role: Role,
    refreshToken?: string,
    ctx?: { ip?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: { profile: true },
    });
    if (!user || user.gymId !== actor.gymId) throw new UnauthorizedException();
    const roles = userRoles(user);
    if (!roles.includes(role)) {
      throw new ForbiddenException("No tienes ese rol asignado");
    }

    // El refresh de la sesión anterior queda inválido: la nueva lleva otro rol.
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id, tokenHash: this.hashToken(refreshToken), revoked: false },
        data: { revoked: true },
      });
    }

    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      gymId: user.gymId,
      role,
    });

    await this.audit.log({
      gymId: user.gymId,
      userId: user.id,
      action: "ROLE_SWITCHED",
      meta: { from: actor.role, to: role, ip: ctx?.ip },
    });
    this.analytics.capture(user.id, "role_switched", { from: actor.role, to: role }, user.gymId);

    return { ...tokens, user: { id: user.id, role, roles } };
  }

  async forgotPassword(email: string) {
    return {
      message: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña",
    };
  }

  // =====================================================================
  // REFRESH
  // =====================================================================
  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token");
    }

    let payload: { sub: string; role?: Role };
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

    // La sesión conserva el rol con el que se entró. Si ya no lo tiene (se lo
    // quitaron), se corta: debe volver a entrar y elegir otro.
    const role = payload.role ?? user.role; // tokens previos a roles múltiples
    if (!userRoles(user).includes(role)) {
      throw new UnauthorizedException("Role no longer assigned");
    }

    await this.audit.log({
      gymId: user.gymId,
      userId: user.id,
      action: 'TOKEN_REFRESH',
    });
    return this.issueTokens({
      sub: user.id,
      email: user.email,
      gymId: user.gymId,
      role,
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
      this.analytics.capture(actor.id, "user_logged_out", {}, actor.gymId);
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

    // Nombre corto para los enlaces públicos (/registro/<slug>); el dueño
    // puede cambiarlo después en Configuración.
    const slug = await uniqueSlug(input.gymName, async (candidate) =>
      Boolean(await this.prisma.gym.findUnique({ where: { slug: candidate }, select: { id: true } })),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const gym = await tx.gym.create({ data: { name: input.gymName, slug } });
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

    this.analytics.identify(result.user.id, { role: "OWNER", gymId: result.gym.id });
    this.analytics.groupIdentify(result.gym.id, { name: result.gym.name, createdAt: result.gym.createdAt });
    this.analytics.capture(result.user.id, "gym_registered", {}, result.gym.id);

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
      expiresIn: accessTtlSec(),
    };

    const refreshOptions: JwtSignOptions = {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: refreshTtlSec(),
    };

    const accessToken = await this.jwtService.signAsync(payload, accessOptions);

    const refreshToken = await this.jwtService.signAsync(
      // role: rol activo de la sesión, para mantenerlo al renovar.
      { sub: payload.sub, role: payload.role, jti: randomBytes(16).toString("hex") },
      refreshOptions,
    );

    // Misma vigencia que el JWT y la cookie (antes fija en 7 días).
    const expiresAt = new Date(Date.now() + refreshTtlSec() * 1000);
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
