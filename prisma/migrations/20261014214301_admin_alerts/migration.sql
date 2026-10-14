-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_ALERT';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "recipientEmail" TEXT;
