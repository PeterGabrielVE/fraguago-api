-- CreateEnum
CREATE TYPE "ChallengeMetric" AS ENUM ('ATTENDANCE_COUNT', 'ATTENDANCE_DAYS', 'ROUTINE_COMPLETIONS');

-- AlterEnum
ALTER TYPE "PointsSource" ADD VALUE 'CHALLENGE';

-- CreateTable
CREATE TABLE "RoutineLog" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" "ChallengeMetric" NOT NULL,
    "goal" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "pointsReward" INTEGER NOT NULL DEFAULT 0,
    "maxParticipants" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeParticipant" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoutineLog_gymId_idx" ON "RoutineLog"("gymId");

-- CreateIndex
CREATE INDEX "RoutineLog_gymId_memberId_completedAt_idx" ON "RoutineLog"("gymId", "memberId", "completedAt");

-- CreateIndex
CREATE INDEX "RoutineLog_routineId_idx" ON "RoutineLog"("routineId");

-- CreateIndex
CREATE INDEX "Challenge_gymId_idx" ON "Challenge"("gymId");

-- CreateIndex
CREATE INDEX "Challenge_gymId_active_startsAt_endsAt_idx" ON "Challenge"("gymId", "active", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_gymId_idx" ON "ChallengeParticipant"("gymId");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_memberId_idx" ON "ChallengeParticipant"("memberId");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_challengeId_progress_idx" ON "ChallengeParticipant"("challengeId", "progress");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeParticipant_challengeId_memberId_key" ON "ChallengeParticipant"("challengeId", "memberId");

-- AddForeignKey
ALTER TABLE "RoutineLog" ADD CONSTRAINT "RoutineLog_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineLog" ADD CONSTRAINT "RoutineLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineLog" ADD CONSTRAINT "RoutineLog_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integridad de negocio a nivel base (defensa además de la validación del API).
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_dates_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_goal_check" CHECK ("goal" > 0);
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_pointsReward_check" CHECK ("pointsReward" >= 0);
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_maxParticipants_check" CHECK ("maxParticipants" IS NULL OR "maxParticipants" > 0);
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_progress_check" CHECK ("progress" >= 0);

-- RLS: tablas de tenant, mismo patrón que 20260911212125_enable_rls.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY['Challenge','ChallengeParticipant','RoutineLog'];
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
