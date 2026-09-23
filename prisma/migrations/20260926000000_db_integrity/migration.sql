-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- DB-02 — Membership.status: String -> MembershipStatus SIN perder datos
-- (Prisma generaba DROP + ADD COLUMN). Valores legados en minúscula se
-- mapean; cualquier otro valor pasa a ACTIVE, que es como se trataba antes.
ALTER TABLE "Membership" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Membership" ALTER COLUMN "status" TYPE "MembershipStatus" USING (
  CASE lower(trim("status"))
    WHEN 'suspended' THEN 'SUSPENDED'
    WHEN 'cancelled' THEN 'CANCELLED'
    WHEN 'canceled'  THEN 'CANCELLED'
    ELSE 'ACTIVE'
  END
)::"MembershipStatus";
ALTER TABLE "Membership" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "saleId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'USD',
ADD COLUMN     "paymentMethod" "PaymentMethod";

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "muscleGroup" TEXT,
    "equipment" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineExercise" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "restSeconds" INTEGER,
    "notes" TEXT,

    CONSTRAINT "RoutineExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exercise_gymId_idx" ON "Exercise"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_gymId_name_key" ON "Exercise"("gymId", "name");

-- CreateIndex
CREATE INDEX "RoutineExercise_gymId_idx" ON "RoutineExercise"("gymId");

-- CreateIndex
CREATE INDEX "RoutineExercise_routineId_day_order_idx" ON "RoutineExercise"("routineId", "day", "order");

-- CreateIndex
CREATE INDEX "RoutineExercise_exerciseId_idx" ON "RoutineExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_saleId_key" ON "Transaction"("saleId");

-- CreateIndex
CREATE INDEX "Sale_createdById_idx" ON "Sale"("createdById");

-- =====================================================================
-- Arreglos de datos. Las tablas tienen FORCE ROW LEVEL SECURITY y el rol de
-- migraciones no hace BYPASSRLS: un UPDATE "suelto" afectaría 0 filas sin
-- error. Por eso se recorre gym por gym fijando app.current_gym_id (igual
-- que hace el API en cada request).
-- =====================================================================
DO $$
DECLARE
  g RECORD;
BEGIN
  FOR g IN SELECT id, "baseCurrency" FROM "Gym" LOOP
    PERFORM set_config('app.current_gym_id', g.id, true);

    -- DB-04: vendedores que ya no existen -> NULL (si no, la FK falla).
    UPDATE "Sale" s SET "createdById" = NULL
     WHERE s."gymId" = g.id AND s."createdById" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = s."createdById");

    -- Moneda de la venta = la de sus productos (todas las actuales son de una sola moneda).
    UPDATE "Sale" s SET "currency" = sub.currency
      FROM (
        SELECT si."saleId", min(p."currency"::text)::"Currency" AS currency
          FROM "SaleItem" si JOIN "Product" p ON p.id = si."productId"
         WHERE si."gymId" = g.id
         GROUP BY si."saleId"
      ) sub
     WHERE s.id = sub."saleId" AND s."gymId" = g.id;

    -- DB-05: vincular el ingreso de cada venta (nota "Venta POS <id>").
    UPDATE "Transaction" t SET "saleId" = s.id
      FROM "Sale" s
     WHERE t."gymId" = g.id AND s."gymId" = g.id
       AND t."saleId" IS NULL
       AND t.note = 'Venta POS ' || s.id;

    -- Bug corregido: los ingresos de ventas se guardaban con amountBase = 0 y
    -- no sumaban en los reportes. Si están en la moneda base, base = monto.
    UPDATE "Transaction" t SET "amountBase" = t.amount, "exchangeRate" = 1
     WHERE t."gymId" = g.id AND t."saleId" IS NOT NULL
       AND t."amountBase" = 0 AND t.currency = g."baseCurrency";
  END LOOP;
END $$;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineExercise" ADD CONSTRAINT "RoutineExercise_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineExercise" ADD CONSTRAINT "RoutineExercise_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineExercise" ADD CONSTRAINT "RoutineExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS: tablas de tenant nuevas, mismo patrón que 20260911212125_enable_rls.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY['Exercise','RoutineExercise'];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING ("gymId" = current_setting('app.current_gym_id', true))
      WITH CHECK ("gymId" = current_setting('app.current_gym_id', true));
    $f$, t);
  END LOOP;
END $$;

-- Integridad de la prescripción.
ALTER TABLE "RoutineExercise" ADD CONSTRAINT "RoutineExercise_values_check"
  CHECK ("day" BETWEEN 1 AND 7 AND "order" >= 0 AND "sets" BETWEEN 1 AND 20
         AND ("restSeconds" IS NULL OR "restSeconds" BETWEEN 0 AND 900));
