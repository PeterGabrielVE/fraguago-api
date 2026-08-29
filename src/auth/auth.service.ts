import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const profile = await this.prisma.profile.findFirst({
      where: {
        email,
      },
      include: {
        gym: true,
      },
    });

    if (!profile) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      password,
      profile.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: profile.id,
      email: profile.email,
      gymId: profile.gymId,
      role: profile.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        gymId: profile.gymId,
        gym: profile.gym,
      },
    };
  }

  async registerGym(input: {
    gymName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerName: string;
  }) {
    const existingUser = await this.prisma.profile.findFirst({
      where: {
        email: input.ownerEmail,
      },
    });

    if (existingUser) {
      throw new BadRequestException(
        'That email already has an account',
      );
    }

    const passwordHash = await bcrypt.hash(input.ownerPassword, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const gym = await tx.gym.create({
        data: {
          name: input.gymName,
        },
      });

      const profile = await tx.profile.create({
        data: {
          email: input.ownerEmail,
          passwordHash,
          gymId: gym.id,
          fullName: input.ownerName,
          role: 'OWNER',
        },
      });

      return {
        gym,
        profile,
      };
    });

    return {
      gymId: result.gym.id,
    };
  }
}