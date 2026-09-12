# Editar un servicio existente

El riesgo al editar no es escribir el método nuevo: es romper algo que ya
funciona o introducir un estilo inconsistente. Sigue estos pasos.

## 1. Contexto antes de tocar

```bash
cat src/<modulo>/<modulo>.service.ts
cat src/<modulo>/<modulo>.controller.ts
ls src/<modulo>/dto/ 2>/dev/null && cat src/<modulo>/dto/*.ts
```
Identifica: cómo inyectan dependencias, el estilo de queries Prisma, cómo lanzan
errores, y si devuelven entidad cruda o DTO.

## 2. Tipos de edición

### a) Añadir un método nuevo al servicio
- Sigue el patrón de los métodos vecinos (nombres, `async/await`, errores).
- Si es una operación pública de la API, **exponla también en el controlador**
  con su verbo HTTP, ruta, `@Param`/`@Body` y DTO.

### b) Cambiar lógica de un método existente
- Conserva la **firma pública** si puedes. Si debes cambiarla, busca todos los
  usos y actualízalos:
  ```bash
  grep -rn "\.metodo(" src
  ```
- No cambies el formato de respuesta a menos que se pida: otros clientes (front,
  tests) dependen de él.

### c) Añadir una dependencia nueva al servicio
- Inyéctala por constructor junto al Prisma tenant ya existente:
  `constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  private readonly otro: OtroService) {}`.
- Asegúrate de que el módulo que provee esa dependencia esté **importado** en el
  módulo actual y que `OtroService` esté en sus `exports`. Si falta, NestJS
  lanzará un error de inyección al arrancar.

### d) Nueva query/relación Prisma
- Ver `prisma-patterns.md`. **El nuevo query también debe filtrar por `gymId`.**
  Si el método aún no recibe `gymId`, añádelo como primer parámetro y propágalo
  desde el controlador con `@GymId()`.
- Si necesitas un campo/relación que no existe en el schema, hay que migrar
  primero (`prisma migrate dev` + `prisma generate`).

## 3. Validaciones de consistencia

- **¿La query corre dentro de una request?** Con `TENANT_PRISMA`, RLS aísla por
  gym siempre que haya `tenantContext`. Si el método nuevo lo llama un job/cron
  sin request, `TENANT_PRISMA` devuelve 0 filas: usa `SystemPrismaService` con
  filtro manual por `gymId`. Igual, por consistencia con el módulo, pasa `gymId`
  y filtra por él (obligatorio en `create`).
- Si expones un método nuevo en el controlador, ¿lleva `@UseGuards` (heredado de
  la clase) y su `@Roles(...)` correcto? Las estáticas van antes que `:id`.
- ¿El método puede recibir un `id` inexistente o de otro gym? Usa
  `findFirst({ where: { id, gymId } })` y lanza `NotFoundException` (patrón
  `findOne` del módulo).
- ¿Devuelves datos sensibles nuevos? Aplica `select`/`omit` como en el resto.
- ¿El cambio afecta a otro módulo que importa este servicio? Compílalo todo.

## 4. Verificar

```bash
npx tsc --noEmit     # rápido: solo chequeo de tipos
# o
yarn build
yarn test            # si hay tests que cubran el módulo
```

## 5. Reporte final

Indica el archivo y método tocados, si cambió alguna firma pública (y qué usos
actualizaste), y si el controlador expone algo nuevo (verbo + ruta).