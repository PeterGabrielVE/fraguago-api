-- CreateEnum
CREATE TYPE "KioskEntryStatus" AS ENUM ('APPLIED', 'REJECTED');

-- CreateTable
CREATE TABLE "KioskEntry" (
    "gymId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "identificationNumber" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "KioskEntryStatus" NOT NULL,
    "reason" TEXT,
    "attendanceId" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KioskEntry_pkey" PRIMARY KEY ("gymId","id")
);

-- CreateIndex
CREATE INDEX "KioskEntry_gymId_status_dismissedAt_idx" ON "KioskEntry"("gymId", "status", "dismissedAt");

-- AddForeignKey
ALTER TABLE "KioskEntry" ADD CONSTRAINT "KioskEntry_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: tabla de tenant, mismo patrón que 20260911212125_enable_rls.
ALTER TABLE "KioskEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KioskEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "KioskEntry";
CREATE POLICY tenant_isolation ON "KioskEntry"
  USING ("gymId" = current_setting('app.current_gym_id', true))
  WITH CHECK ("gymId" = current_setting('app.current_gym_id', true));
