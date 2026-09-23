-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('MEMBERS_PAYMENTS', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_gymId_startedAt_idx" ON "ImportJob"("gymId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Member_gymId_externalId_key" ON "Member"("gymId", "externalId");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: tabla de tenant, mismo patrón que 20260911212125_enable_rls.
ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ImportJob";
CREATE POLICY tenant_isolation ON "ImportJob"
  USING ("gymId" = current_setting('app.current_gym_id', true))
  WITH CHECK ("gymId" = current_setting('app.current_gym_id', true));
