import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SyncOperationDto } from './dto/sync-operation.dto';
import { SyncService } from './sync.service';

@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private readonly service: SyncService) {}

  // Cola de operaciones del modo offline. Responde 200 también cuando la
  // operación se rechaza por una regla de negocio (ver SyncResult).
  @Post('operations')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  apply(
    @GymId() gymId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncOperationDto,
  ) {
    return this.service.apply(gymId, user, dto);
  }
}
