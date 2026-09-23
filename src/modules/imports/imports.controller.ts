import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { ImportsService } from './imports.service';
import { MAX_FILE_BYTES } from './spreadsheet';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { AuditSkip } from '../../common/audit.interceptor';
import {
  AttendanceBatchDto,
  CreateImportJobDto,
  MembersBatchDto,
  PreviewImportDto,
} from './dto/import.dto';

// MIG-B01 — importación masiva desde Excel/CSV. Flujo:
//  1. POST /imports/preview (multipart): lee, mapea columnas y valida SIN
//     escribir nada. Devuelve cada fila normalizada con su estado.
//  2. POST /imports/jobs: abre la importación (historial).
//  3. POST /imports/jobs/:id/members|attendance: lotes de hasta 50 filas; el
//     servidor vuelve a validar todo (DTO + duplicados). El cliente muestra
//     progreso real a medida que confirma cada lote.
//  4. POST /imports/jobs/:id/finish.
// Solo ADMIN (y OWNER): es una operación masiva sobre datos del gym.
@Controller('imports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Post('preview')
  @AuditSkip() // solo lee y valida; no escribe nada
  // Sin 'dest', multer guarda el archivo en memoria: nunca toca el disco.
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10 },
  }))
  preview(
    @GymId() gymId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: PreviewImportDto,
  ) {
    return this.service.preview(gymId, file, dto);
  }

  @Get('jobs')
  listJobs(@GymId() gymId: string) {
    return this.service.listJobs(gymId);
  }

  @Get('jobs/:id')
  getJob(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getJob(gymId, id);
  }

  @Post('jobs')
  createJob(
    @GymId() gymId: string,
    @Body() dto: CreateImportJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createJob(gymId, dto, user.id);
  }

  @Post('jobs/:id/members')
  importMembers(
    @GymId() gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MembersBatchDto,
  ) {
    return this.service.importMembersBatch(gymId, id, dto.rows, dto.options);
  }

  @Post('jobs/:id/attendance')
  importAttendance(
    @GymId() gymId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttendanceBatchDto,
  ) {
    return this.service.importAttendanceBatch(gymId, id, dto.rows);
  }

  @Post('jobs/:id/finish')
  finish(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.finishJob(gymId, id);
  }
}
