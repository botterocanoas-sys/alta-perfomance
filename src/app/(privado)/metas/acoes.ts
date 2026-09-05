"use server";

import { Indicador } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recalcularApuracao } from "@/lib/apuracao";
import { mesDe } from "@/lib/data";
import { prisma } from "@/lib/db";
import { AcessoNegado, exigirAcessoALoja } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

/**
 * Metas e regras de pontuação do mês (seções 8.7 e 7 do brief).
 *
 * A distribuição dos pontos entre os indicadores muda conforme a estratégia do
 * mês, mas o total dos pontos "alto" tem de continuar fechando no combinado —
 * e a tela **bloqueia o salvamento** quando não fecha.
 */

export type EstadoDasMetas = { erro: string | null; feito: string | null };

const numeroBr = (texto: unknown) =>
  Number(String(texto ?? "").trim().replace(/\./g, "").replace(",", "."));

const naoNegativo = z
  .preprocess(numeroBr, z.number().finite().nonnegative());

const Metas = z.object({
  lojaId: z.string().uuid(),
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  valorLoja: naoNegativo,
  paresLoja: naoNegativo,
  bolsasLoja: naoNegativo,
  pa: naoNegativo,
  conversao: naoNegativo,
  crm: naoNegativo,
  modoRateio: z.enum(["PROPORCIONAL", "IGUAL"]),
  valorPontoVendedora: naoNegativo,
  valorPontoGerente: naoNegativo,
  totalPontosAlto: naoNegativo,
});

const INDICADORES = Object.values(Indicador);

export async function salvarMetas(
  _anterior: EstadoDasMetas,
  formulario: FormData,
): Promise<EstadoDasMetas> {
  const sessao = await sessaoAtual();
  if (!sessao) return { erro: "Sua sessão expirou. Entre de novo.", feito: null };

  const dados = Metas.safeParse({
    lojaId: formulario.get("lojaId"),
    mes: formulario.get("mes"),
    valorLoja: formulario.get("valorLoja"),
    paresLoja: formulario.get("paresLoja"),
    bolsasLoja: formulario.get("bolsasLoja"),
    pa: formulario.get("pa"),
    conversao: formulario.get("conversao"),
    crm: formulario.get("crm"),
    modoRateio: formulario.get("modoRateio"),
    valorPontoVendedora: formulario.get("valorPontoVendedora"),
    valorPontoGerente: formulario.get("valorPontoGerente"),
    totalPontosAlto: formulario.get("totalPontosAlto"),
  });

  if (!dados.success) {
    return { erro: "Confira os números: algum campo está vazio ou não é um número.", feito: null };
  }

  try {
    await exigirAcessoALoja(sessao, dados.data.lojaId);
  } catch (erro) {
    if (erro instanceof AcessoNegado) return { erro: erro.message, feito: null };
    throw erro;
  }

  // As metas de quantidade não podem ser zero: zero deixaria a loja inteira
  // fora da apuração, sem ninguém perceber.
  for (const [campo, rotulo] of [
    ["valorLoja", "Valor"],
    ["paresLoja", "Pares"],
    ["bolsasLoja", "Bolsas"],
    ["pa", "P.A."],
    ["conversao", "Conversão"],
    ["crm", "CRM"],
  ] as const) {
    if (dados.data[campo] <= 0) {
      return { erro: `A meta de ${rotulo} precisa ser maior que zero.`, feito: null };
    }
  }

  // Os pontos de cada indicador, e a trava do total.
  const pontos = INDICADORES.map((indicador) => ({
    indicador,
    base: numeroBr(formulario.get(`base:${indicador}`)),
    alto: numeroBr(formulario.get(`alto:${indicador}`)),
    ativo: formulario.getAll(`ativo:${indicador}`).map(String).includes("sim"),
  }));

  for (const linha of pontos) {
    if (!Number.isFinite(linha.base) || !Number.isFinite(linha.alto) || linha.base < 0 || linha.alto < 0) {
      return { erro: `Os pontos de ${linha.indicador} precisam ser números.`, feito: null };
    }
    if (linha.ativo && linha.alto < linha.base) {
      return {
        erro: `Em ${linha.indicador}, os pontos "alto" não podem ser menores que os "base".`,
        feito: null,
      };
    }
  }

  const somaDosAltos = pontos
    .filter((linha) => linha.ativo)
    .reduce((soma, linha) => soma + linha.alto, 0);

  if (Math.abs(somaDosAltos - dados.data.totalPontosAlto) > 1e-9) {
    return {
      erro:
        `A soma dos pontos "alto" dos indicadores ativos está em ${somaDosAltos.toLocaleString("pt-BR")}, ` +
        `e precisa fechar em ${dados.data.totalPontosAlto.toLocaleString("pt-BR")}. Ajuste antes de salvar.`,
      feito: null,
    };
  }

  const mesReferencia = mesDe(new Date(`${dados.data.mes}-01T00:00:00.000Z`));
  const { lojaId } = dados.data;

  await prisma.$transaction(async (tx) => {
    await tx.metaMensal.upsert({
      where: { lojaId_mesReferencia: { lojaId, mesReferencia } },
      update: {
        valorLoja: dados.data.valorLoja,
        paresLoja: dados.data.paresLoja,
        bolsasLoja: dados.data.bolsasLoja,
        pa: dados.data.pa,
        conversao: dados.data.conversao,
        crm: dados.data.crm,
        modoRateio: dados.data.modoRateio,
      },
      create: {
        lojaId,
        mesReferencia,
        valorLoja: dados.data.valorLoja,
        paresLoja: dados.data.paresLoja,
        bolsasLoja: dados.data.bolsasLoja,
        pa: dados.data.pa,
        conversao: dados.data.conversao,
        crm: dados.data.crm,
        modoRateio: dados.data.modoRateio,
      },
    });

    await tx.configMes.upsert({
      where: { lojaId_mesReferencia: { lojaId, mesReferencia } },
      update: {
        valorPontoVendedora: dados.data.valorPontoVendedora,
        valorPontoGerente: dados.data.valorPontoGerente,
        totalPontosAlto: dados.data.totalPontosAlto,
      },
      create: {
        lojaId,
        mesReferencia,
        valorPontoVendedora: dados.data.valorPontoVendedora,
        valorPontoGerente: dados.data.valorPontoGerente,
        totalPontosAlto: dados.data.totalPontosAlto,
      },
    });

    for (const linha of pontos) {
      // Rateio e proporcional são propriedade do indicador, não da estratégia
      // do mês: quantidades rateiam e encolhem com os dias, razões não.
      const ehQuantidade =
        linha.indicador === Indicador.VALOR ||
        linha.indicador === Indicador.PARES ||
        linha.indicador === Indicador.BOLSAS;

      await tx.regraPontuacao.upsert({
        where: {
          lojaId_mesReferencia_indicador: { lojaId, mesReferencia, indicador: linha.indicador },
        },
        update: { pontosBase: linha.base, pontosAlto: linha.alto, ativo: linha.ativo },
        create: {
          lojaId,
          mesReferencia,
          indicador: linha.indicador,
          pontosBase: linha.base,
          pontosAlto: linha.alto,
          rateiaPorVendedora: ehQuantidade,
          proporcionalAosDias: ehQuantidade,
          ativo: linha.ativo,
        },
      });
    }

    await recalcularApuracao(tx, mesReferencia, [lojaId]);
  });

  revalidatePath("/metas");
  revalidatePath("/painel");
  revalidatePath("/pontos");

  return { erro: null, feito: "Metas e pontuação salvas." };
}
