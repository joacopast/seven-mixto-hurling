-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "playsHockey" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TournamentConfig" ADD COLUMN     "waterBreakEveryMatches" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "waterBreakMinutes" INTEGER NOT NULL DEFAULT 7;
