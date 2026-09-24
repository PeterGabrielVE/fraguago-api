-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'PAGO_MOVIL';
ALTER TYPE "PaymentMethod" ADD VALUE 'ZELLE';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "payerName" TEXT,
ADD COLUMN     "payerPhone" TEXT,
ADD COLUMN     "paymentBank" TEXT,
ADD COLUMN     "paymentReference" TEXT;

-- CreateTable
CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "transactionId" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "ocrData" JSONB,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_transactionId_key" ON "PaymentReceipt"("transactionId");

-- CreateIndex
CREATE INDEX "PaymentReceipt_gymId_createdAt_idx" ON "PaymentReceipt"("gymId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Anti-fraude: una misma referencia no puede registrarse dos veces con el
-- mismo método en el gym (p. ej. reusar la captura de un pago móvil).
-- Índice PARCIAL (solo filas con referencia): Prisma no lo modela.
CREATE UNIQUE INDEX "Transaction_gym_method_reference_key"
  ON "Transaction" ("gymId", "paymentMethod", "paymentReference")
  WHERE "paymentReference" IS NOT NULL;

-- RLS: tabla de tenant, mismo patrón que 20260911212125_enable_rls.
ALTER TABLE "PaymentReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentReceipt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PaymentReceipt";
CREATE POLICY tenant_isolation ON "PaymentReceipt"
  USING ("gymId" = current_setting('app.current_gym_id', true))
  WITH CHECK ("gymId" = current_setting('app.current_gym_id', true));

-- Límite de tamaño del comprobante (defensa además de la validación del API).
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_size_check" CHECK ("size" > 0 AND "size" <= 3145728);
