-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('INACTIVITY', 'MEMBERSHIP_EXPIRING');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED');

-- AlterEnum
ALTER TYPE "PointsSource" ADD VALUE 'REFERRAL';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "AutomatedMessage" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "triggerDays" INTEGER NOT NULL,
    "cooldownDays" INTEGER NOT NULL DEFAULT 7,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "whatsappTemplate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomatedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT,
    "automatedMessageId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "trigger" "AutomationTrigger",
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "referrerPoints" INTEGER NOT NULL DEFAULT 0,
    "referredPoints" INTEGER NOT NULL DEFAULT 0,
    "rewardedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomatedMessage_gymId_idx" ON "AutomatedMessage"("gymId");

-- CreateIndex
CREATE INDEX "AutomatedMessage_gymId_active_trigger_idx" ON "AutomatedMessage"("gymId", "active", "trigger");

-- CreateIndex
CREATE INDEX "MessageLog_gymId_createdAt_idx" ON "MessageLog"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_automatedMessageId_memberId_createdAt_idx" ON "MessageLog"("automatedMessageId", "memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredId_key" ON "Referral"("referredId");

-- CreateIndex
CREATE INDEX "Referral_gymId_idx" ON "Referral"("gymId");

-- CreateIndex
CREATE INDEX "Referral_gymId_status_idx" ON "Referral"("gymId", "status");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_gymId_referralCode_key" ON "Member"("gymId", "referralCode");

-- AddForeignKey
ALTER TABLE "AutomatedMessage" ADD CONSTRAINT "AutomatedMessage_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_automatedMessageId_fkey" FOREIGN KEY ("automatedMessageId") REFERENCES "AutomatedMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integridad de negocio a nivel base.
ALTER TABLE "AutomatedMessage" ADD CONSTRAINT "AutomatedMessage_triggerDays_check" CHECK ("triggerDays" > 0);
ALTER TABLE "AutomatedMessage" ADD CONSTRAINT "AutomatedMessage_cooldownDays_check" CHECK ("cooldownDays" >= 1);
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_not_self_check" CHECK ("referrerId" <> "referredId");

-- RLS: tablas de tenant, mismo patrón que 20260911212125_enable_rls.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY['AutomatedMessage','MessageLog','Referral'];
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
