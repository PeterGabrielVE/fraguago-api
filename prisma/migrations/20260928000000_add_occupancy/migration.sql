-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "avgVisitMinutes" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "maxCapacity" INTEGER;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "checkedOutAt" TIMESTAMP(3);
