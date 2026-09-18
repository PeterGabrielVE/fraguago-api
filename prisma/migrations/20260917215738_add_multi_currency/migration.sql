-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'VES', 'EUR');

-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "baseCurrency" "Currency" NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "MembershipPlan" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "amountBase" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'USD',
ADD COLUMN     "exchangeRate" DECIMAL(12,6) NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "source" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_gymId_idx" ON "ExchangeRate"("gymId");

-- CreateIndex
CREATE INDEX "ExchangeRate_gymId_currency_effectiveAt_idx" ON "ExchangeRate"("gymId", "currency", "effectiveAt");

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: registros existentes ya estaban en USD (moneda base por defecto),
-- así que amountBase = amount (exchangeRate 1, como ya quedó por default).
UPDATE "Transaction" SET "amountBase" = "amount" WHERE "amountBase" = 0;

-- RLS: ExchangeRate es tabla de tenant (tiene gymId), sigue el mismo patrón
-- que la migración 20260911212125_enable_rls para el resto de tablas.
ALTER TABLE "ExchangeRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExchangeRate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ExchangeRate";
CREATE POLICY tenant_isolation ON "ExchangeRate"
  USING ("gymId" = current_setting('app.current_gym_id', true))
  WITH CHECK ("gymId" = current_setting('app.current_gym_id', true));
