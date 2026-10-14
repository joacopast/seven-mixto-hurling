-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MANUAL_TRANSFER', 'MERCADOPAGO');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'MANUAL_TRANSFER';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "confirmedById" TEXT,
ALTER COLUMN "mpPreferenceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TournamentConfig" ADD COLUMN     "bankAlias" TEXT,
ADD COLUMN     "bankCbu" TEXT,
ADD COLUMN     "bankCuit" TEXT,
ADD COLUMN     "bankHolderName" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'MANUAL_TRANSFER',
ADD COLUMN     "whatsappMessageTemplate" TEXT DEFAULT 'Hola! Te paso el comprobante de la inscripción de {team} (${amount}).',
ADD COLUMN     "whatsappPhone" TEXT;
