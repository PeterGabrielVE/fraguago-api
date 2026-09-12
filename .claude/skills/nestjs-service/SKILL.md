---
name: nestjs-service
description: >-
  Agrega o edita servicios, módulos, controladores y recursos completos en una
  API NestJS con Prisma (como fraguago-api). Úsala siempre que el usuario pida
  "crear/añadir un servicio", "nuevo módulo", "nuevo recurso", "un endpoint",
  "un CRUD", "un controller", "editar/modificar un servicio", "agregar un método
  al servicio", "conectar Prisma", "añadir un DTO/validación", o mencione generar
  código para un backend NestJS — aunque no diga la palabra "skill". Codifica las
  convenciones reales de fraguago-api: Prisma multi-tenant inyectado por token
  (TENANT_PRISMA / ScopedPrismaClient), scoping obligatorio por gymId, guards
  JwtAuthGuard + RolesGuard con @Roles, el decorador @GymId, DTOs con
  class-validator, paginación con envoltorio y el patrón de manejo de errores.
---

# NestJS Service Agent (fraguago-api)

Guía para actuar como agente que **agrega** y **edita** servicios en una API
NestJS con Prisma. El objetivo es que el código nuevo sea indistinguible del que
ya existe: mismas convenciones, misma estructura, mismos patrones de error.

## Regla de oro: descubre antes de escribir

Nunca asumas la convención del proyecto. Antes de crear o editar nada, **lee un
módulo existente completo** y cópialo como plantilla. Ejecuta:

```bash
# Ver la estructura real de src
find src -maxdepth 3 -type f | sort

# Elegir un módulo de referencia y leerlo entero
ls src/<algun-modulo>/
cat src/<algun-modulo>/*.ts
```

Fíjate específicamente en:
- **Nomenclatura de archivos**: `users.service.ts` vs `user.service.ts`, uso o no
  de carpetas `dto/`, `entities/`, `interfaces/`.
- **Acceso a datos**: ¿inyectan `PrismaService` directo, o hay un repositorio /
  capa intermedia? ¿De dónde se importa Prisma (`src/prisma/prisma.service.ts`,
  `@prisma/client`, un `PrismaModule`)?
- **Manejo de errores**: ¿lanzan `NotFoundException` de `@nestjs/common`, o un
  filtro/excepción propia?
- **Validación**: ¿DTOs con `class-validator`? ¿hay un `ValidationPipe` global en
  `main.ts`?
- **Respuestas**: ¿devuelven la entidad Prisma directa, un DTO de respuesta, o un
  envoltorio (`{ data, meta }`)?
- **Auth/guards**: ¿decoradores como `@UseGuards()`, `@Roles()`, `@Public()`?

Haz que el código nuevo imite exactamente lo que encuentres. Si dos módulos
difieren, imita el más reciente o el más parecido al que se pide.

## Convenciones confirmadas de fraguago-api

Estas son las reglas reales del proyecto. Respétalas salvo que el módulo de
referencia demuestre lo contrario:

1. **Prisma es multi-tenant y se inyecta por token, NO como `PrismaService`
   plano.** Siempre:
   ```typescript
   import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
   constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}
   ```
2. **El aislamiento entre gimnasios lo da RLS de Postgres, no el `where`.** El
   cliente `TENANT_PRISMA` está envuelto por `withTenantScope`: antes de cada
   query setea `app.current_gym_id` (transaction-local) leyéndolo de
   `tenantContext` (AsyncLocalStorage, poblado por la capa de auth desde el JWT).
   Las políticas RLS de la base filtran por ese gym. Consecuencias que importan:
   - **Fuera de una request no hay contexto → RLS devuelve 0 filas.** Un servicio
     que corre sin request (cronjob, tarea de fondo) NO puede usar `TENANT_PRISMA`;
     debe usar `SystemPrismaService` (ver punto 3).
   - **Aun así, sigue pasando `gymId` explícito y filtrando por él**, igual que
     `attendance`: es defensa en profundidad y es **obligatorio** en los `create`
     (para setear la columna `gymId`). Cada método público recibe `gymId: string`
     como primer parámetro.
3. **`SystemPrismaService` (rol `BYPASSRLS`) para jobs sin request.** Ahí RLS NO
   protege, así que el filtro manual por `gymId` es la ÚNICA barrera: filtra
   SIEMPRE y explícitamente. Úsalo solo en jobs que iteran gym por gym; para el
   CRUD normal de la API, `TENANT_PRISMA`.
4. **El controlador obtiene `gymId` del token, no del body/params.** Con el
   decorador `@GymId() gymId: string` (de `../../auth/decorators/gym-id.decorator`).
5. **Auth por defecto en todo controlador:**
   `@UseGuards(JwtAuthGuard, RolesGuard)` a nivel de clase y `@Roles(Role.ADMIN,
   Role.STAFF, ...)` por método. `Role` viene de `@prisma/client`. Las mutaciones
   suelen ser `ADMIN`/`STAFF`; las lecturas añaden `TRAINER`.
