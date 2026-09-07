/*
  Warnings:

  - You are about to drop the column `guardianName` on the `Member` table. All the data in the column will be lost.
  - You are about to drop the column `guardianPhone` on the `Member` table. All the data in the column will be lost.
  - The `status` column on the `Member` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[gymId,identificationNumber]` on the table `Member` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `shift` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `identificationNumber` to the `Member` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Member` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Membership` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `MembershipPlan` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "TrainingShift" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT');

-- CreateEnum
CREATE TYPE "TrainingGoal" AS ENUM ('MUSCLE_GAIN', 'WEIGHT_LOSS', 'GENERAL_WELLNESS', 'PERFORMANCE_REHABILITATION');

-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('DAILY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceShift" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT');

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "passType" "MembershipType",
ADD COLUMN     "shift" "AttendanceShift" NOT NULL,
ADD COLUMN     "signature" TEXT;

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "guardianName",
DROP COLUMN "guardianPhone",
ADD COLUMN     "activityLevel" "ActivityLevel",
ADD COLUMN     "goalDescription" TEXT,
ADD COLUMN     "identificationNumber" TEXT NOT NULL,
ADD COLUMN     "preferredShift" "TrainingShift",
ADD COLUMN     "primaryGoal" "TrainingGoal",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "MembershipPlan" ADD COLUMN     "type" "MembershipType" NOT NULL;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod";

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalProfile" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "hypertension" BOOLEAN NOT NULL DEFAULT false,
    "diabetes" BOOLEAN NOT NULL DEFAULT false,
    "heartProblems" BOOLEAN NOT NULL DEFAULT false,
    "asthma" BOOLEAN NOT NULL DEFAULT false,
    "otherConditions" TEXT,
    "hasInjury" BOOLEAN NOT NULL DEFAULT false,
    "injuryDescription" TEXT,
    "takesMedication" BOOLEAN NOT NULL DEFAULT false,
    "medicationDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyContact_memberId_key" ON "EmergencyContact"("memberId");

-- CreateIndex
CREATE INDEX "EmergencyContact_gymId_idx" ON "EmergencyContact"("gymId");

-- CreateIndex
CREATE INDEX "EmergencyContact_memberId_idx" ON "EmergencyContact"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalProfile_memberId_key" ON "MedicalProfile"("memberId");

-- CreateIndex
CREATE INDEX "MedicalProfile_gymId_idx" ON "MedicalProfile"("gymId");

-- CreateIndex
CREATE INDEX "MedicalProfile_memberId_idx" ON "MedicalProfile"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_gymId_identificationNumber_key" ON "Member"("gymId", "identificationNumber");

-- CreateIndex
CREATE INDEX "MembershipPlan_gymId_type_idx" ON "MembershipPlan"("gymId", "type");

-- CreateIndex
CREATE INDEX "Transaction_createdById_idx" ON "Transaction"("createdById");

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalProfile" ADD CONSTRAINT "MedicalProfile_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalProfile" ADD CONSTRAINT "MedicalProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
