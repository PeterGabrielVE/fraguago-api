# Agregar un recurso nuevo (patrón fraguago-api)

Recurso/entidad nuevo, normalmente con lecturas + alguna mutación. Todo scopeado
por `gymId` y protegido por guards. Copia un módulo real (p. ej. `attendance`)
como plantilla y adapta nombres.

## Estructura objetivo

```
src/<grupo>/widgets/            # p. ej. src/modules/widgets/ — confirma el grupo real
├── widgets.module.ts
├── widgets.controller.ts
├── widgets.service.ts
└── dto/
    └── create-widget.dto.ts    # un DTO por operación, como check-in.dto.ts
```
La profundidad de imports (`../../prisma/...`) depende de dónde viva el módulo.
Mira un módulo existente y replica exactamente los `../`.

## 1. Modelo Prisma

En `prisma/schema.prisma`, el modelo DEBE tener `gymId` (la columna de tenant):
```prisma
model Widget {
  id        String   @id @default(uuid())
  gymId     String
  name      String
  createdAt DateTime @default(now())
  gym       Gym      @relation(fields: [gymId], references: [id])
  @@index([gymId])
}
```
Luego (confirma con el usuario si la BD es compartida):
```bash
npx prisma migrate dev --name add_widget
npx prisma generate
```

**CRÍTICO — RLS en tablas nuevas.** El aislamiento por gym lo dan políticas RLS
de Postgres, y Prisma NO las crea. Una tabla tenant nueva necesita, en una
migración SQL, habilitar RLS y crear la política que filtra por
`app.current_gym_id`. Sin esto pasa una de dos cosas, ambas malas:
- RLS habilitada pero sin política → `TENANT_PRISMA` devuelve **0 filas**.
- RLS no habilitada → `TENANT_PRISMA` **no filtra** y se ven filas de otros gyms.

Copia el patrón exacto de una tabla existente. Suele verse así (verifica el rol y
el nombre real de la política en una migración previa del repo):
```sql
ALTER TABLE "Widget" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Widget"
  USING ("gymId" = current_setting('app.current_gym_id', true));
```
Genera una migración vacía y pega el SQL, o edítalo dentro de la migración del
modelo:
```bash
npx prisma migrate dev --create-only --name widget_rls
# edita el .sql generado, añade el ALTER/CREATE POLICY, y luego:
npx prisma migrate dev
```
Si no estás seguro del patrón RLS del proyecto, **pregunta antes de crear la
tabla**: es la parte más fácil de romper silenciosamente.

## 2. Servicio

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateWidgetDto } from './dto/create-widget.dto';

@Injectable()
export class WidgetsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  // Bloque reutilizable si varios listados comparten include/select.
  private readonly baseInclude = {
    member: {
      select: {
        id: true,
        user: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
    },
  } as const;

  // Crear — gymId sale del token, no del DTO.
  create(gymId: string, dto: CreateWidgetDto) {
    return this.prisma.widget.create({ data: { ...dto, gymId } });
  }

  // Listado paginado con el envoltorio estándar.
  async findAll(gymId: string, page = 1, pageSize = 20) {
    const where = { gymId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.widget.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.widget.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // Detalle — findFirst por id + gymId (findUnique NO acepta gymId no-único).
  async findOne(gymId: string, id: string) {
    const widget = await this.prisma.widget.findFirst({ where: { id, gymId } });
    if (!widget) throw new NotFoundException('Widget not found');
    return widget;
  }
}
```

## 3. Controlador

```typescript
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { WidgetsService } from './widgets.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateWidgetDto } from './dto/create-widget.dto';

@Controller('widgets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WidgetsController {
  constructor(private readonly service: WidgetsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  create(@GymId() gymId: string, @Body() dto: CreateWidgetDto) {
    return this.service.create(gymId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(
    @GymId() gymId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(
      gymId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  // --- Rutas estáticas ANTES de las paramétricas ---

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.findOne(gymId, id);
  }
}
```
Elige los roles por método imitando módulos parecidos: mutaciones suelen ser
`ADMIN`/`STAFF`; lecturas añaden `TRAINER`.

## 4. DTO

```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateWidgetDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
```
Nunca incluyas `gymId` en el DTO. Si necesitas update parcial y el proyecto usa
`PartialType`, confirma si lo importan de `@nestjs/mapped-types` o
`@nestjs/swagger` antes de usarlo.

## 5. Módulo

```typescript
import { Module } from '@nestjs/common';
import { WidgetsService } from './widgets.service';
import { WidgetsController } from './widgets.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule], // necesario para JwtAuthGuard/RolesGuard/@GymId()
  controllers: [WidgetsController],
  providers: [WidgetsService],
  exports: [WidgetsService], // solo si otro módulo lo consume
})
export class WidgetsModule {}
```
NO importes `PrismaModule`: es `@Global()` y `TENANT_PRISMA` ya está disponible
en todos lados. Sí importa `AuthModule` porque el controlador usa los guards y el
decorador `@GymId()` (igual que `AttendanceModule`).

## 6. Registrar y verificar

- Añade `WidgetsModule` a los `imports` del módulo padre (`AppModule` o el módulo
  de grupo).
- Verifica:
  ```bash
  npx tsc --noEmit    # chequeo de tipos rápido
  yarn start:dev      # opcional, probar endpoints
  ```