import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MembershipsService } from '../modules/memberships/memberships.service';
import { AttendanceService } from '../modules/attendance/attendance.service';
import { RoutinesService } from '../modules/routines/routines.service';
import { ProgressService } from '../modules/progress/progress.service';
import { GamificationService } from '../modules/gamification/gamification.service';
import { RewardsService } from '../modules/gamification/rewards.service';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

// Portal de autoservicio: expone a un socio (Role.MEMBER) SOLO sus propios
// datos. Reutiliza al máximo los servicios ya existentes de cada módulo en
// vez de reimplementar queries/validaciones (p. ej. "membresía vigente" en
// el check-in vive únicamente en AttendanceService).
@Injectable()
export class PortalService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly usersService: UsersService,
    private readonly membershipsService: MembershipsService,
    private readonly attendanceService: AttendanceService,
    private readonly routinesService: RoutinesService,
    private readonly progressService: ProgressService,
    private readonly gamificationService: GamificationService,
    private readonly rewardsService: RewardsService,
  ) {}

  // Resuelve el Member vinculado al User autenticado. Protege contra un
  // usuario con rol MEMBER sin fila Member asociada (dato corrupto).
  private async resolveMemberId(gymId: string, userId: string): Promise<string> {
    const member = await this.prisma.member.findFirst({
      where: { userId, gymId },
    });
    if (!member) {
      throw new NotFoundException('No se encontró un socio asociado a este usuario');
    }
    return member.id;
  }

  // userId de un socio ES el User.id, y UsersService.findOne ya filtra por gymId.
  getProfile(gymId: string, userId: string) {
    return this.usersService.findOne(gymId, userId);
  }

  updateProfile(gymId: string, userId: string, dto: UpdateUserDto) {
    return this.usersService.update(gymId, userId, dto);
  }

  async getMembership(gymId: string, userId: string, pagination: PaginationDto) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.membershipsService.findByMember(gymId, memberId, pagination);
  }

  async getAttendances(gymId: string, userId: string) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.attendanceService.ofMember(gymId, memberId);
  }

  // Reutiliza tal cual la validación de "membresía vigente hoy" de
  // AttendanceService.checkIn, sin duplicarla.
  async checkIn(gymId: string, userId: string) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.attendanceService.checkIn(gymId, memberId);
  }

  // RoutinesService.findByMember (ROUT-B06) ya existía pero no estaba
  // expuesto por ningún controller; se expone acá por primera vez.
  async getRoutine(gymId: string, userId: string) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.routinesService.findByMember(gymId, memberId);
  }

  async getProgress(gymId: string, userId: string, pagination: PaginationDto) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.progressService.findAll(gymId, pagination, memberId);
  }

  // --- Gamificación (GAM-B02 / GAM-01 / GAM-F02) ---

  async getGamification(gymId: string, userId: string) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.gamificationService.summary(gymId, memberId);
  }

  async getPoints(gymId: string, userId: string, pagination: PaginationDto) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.gamificationService.pointsHistory(
      gymId,
      memberId,
      pagination.page ?? 1,
      pagination.pageSize ?? 20,
    );
  }

  async getUnseenBadges(gymId: string, userId: string) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.gamificationService.unseenBadges(gymId, memberId);
  }

  async markBadgesSeen(gymId: string, userId: string, ids?: string[]) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.gamificationService.markBadgesSeen(gymId, memberId, ids);
  }

  async getRewards(gymId: string, userId: string) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.rewardsService.catalogFor(gymId, memberId);
  }

  async redeemReward(gymId: string, userId: string, rewardId: string) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.rewardsService.redeem(gymId, memberId, rewardId);
  }

  async getRedemptions(gymId: string, userId: string) {
    const memberId = await this.resolveMemberId(gymId, userId);
    return this.rewardsService.memberRedemptions(gymId, memberId);
  }
}
