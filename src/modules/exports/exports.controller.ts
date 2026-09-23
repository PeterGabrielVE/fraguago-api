import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ExportsService } from './exports.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { EXPORT_RESOURCES, ExportQueryDto, ExportResource } from './dto/export-query.dto';

// MIG-B03 — GET /exports/:resource?format=xlsx|csv&from=&to=&…filtros
// resource: members | attendance | finances. Mismos roles que pueden listar
// esos datos en sus pantallas (ADMIN y STAFF).
@Controller('exports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  @Get(':resource')
  @Roles(Role.ADMIN, Role.STAFF)
  async export(
    @GymId() gymId: string,
    @Param('resource') resource: string,
    @Query() query: ExportQueryDto,
  ): Promise<StreamableFile> {
    if (!EXPORT_RESOURCES.includes(resource as ExportResource)) {
      throw new BadRequestException(`Recurso inválido: usa ${EXPORT_RESOURCES.join(', ')}`);
    }
    const file = await this.service.export(gymId, resource as ExportResource, query);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.length,
    });
  }
}
