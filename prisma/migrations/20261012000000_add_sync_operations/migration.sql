-- CreateTable
CREATE TABLE "SyncOperation" (
    "gymId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "result" JSONB,
    "clientCreatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("gymId","id")
);

-- CreateIndex
CREATE INDEX "SyncOperation_gymId_appliedAt_idx" ON "SyncOperation"("gymId", "appliedAt");

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: tabla de tenant, mismo patrón que 20260911212125_enable_rls.
ALTER TABLE "SyncOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncOperation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SyncOperation";
CREATE POLICY tenant_isolation ON "SyncOperation"
  USING ("gymId" = current_setting('app.current_gym_id', true))
  WITH CHECK ("gymId" = current_setting('app.current_gym_id', true));
