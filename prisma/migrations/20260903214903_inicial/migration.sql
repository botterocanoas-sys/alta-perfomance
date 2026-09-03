-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'GERENTE');

-- CreateEnum
CREATE TYPE "Indicador" AS ENUM ('VALOR', 'PARES', 'BOLSAS', 'PA', 'CONVERSAO', 'CRM');

-- CreateEnum
CREATE TYPE "TipoFaixa" AS ENUM ('ZERO', 'MEIO', 'BASE', 'ALTO');

-- CreateEnum
CREATE TYPE "StatusImportacao" AS ENUM ('PENDENTE', 'CONFIRMADA', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "ModoRateio" AS ENUM ('PROPORCIONAL', 'IGUAL');

-- CreateTable
CREATE TABLE "loja" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "chaveRelatorio" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "lojaId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedora" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "contaComoVendedora" BOOLEAN NOT NULL DEFAULT true,
    "usuarioId" TEXT,
    "recebeBonusVendedora" BOOLEAN NOT NULL DEFAULT true,
    "ativaDesde" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arquivadaEm" DATE,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendedora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedora_alias" (
    "id" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "nomeNoRelatorio" TEXT NOT NULL,

    CONSTRAINT "vendedora_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_mensal" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "mesReferencia" DATE NOT NULL,
    "valorLoja" DECIMAL(14,2) NOT NULL,
    "paresLoja" DECIMAL(14,4) NOT NULL,
    "bolsasLoja" DECIMAL(14,4) NOT NULL,
    "pa" DECIMAL(8,4) NOT NULL,
    "conversao" DECIMAL(8,4) NOT NULL,
    "crm" DECIMAL(8,4) NOT NULL,
    "modoRateio" "ModoRateio" NOT NULL DEFAULT 'PROPORCIONAL',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_mensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_mes" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "mesReferencia" DATE NOT NULL,
    "valorPontoVendedora" DECIMAL(10,2) NOT NULL,
    "valorPontoGerente" DECIMAL(10,2) NOT NULL,
    "totalPontosAlto" DECIMAL(6,2) NOT NULL DEFAULT 40,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_mes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regra_pontuacao" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "mesReferencia" DATE NOT NULL,
    "indicador" "Indicador" NOT NULL,
    "pontosBase" DECIMAL(6,2) NOT NULL,
    "pontosAlto" DECIMAL(6,2) NOT NULL,
    "rateiaPorVendedora" BOOLEAN NOT NULL,
    "proporcionalAosDias" BOOLEAN NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "regra_pontuacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faixa_pontuacao" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "mesReferencia" DATE NOT NULL,
    "ordem" INTEGER NOT NULL,
    "pctMin" DECIMAL(8,4) NOT NULL,
    "pctMinInclusivo" BOOLEAN NOT NULL DEFAULT true,
    "pctMax" DECIMAL(8,4),
    "pctMaxInclusivo" BOOLEAN NOT NULL DEFAULT false,
    "tipo" "TipoFaixa" NOT NULL,
    "pontosFixos" DECIMAL(6,2),

    CONSTRAINT "faixa_pontuacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacao" (
    "id" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "arquivoUrl" TEXT,
    "sha256" TEXT NOT NULL,
    "dataReferencia" DATE NOT NULL,
    "extraidoEm" TIMESTAMP(3),
    "importadoPor" TEXT NOT NULL,
    "status" "StatusImportacao" NOT NULL DEFAULT 'PENDENTE',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acumulado_importado" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "linhaOriginal" INTEGER NOT NULL,
    "valor" DECIMAL(14,4) NOT NULL,
    "baseComissao" DECIMAL(14,4) NOT NULL,
    "metaValor" DECIMAL(14,2) NOT NULL,
    "pa" DECIMAL(10,4) NOT NULL,
    "ticketMedio" DECIMAL(14,4) NOT NULL,
    "bs" DECIMAL(14,4) NOT NULL,
    "oportunidades" INTEGER NOT NULL,
    "boletos" INTEGER NOT NULL,
    "conversao" DECIMAL(10,4) NOT NULL,
    "calcados" INTEGER NOT NULL,
    "bolsas" INTEGER NOT NULL,
    "cintos" INTEGER NOT NULL,
    "carteiras" INTEGER NOT NULL,
    "meias" INTEGER NOT NULL,
    "kitCuidado" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "acumulado_importado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_diario" (
    "id" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "vendasInfluenciadas" INTEGER NOT NULL,
    "registradoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_diario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reuniao" (
    "id" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "registradoPor" TEXT NOT NULL,
    "pauta" TEXT NOT NULL DEFAULT '',
    "acordos" TEXT NOT NULL DEFAULT '',
    "observacoes" TEXT NOT NULL DEFAULT '',
    "proximosPassos" TEXT NOT NULL DEFAULT '',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reuniao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resultado_diario" (
    "id" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "importacaoBaseId" TEXT,
    "valor" DECIMAL(14,4) NOT NULL,
    "calcados" INTEGER NOT NULL,
    "bolsas" INTEGER NOT NULL,
    "boletos" INTEGER NOT NULL,
    "oportunidades" INTEGER NOT NULL,
    "totalPecas" INTEGER NOT NULL,
    "pa" DECIMAL(10,4),
    "conversao" DECIMAL(10,4),
    "metaValorMes" DECIMAL(14,2) NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resultado_diario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apuracao_dia" (
    "id" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "indicador" "Indicador" NOT NULL,
    "realizadoDia" DECIMAL(16,4),
    "metaDia" DECIMAL(16,4),
    "faixaDia" "TipoFaixa",
    "acumulado" DECIMAL(16,4),
    "metaProporcional" DECIMAL(16,4),
    "pct" DECIMAL(10,4),
    "faixa" "TipoFaixa",
    "pontos" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "bonusReais" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "diasDecorridos" INTEGER NOT NULL,
    "diasDoMes" INTEGER NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apuracao_dia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apuracao_loja_dia" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "indicador" "Indicador" NOT NULL,
    "acumulado" DECIMAL(16,4),
    "metaProporcional" DECIMAL(16,4),
    "pct" DECIMAL(10,4),
    "faixa" "TipoFaixa",
    "pontos" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "bonusReais" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "diasDecorridos" INTEGER NOT NULL,
    "diasDoMes" INTEGER NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apuracao_loja_dia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loja_slug_key" ON "loja"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "loja_chaveRelatorio_key" ON "loja"("chaveRelatorio");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_username_key" ON "usuario"("username");

-- CreateIndex
CREATE INDEX "usuario_lojaId_idx" ON "usuario"("lojaId");

-- CreateIndex
CREATE INDEX "sessao_usuarioId_idx" ON "sessao"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "vendedora_usuarioId_key" ON "vendedora"("usuarioId");

-- CreateIndex
CREATE INDEX "vendedora_lojaId_idx" ON "vendedora"("lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "vendedora_lojaId_nome_key" ON "vendedora"("lojaId", "nome");

-- CreateIndex
CREATE INDEX "vendedora_alias_vendedoraId_idx" ON "vendedora_alias"("vendedoraId");

-- CreateIndex
CREATE UNIQUE INDEX "vendedora_alias_lojaId_nomeNoRelatorio_key" ON "vendedora_alias"("lojaId", "nomeNoRelatorio");

-- CreateIndex
CREATE UNIQUE INDEX "meta_mensal_lojaId_mesReferencia_key" ON "meta_mensal"("lojaId", "mesReferencia");

-- CreateIndex
CREATE UNIQUE INDEX "config_mes_lojaId_mesReferencia_key" ON "config_mes"("lojaId", "mesReferencia");

-- CreateIndex
CREATE UNIQUE INDEX "regra_pontuacao_lojaId_mesReferencia_indicador_key" ON "regra_pontuacao"("lojaId", "mesReferencia", "indicador");

-- CreateIndex
CREATE UNIQUE INDEX "faixa_pontuacao_lojaId_mesReferencia_ordem_key" ON "faixa_pontuacao"("lojaId", "mesReferencia", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "importacao_sha256_key" ON "importacao"("sha256");

-- CreateIndex
CREATE INDEX "importacao_dataReferencia_idx" ON "importacao"("dataReferencia");

-- CreateIndex
CREATE INDEX "acumulado_importado_vendedoraId_idx" ON "acumulado_importado"("vendedoraId");

-- CreateIndex
CREATE INDEX "acumulado_importado_lojaId_idx" ON "acumulado_importado"("lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "acumulado_importado_importacaoId_vendedoraId_key" ON "acumulado_importado"("importacaoId", "vendedoraId");

-- CreateIndex
CREATE INDEX "crm_diario_data_idx" ON "crm_diario"("data");

-- CreateIndex
CREATE UNIQUE INDEX "crm_diario_vendedoraId_data_key" ON "crm_diario"("vendedoraId", "data");

-- CreateIndex
CREATE INDEX "reuniao_vendedoraId_data_idx" ON "reuniao"("vendedoraId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "reuniao_vendedoraId_data_key" ON "reuniao"("vendedoraId", "data");

-- CreateIndex
CREATE INDEX "resultado_diario_data_idx" ON "resultado_diario"("data");

-- CreateIndex
CREATE UNIQUE INDEX "resultado_diario_vendedoraId_data_key" ON "resultado_diario"("vendedoraId", "data");

-- CreateIndex
CREATE INDEX "apuracao_dia_vendedoraId_data_idx" ON "apuracao_dia"("vendedoraId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "apuracao_dia_vendedoraId_data_indicador_key" ON "apuracao_dia"("vendedoraId", "data", "indicador");

-- CreateIndex
CREATE INDEX "apuracao_loja_dia_lojaId_data_idx" ON "apuracao_loja_dia"("lojaId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "apuracao_loja_dia_lojaId_data_indicador_key" ON "apuracao_loja_dia"("lojaId", "data", "indicador");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedora" ADD CONSTRAINT "vendedora_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedora" ADD CONSTRAINT "vendedora_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedora_alias" ADD CONSTRAINT "vendedora_alias_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "vendedora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedora_alias" ADD CONSTRAINT "vendedora_alias_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_mensal" ADD CONSTRAINT "meta_mensal_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_mes" ADD CONSTRAINT "config_mes_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regra_pontuacao" ADD CONSTRAINT "regra_pontuacao_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faixa_pontuacao" ADD CONSTRAINT "faixa_pontuacao_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_importadoPor_fkey" FOREIGN KEY ("importadoPor") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acumulado_importado" ADD CONSTRAINT "acumulado_importado_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acumulado_importado" ADD CONSTRAINT "acumulado_importado_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acumulado_importado" ADD CONSTRAINT "acumulado_importado_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "vendedora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_diario" ADD CONSTRAINT "crm_diario_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "vendedora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_diario" ADD CONSTRAINT "crm_diario_registradoPor_fkey" FOREIGN KEY ("registradoPor") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reuniao" ADD CONSTRAINT "reuniao_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "vendedora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reuniao" ADD CONSTRAINT "reuniao_registradoPor_fkey" FOREIGN KEY ("registradoPor") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultado_diario" ADD CONSTRAINT "resultado_diario_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "vendedora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultado_diario" ADD CONSTRAINT "resultado_diario_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultado_diario" ADD CONSTRAINT "resultado_diario_importacaoBaseId_fkey" FOREIGN KEY ("importacaoBaseId") REFERENCES "importacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuracao_dia" ADD CONSTRAINT "apuracao_dia_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "vendedora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuracao_loja_dia" ADD CONSTRAINT "apuracao_loja_dia_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
