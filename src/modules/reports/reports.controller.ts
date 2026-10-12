import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Role } from '@prisma/client';

// Reportes de gestión: solo dueño y administradores (incluyen cifras financieras).
// Todos reciben ?from=YYYY-MM-DD&to=YYYY-MM-DD.
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('dashboard')
  dashboard(
    @GymId() gymId: string
  ) {
    return this.service.dashboard(gymId);
  }

  @Get('finances')
  finances(@GymId() gymId: string, @Query() query: ReportQueryDto) {
    return this.service.finances(gymId, query);
  }

  @Get('members')
  members(@GymId() gymId: string, @Query() query: ReportQueryDto) {
    return this.service.members(gymId, query);
  }

  @Get('attendance')
  attendance(@GymId() gymId: string, @Query() query: ReportQueryDto) {
    return this.service.attendance(gymId, query);
  }

  @Get('sales')
  sales(@GymId() gymId: string, @Query() query: ReportQueryDto) {
    return this.service.sales(gymId, query);
  }
}
