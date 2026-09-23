import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AutomationsService } from './automations.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { TEMPLATE_VARIABLES } from '../messaging/template';
import { CreateAutomatedMessageDto } from './dto/create-automated-message.dto';
import { UpdateAutomatedMessageDto } from './dto/update-automated-message.dto';
import { PreviewMessageDto } from './dto/preview-message.dto';
import { InactiveMembersQueryDto, MessageLogQueryDto } from './dto/retention-query.dto';

// RET-B02 / RET-B03 — panel de retención (mensajes automáticos, socios
// inactivos e historial de envíos). Rutas estáticas antes de :id.
@Controller('retention')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RetentionController {
  constructor(private readonly service: AutomationsService) {}

  // Canales configurados en el servidor + variables disponibles (para el panel).
  @Get('config')
  @Roles(Role.ADMIN, Role.STAFF)
  config() {
    return { channels: this.service.channels(), variables: TEMPLATE_VARIABLES };
  }

  @Get('inactive')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  inactive(@GymId() gymId: string, @Query() query: InactiveMembersQueryDto) {
    return this.service.inactiveMembers(gymId, query.days);
  }

  @Get('messages')
  @Roles(Role.ADMIN, Role.STAFF)
  messages(@GymId() gymId: string, @Query() query: MessageLogQueryDto) {
    return this.service.messageLogs(gymId, query);
  }

  @Get('automations')
  @Roles(Role.ADMIN, Role.STAFF)
  findAll(@GymId() gymId: string) {
    return this.service.findAll(gymId);
  }

  @Post('automations')
  @Roles(Role.ADMIN)
  create(@GymId() gymId: string, @Body() dto: CreateAutomatedMessageDto) {
    return this.service.create(gymId, dto);
  }

  @Post('automations/preview')
  @Roles(Role.ADMIN, Role.STAFF)
  preview(@GymId() gymId: string, @Body() dto: PreviewMessageDto) {
    return this.service.previewFor(gymId, dto.subject, dto.body);
  }

  @Get('automations/:id')
  @Roles(Role.ADMIN, Role.STAFF)
  findOne(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(gymId, id);
  }

  @Patch('automations/:id')
  @Roles(Role.ADMIN)
  update(
    @GymId() gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAutomatedMessageDto,
  ) {
    return this.service.update(gymId, id, dto);
  }

  @Delete('automations/:id')
  @Roles(Role.ADMIN)
  remove(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(gymId, id);
  }

  // Envía el mensaje (con datos de ejemplo) al usuario que lo pide.
  @Post('automations/:id/test')
  @Roles(Role.ADMIN)
  test(
    @GymId() gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.sendTest(gymId, id, user.id);
  }

  // Ejecuta ya el mensaje para este gym (mismas reglas anti-spam que el cron).
  @Post('automations/:id/run')
  @Roles(Role.ADMIN)
  run(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.runNow(gymId, id);
  }
}
