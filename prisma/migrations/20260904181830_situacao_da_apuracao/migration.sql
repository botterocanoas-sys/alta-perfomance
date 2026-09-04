-- CreateEnum
CREATE TYPE "SituacaoApuracao" AS ENUM ('APURADA', 'SEM_MEDICAO', 'FORA_DA_APURACAO');

-- AlterTable
ALTER TABLE "apuracao_dia" ADD COLUMN     "meta" DECIMAL(16,4),
ADD COLUMN     "situacao" "SituacaoApuracao" NOT NULL DEFAULT 'APURADA';

-- AlterTable
ALTER TABLE "apuracao_loja_dia" ADD COLUMN     "meta" DECIMAL(16,4),
ADD COLUMN     "situacao" "SituacaoApuracao" NOT NULL DEFAULT 'APURADA';
