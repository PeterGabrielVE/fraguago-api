import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { PasswordService } from '../../auth/password.service';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateTrainerDto } from './dto/update-trainer.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class TrainersService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly passwords: PasswordService, // para hashear en el modo "crear"
  ) {}

  private readonly userInclude = {
    user: {
      select: {
        email: true,
        role: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    },
  } as const;

  // TRAIN-B02 — crea un trainer en dos modos: promover o crear desde cero.
  async create(gymId: string, dto: CreateTrainerDto) {
    if (dto.userId) {
      return this.promoteExistingUser(gymId, dto);
    }
    return this.createNewUserTrainer(gymId, dto);
  }

  // --- MODO A: promover un usuario que ya existe (MEMBER, STAFF, etc.) ---
  private async promoteExistingUser(gymId: string, dto: CreateTrainerDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, gymId },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado en este gimnasio');
    }

    const alreadyTrainer = await this.prisma.trainer.findFirst({
      where: { userId: dto.userId },
    });
    if (alreadyTrainer) {
      throw new ConflictException('Ese usuario ya está registrado como entrenador');
    }

    // Transacción: subimos el rol a TRAINER y creamos el registro Trainer.
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dto.userId },
        data: { role: Role.TRAINER },
      });

      return tx.trainer.create({
        data: { gymId, userId: dto.userId!, specialty: dto.specialty },
        include: this.userInclude,
      });
    });
  }

  // --- MODO B: crear User + Profile + Trainer desde cero ---
  private async createNewUserTrainer(gymId: string, dto: CreateTrainerDto) {
    // Validamos que vengan los datos mínimos para crear una persona.
    if (!dto.email || !dto.password || !dto.firstName) {
      throw new BadRequestException(
        'Para crear un entrenador nuevo se requieren email, password y firstName (o enviá un userId existente).',
      );
    }

    // Email único dentro del gym (tu schema tiene @@unique([gymId, email])).
    const existing = await this.prisma.user.findFirst({
      where: { gymId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email en este gimnasio');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          gymId,
          email: dto.email!,
          passwordHash,
          role: Role.TRAINER,
          profile: {
            create: {
              gymId,
              firstName: dto.firstName!,
              lastName: dto.lastName || dto.firstName!,
            },
          },
        },
      });

      return tx.trainer.create({
        data: { gymId, userId: user.id, specialty: dto.specialty },
        include: this.userInclude,
      });
    });
  }

  // TRAIN-B01
  async findAll(gymId: string, { page = 1, pageSize = 20 }: PaginationDto) {
    const where = { gymId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.trainer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.userInclude,
      }),
      this.prisma.trainer.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  // TRAIN-B03
  async findOne(gymId: string, id: string) {
    const row = await this.prisma.trainer.findFirst({
      where: { id, gymId },
      include: this.userInclude,
    });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  // TRAIN-B04
  async update(gymId: string, id: string, dto: UpdateTrainerDto) {
    await this.findOne(gymId, id);
    return this.prisma.trainer.update({ where: { id }, data: dto });
  }

  // TRAIN-B05
  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.prisma.trainer.delete({ where: { id } });
  }
}