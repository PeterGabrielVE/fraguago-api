import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { AuthPrismaService } from "./auth-prisma.service";


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
      where: {
        email,
      },
      include: {
        gym: true,
        profile: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const payload = {
      sub: user.id,
      email: user.email,
      gymId: user.gymId,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
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

  private splitFullName(fullName: string) {
    const normalizedName = fullName.trim().replace(/\s+/g, " ");

    if (!normalizedName) {
      return {
        firstName: "",
        lastName: "",
      };
    }

    const parts = normalizedName.split(" ");

    if (parts.length === 1) {
      return {
        firstName: parts[0],
        lastName: "",
      };
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
    };
  }
}
