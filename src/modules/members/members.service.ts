import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

function ageFrom(iso: string): number {
  const today = new Date();
  const dob = new Date(iso);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  // Note: EVERY method takes gymId and filters by it, so it is impossible
  // to read or touch a member from another gym.

  async create(gymId: string, dto: CreateMemberDto) {
    // VALIDATION: minor (business rule)
    if (dto.birthDate && ageFrom(dto.birthDate) < 18) {
      if (!dto.guardianName || !dto.guardianPhone) {
        throw new BadRequestException('Member is a minor: guardian info is required.');
      }
    }
    try {
      return await this.prisma.member.create({
        data: {
          gymId,
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
        },
      });
    } catch (e: any) {
      // VALIDATION: already exists (hits @@unique([gymId, phone/email]))
      if (e.code === 'P2002') {
        throw new ConflictException('That member is already registered in this gym.');
      }
      throw e;
    }
  }

  findAll(gymId: string) {
    return this.prisma.member.findMany({ where: { gymId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(gymId: string, id: string) {
    const member = await this.prisma.member.findFirst({ where: { id, gymId } });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  async update(gymId: string, id: string, dto: UpdateMemberDto) {
    await this.findOne(gymId, id);
    return this.prisma.member.update({
      where: { id },
      data: { ...dto, birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined },
    });
  }

  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.prisma.member.delete({ where: { id } });
  }

  // Minimal data for an ID card (name, id, gym, active membership).
  async cardData(gymId: string, id: string) {
    const member = await this.findOne(gymId, id);
    const membership = await this.prisma.membership.findFirst({
      where: { gymId, memberId: id, status: 'active' },
      orderBy: { endDate: 'desc' },
      include: { plan: { select: { name: true } } },
    });
    return { id: member.id, fullName: member.fullName, joinedAt: member.joinedAt, membership };
  }
}