6. **Orden de rutas:** las rutas estáticas (`today`, `summary`) van **antes** que
   las paramétricas (`member/:memberId`) en el controlador, para que Nest no
   capture la estática como parámetro.
7. **El servicio se inyecta como `service`** en el controlador
   (`private readonly service: XService`), no como `xService`.
8. **DTOs en `./dto/`**, uno por operación (`check-in.dto.ts`), validados con
   `class-validator`. El controlador lee el body como `@Body() dto: XDto`.
9. **Errores:** excepciones de `@nestjs/common` lanzadas directo
   (`NotFoundException`, `ForbiddenException`), con mensaje en español cuando es
   para el usuario final.
10. **Paginación:** envoltorio `{ data, total, page, pageSize, totalPages }` usando
   `this.prisma.$transaction([findMany, count])`. Query params se parsean a mano
   en el controlador (`page ? Number(page) : 1`).
11. **`include`/`select` reutilizables** como propiedad privada del servicio
    (`private readonly memberInclude = {...} as const`) cuando se repiten en
    varios listados.
12. **Comentarios con código de ticket** en español encima de cada método
    (`// B03 — check-ins de hoy para el gym.`) cuando el método corresponde a una
    historia/tarea.
13. **Rutas de import por profundidad:** los módulos viven anidados
    (`../../prisma/...`, `../../auth/...`, `../../common/...`). Ajusta los `../`
    a la ubicación real del módulo nuevo.

Infraestructura global confirmada (`main.ts` + `PrismaModule`), no la redefinas
en cada módulo:

- **`PrismaModule` es `@Global()` y solo exporta `TENANT_PRISMA`.** Por eso el
  cliente scopeado está disponible en cualquier servicio SIN importar nada. NO
  importes `PrismaModule` en el módulo nuevo, y NO intentes inyectar
  `PrismaService` (no se exporta a propósito).
- **`ValidationPipe` global** con `whitelist: true`, `transform: true`,
  `forbidNonWhitelisted: true`. Los DTOs se validan solos; como está
  `forbidNonWhitelisted`, un body con campos de más devuelve 400 → declara en el
  DTO **todos** los campos permitidos y ninguno de más. Aun con `transform: true`,
  el proyecto parsea los query params a mano (`Number(page)`); imita eso.
- **`PrismaExceptionFilter` global.** Los errores nativos de Prisma (P2002,
  P2025, P2003…) ya se mapean a HTTP centralmente. **No** envuelvas las llamadas
  Prisma en try/catch para traducirlos: solo lanza excepciones de dominio
  (`NotFoundException`, `ForbiddenException`) para reglas de negocio.
- **Prefijo global `api`** (`app.setGlobalPrefix('api')`): las rutas quedan bajo
  `/api/...`. No lo repitas en `@Controller()`.
- **Módulo que usa guards** (`JwtAuthGuard`/`RolesGuard`/`@GymId()`) debe hacer
  `imports: [AuthModule]`, como `AttendanceModule`. Auth se sirve por cookie
  (cookie-parser + CORS con `credentials: true`).

## Elige el flujo

- **Recurso nuevo** (módulo + servicio + controlador + DTOs, típicamente CRUD):
  lee `references/new-resource.md`.
- **Editar un servicio existente** (añadir un método, cambiar lógica, nueva
  dependencia): lee `references/edit-service.md`.
- **Dudas sobre acceso a datos con Prisma** (queries, relaciones, transacciones,
  paginación): lee `references/prisma-patterns.md`.

## Workflow para AGREGAR un recurso

1. **Descubre** convenciones (regla de oro).
2. **Modelo Prisma**: si el recurso necesita persistencia, revisa
   `prisma/schema.prisma`. Si el modelo no existe, añádelo y crea la migración:
   ```bash
   npx prisma migrate dev --name add_<recurso>
   npx prisma generate
   ```
   Confirma con el usuario antes de correr migraciones si hay una base de datos
   compartida o de producción.
3. **Scaffolding**: usa el CLI de Nest para respetar el estilo del framework:
   ```bash
   npx nest generate resource <nombre> --no-spec   # módulo+controller+service+dto+entity
   # o piezas sueltas:
   npx nest generate module <nombre>
   npx nest generate service <nombre>
   npx nest generate controller <nombre>
   ```
   Cuando pregunte el transporte, elige **REST API**. Si prefieres no usar el CLI,
   crea los archivos a mano copiando un módulo existente.
4. **Cablea Prisma tenant** en el servicio: `@Inject(TENANT_PRISMA) prisma:
   ScopedPrismaClient`. Si generaste con el CLI, reemplaza el `PrismaService`
   plano que ponga por defecto. Añade `gymId` como primer parámetro a cada método.
