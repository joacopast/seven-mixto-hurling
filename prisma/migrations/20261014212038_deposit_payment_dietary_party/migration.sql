-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'DEPOSIT_PAID';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "attendsParty" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dietaryRestriction" TEXT;
