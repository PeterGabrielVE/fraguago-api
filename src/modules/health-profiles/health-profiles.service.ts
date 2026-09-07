// src/health-profiles/health-profiles.service.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { UpsertMedicalProfileDto } from './dto/upsert-medical-profile.dto';


@Injectable()
export class HealthProfilesService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  /**
   * Verifica que el socio pertenezca al gym antes de tocar nada.
   * Esto evita que un gym lea/escriba la ficha de un socio de otro gym.
   */
  private async assertMemberInGym(gymId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, gymId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Socio no encontrado en este gimnasio');
    }
  }

  /**
   * GET /api/health-profiles?memberId=...
   * Devuelve la ficha médica del socio, o null si todavía no tiene.
   * Devolver null (no lanzar 404) le permite al formulario mostrarse vacío.
   */
  async findByMember(gymId: string, memberId: string) {
    await this.assertMemberInGym(gymId, memberId);

    return this.prisma.medicalProfile.findFirst({
      where: { memberId, gymId },
    });
  }

  /**
   * PUT /api/health-profiles?memberId=...
   * Crea la ficha si no existe, la actualiza si ya existe (upsert).
   * memberId es @unique en MedicalProfile, por eso el upsert funciona.
   */
  async upsert(
    gymId: string,
    memberId: string,
    dto: UpsertMedicalProfileDto,
  ) {
    await this.assertMemberInGym(gymId, memberId);

    return this.prisma.medicalProfile.upsert({
      where: { memberId },
      create: { gymId, memberId, ...dto },
      update: { ...dto },
    });
  }
}