5. **DTOs + validación**: crea `create-<x>.dto.ts` y `update-<x>.dto.ts`
   (`PartialType(CreateXDto)`), con decoradores de `class-validator`.
6. **Registra el módulo**: verifica que el nuevo módulo esté en los `imports` de
   `AppModule` (el CLI suele hacerlo; confírmalo). Exporta el servicio si otro
   módulo lo va a consumir.
7. **Verifica**: compila y arranca.
   ```bash
   yarn build        # o: npx tsc --noEmit
   yarn start:dev    # opcional, para probar en caliente
   ```
   Si hay tests: `yarn test`.

## Workflow para EDITAR un servicio

1. **Lee el servicio completo** y su controlador antes de tocar nada.
2. Haz el cambio **mínimo y consistente** con el estilo existente (mismo formato
   de errores, mismos nombres de métodos, misma forma de query Prisma).
3. Si añades un método público al servicio, **expónlo en el controlador** con su
   ruta, DTO y validación, salvo que el usuario pida solo la lógica interna.
4. Si cambias una firma usada en otros lados, **busca los usos** y actualízalos:
   ```bash
   grep -rn "nombreDelMetodo(" src
   ```
5. Verifica con `yarn build` (o `npx tsc --noEmit`) que no rompiste tipos.

## Patrones que debe seguir el código generado

**Servicio tenant-scoped (patrón real del proyecto):**
```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';

@Injectable()
export class WidgetsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  async findOne(gymId: string, id: string) {
    const widget = await this.prisma.widget.findFirst({ where: { id, gymId } });
    if (!widget) throw new NotFoundException('Widget not found');
    return widget;
  }

  create(gymId: string, dto: CreateWidgetDto) {
    return this.prisma.widget.create({ data: { ...dto, gymId } });
  }
}
```
Claves: inyección por `TENANT_PRISMA`, `gymId` como primer parámetro, y `gymId`
presente en cada `where`/`data`. Usa `findFirst` (no `findUnique`) cuando filtras
por `id + gymId`, porque `findUnique` solo acepta claves únicas.

**Controlador (guards + `@GymId()` + orden de rutas):**
```typescript
@Controller('widgets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WidgetsController {
  constructor(private readonly service: WidgetsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  create(@GymId() gymId: string, @Body() dto: CreateWidgetDto) {
    return this.service.create(gymId, dto);
  }

  // rutas estáticas ANTES de las paramétricas
  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(@GymId() gymId: string, @Param('id') id: string) {
    return this.service.findOne(gymId, id);
  }
}
```

**DTO con validación (en `./dto/`):**
```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class CheckInDto {
  @IsString()
  @IsNotEmpty()
  memberId: string;
}
```
El `gymId` nunca va en el DTO: sale del token vía `@GymId()`.

## Errores comunes a evitar

- **No uses `PrismaService` plano ni `new PrismaClient()`** para el CRUD. Siempre
  `@Inject(TENANT_PRISMA) prisma: ScopedPrismaClient`. `PrismaService` ni siquiera
  se exporta.
- **No uses `TENANT_PRISMA` fuera de una request** (cronjob, seed, listener sin
  contexto): sin `tenantContext`, RLS devuelve 0 filas silenciosamente. Ahí va
  `SystemPrismaService` con filtro manual por `gymId`.
- **No dupliques el manejo de errores de Prisma.** El `PrismaExceptionFilter`
  global ya mapea P2002/P2025/P2003. Nada de try/catch para traducirlos; solo
  lanza excepciones de dominio para reglas de negocio.
- **No pongas rutas paramétricas (`:id`) antes que las estáticas** (`today`,
  `summary`): Nest capturaría "today" como `:id`.
- **No olvides `imports: [AuthModule]`** en un módulo cuyo controlador use los
  guards/`@GymId()`, ni `@Roles(...)` en los métodos nuevos.
- No tomes `gymId` del `@Body()` o `@Param()`; sale del token con `@GymId()`. Sí
  inclúyelo en el `data` de los `create` y, por consistencia, en los `where`.
- No repitas el prefijo `api` en `@Controller()` (ya es global).
- No olvides `await` en llamadas Prisma; devuelven promesas.
- No dejes el módulo sin registrar en `imports` de su módulo padre.
- No devuelvas campos sensibles (p. ej. `password`); usa `select` como en el
  bloque `memberInclude`.
- No agregues campos de más al DTO: `forbidNonWhitelisted` los rechaza con 400.
- No corras `prisma migrate dev` contra una base de producción sin confirmar.

## Cierre

Al terminar, resume brevemente: qué archivos creaste/editaste, qué rutas quedan
expuestas (método + verbo HTTP + path), si hiciste migración de Prisma, y el
comando para probarlo (`yarn start:dev`). Señala cualquier suposición que hiciste
por no poder verificar una convención.