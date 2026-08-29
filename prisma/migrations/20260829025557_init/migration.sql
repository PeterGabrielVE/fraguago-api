-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'TRAINER', 'STAFF', 'MEMBER');

-- CreateEnum
CREATE TYPE "ConceptKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "Gym" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "gymId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trainer" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialty" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "trainerId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ConceptKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "conceptId" TEXT,
    "memberId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "trainerId" TEXT,
    "title" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "memberId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "weightKg" DECIMAL(5,2),
    "heightCm" DECIMAL(5,2),
    "bodyFat" DECIMAL(5,2),
    "chestCm" DECIMAL(5,2),
    "waistCm" DECIMAL(5,2),
    "armCm" DECIMAL(5,2),
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gym_name_idx" ON "Gym"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_gymId_idx" ON "User"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX "User_gymId_email_key" ON "User"("gymId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "Profile_gymId_idx" ON "Profile"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_userId_key" ON "Member"("userId");

-- CreateIndex
CREATE INDEX "Member_gymId_idx" ON "Member"("gymId");

-- CreateIndex
CREATE INDEX "Member_userId_idx" ON "Member"("userId");

-- CreateIndex
CREATE INDEX "MembershipPlan_gymId_idx" ON "MembershipPlan"("gymId");

-- CreateIndex
CREATE INDEX "Membership_gymId_idx" ON "Membership"("gymId");

-- CreateIndex
CREATE INDEX "Membership_memberId_idx" ON "Membership"("memberId");

-- CreateIndex
CREATE INDEX "Membership_planId_idx" ON "Membership"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Trainer_userId_key" ON "Trainer"("userId");

-- CreateIndex
CREATE INDEX "Trainer_gymId_idx" ON "Trainer"("gymId");

-- CreateIndex
CREATE INDEX "Trainer_userId_idx" ON "Trainer"("userId");

-- CreateIndex
CREATE INDEX "Routine_gymId_idx" ON "Routine"("gymId");

-- CreateIndex
CREATE INDEX "Routine_memberId_idx" ON "Routine"("memberId");

-- CreateIndex
CREATE INDEX "Routine_trainerId_idx" ON "Routine"("trainerId");

-- CreateIndex
CREATE INDEX "Concept_gymId_idx" ON "Concept"("gymId");

-- CreateIndex
CREATE INDEX "Transaction_gymId_idx" ON "Transaction"("gymId");

-- CreateIndex
CREATE INDEX "Transaction_gymId_type_idx" ON "Transaction"("gymId", "type");

-- CreateIndex
CREATE INDEX "Transaction_memberId_idx" ON "Transaction"("memberId");

-- CreateIndex
CREATE INDEX "Service_gymId_idx" ON "Service"("gymId");

-- CreateIndex
CREATE INDEX "Schedule_gymId_idx" ON "Schedule"("gymId");

-- CreateIndex
CREATE INDEX "Schedule_trainerId_idx" ON "Schedule"("trainerId");

-- CreateIndex
CREATE INDEX "AuditLog_gymId_idx" ON "AuditLog"("gymId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_gymId_createdAt_idx" ON "AuditLog"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "Attendance_gymId_idx" ON "Attendance"("gymId");

-- CreateIndex
CREATE INDEX "Attendance_memberId_idx" ON "Attendance"("memberId");

-- CreateIndex
CREATE INDEX "Attendance_gymId_checkedInAt_idx" ON "Attendance"("gymId", "checkedInAt");

-- CreateIndex
CREATE INDEX "Product_gymId_idx" ON "Product"("gymId");

-- CreateIndex
CREATE INDEX "Product_gymId_sku_idx" ON "Product"("gymId", "sku");

-- CreateIndex
CREATE INDEX "Sale_gymId_idx" ON "Sale"("gymId");

-- CreateIndex
CREATE INDEX "Sale_productId_idx" ON "Sale"("productId");

-- CreateIndex
CREATE INDEX "Sale_memberId_idx" ON "Sale"("memberId");

-- CreateIndex
CREATE INDEX "Sale_gymId_soldAt_idx" ON "Sale"("gymId", "soldAt");

-- CreateIndex
CREATE INDEX "Measurement_gymId_idx" ON "Measurement"("gymId");

-- CreateIndex
CREATE INDEX "Measurement_memberId_idx" ON "Measurement"("memberId");

-- CreateIndex
CREATE INDEX "Measurement_gymId_memberId_date_idx" ON "Measurement"("gymId", "memberId", "date");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trainer" ADD CONSTRAINT "Trainer_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trainer" ADD CONSTRAINT "Trainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
