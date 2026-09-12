# Patrones de Prisma en fraguago-api (tenant-scoped)

**Cómo funciona el aislamiento (leer primero):** el cliente `TENANT_PRISMA` está
envuelto por `withTenantScope`, que antes de cada query setea
`app.current_gym_id` (transaction-local) desde `tenantContext` (AsyncLocalStorage
poblado por la auth). Las políticas **RLS** de Postgres filtran las filas por ese
gym. O sea: el aislamiento real es de la base, no del `where`.

Dos implicaciones prácticas:
- `TENANT_PRISMA` **solo sirve dentro de una request**. Sin contexto → RLS
  devuelve 0 filas. Jobs/cron sin request usan `SystemPrismaService` (rol
  `BYPASSRLS`), y ahí el filtro manual por `gymId` es la única barrera.
- Aun con RLS, **el código sigue pasando `gymId` explícito** (primer parámetro del
  método, sale de `@GymId()` en el controlador) y filtrando por él: defensa en
  profundidad, y obligatorio en `create` para setear la columna.

## Inyección (siempre por token)

```typescript
import { Inject } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';

constructor(
  @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
) {}
```
Nunca `new PrismaClient()` ni un `PrismaService` plano.

## CRUD scopeado por gymId

```typescript
// crear: inyecta gymId en data
this.prisma.widget.create({ data: { ...dto, gymId } });

// listar: filtra por gymId
this.prisma.widget.findMany({ where: { gymId }, orderBy: { createdAt: 'desc' } });

// detalle: findFirst por id + gymId (NO findUnique)
const w = await this.prisma.widget.findFirst({ where: { id, gymId } });
if (!w) throw new NotFoundException('Widget not found');

// actualizar/borrar: valida pertenencia al gym primero
await this.findOne(gymId, id);           // lanza NotFound si no es de este gym
this.prisma.widget.update({ where: { id }, data: dto });
this.prisma.widget.delete({ where: { id } });
```
`findUnique` solo acepta claves únicas, así que para `id + gymId` usa `findFirst`.
Antes de `update`/`delete` por `id`, valida con `findFirst({ where: { id, gymId } })`
para no tocar registros de otro gimnasio.

## Paginación (envoltorio estándar del proyecto)

```typescript
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
```

## include/select reutilizable

Cuando varios listados comparten la misma forma, decláralo una vez como
propiedad privada `as const` y reúsalo (como `memberInclude` en attendance):
```typescript
private readonly memberInclude = {
  member: {
    select: {
      id: true,
      user: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
  },
} as const;
```
Usa `select` para no filtrar campos sensibles (nunca devuelvas `password`, etc.).

## groupBy con gymId (p. ej. summary por turno)

```typescript
const grouped = await this.prisma.attendance.groupBy({
  by: ['shift'],
  where: { gymId, checkedInAt: { gte: start } },
  _count: { _all: true },
});
```
El `where` también lleva `gymId`: `groupBy` no es excepción.

## Errores de Prisma: NO los manejes aquí

El proyecto tiene `PrismaExceptionFilter` global (registrado en `main.ts`). Los
errores nativos (`P2002` único duplicado, `P2025` no encontrado, `P2003` FK…) ya
se traducen a respuestas HTTP de forma centralizada. **No** envuelvas las
llamadas Prisma en try/catch para mapearlos: duplicarías lógica e introducirías
inconsistencia. En el servicio, lanza solo excepciones de dominio
(`NotFoundException` cuando `findFirst` da `null`, `ForbiddenException` para
reglas de negocio como membresía vencida).

## Transacciones: cuidado con el scope

`withTenantScope` ya envuelve **cada** operación en su propia transacción para
setear el `set_config`. La forma en array (como en `attendance`:
`$transaction([findMany, count])`) es segura y es la preferida para batches de
lectura.

Para transacciones interactivas con varias escrituras:
```typescript
await this.prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ data: { gymId, customerId } });
  await tx.orderItem.createMany({
    data: items.map((i) => ({ ...i, gymId, orderId: order.id })),
  });
  return order;
});
```
Propaga `gymId` a cada escritura. Pero antes de usar esta forma, revisa cómo lo
hace algún módulo existente: con la extensión de scope activa, el manejo del
`set_config` dentro de `tx` es delicado; si no hay precedente en el repo,
pregunta en vez de improvisar.

## Tras cambiar el schema

```bash
npx prisma migrate dev --name <descripcion>
npx prisma generate   # regenera tipos; sin esto TS no ve modelos/campos nuevos
```