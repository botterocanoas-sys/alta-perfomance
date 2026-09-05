import { Indicador, Prisma, SituacaoApuracao, TipoFaixa } from "@prisma/client";

import { diasDecorridos, diasNoMes, fimDoMes, mesDe } from "@/lib/data";
import {
  apurarTudo,
  COMPONENTES_ZERADOS,
  faixaDe,
  metasDaGerente,
  metasDaVendedora,
  realizadoPorIndicador,
  SITUACAO,
  ritmoDoMes,
  seloDoRitmo,
  somarComponentes,
  totalDePontosAlto,
  type Ritmo,
  type Selo,
  type Componentes,
  type Faixa,
  type MetasDaLoja,
  type Regra,
} from "@/lib/pontuacao";
import type { Banco } from "@/lib/relatorio/recalcular";

/**
 * Aplica o motor de pontos sobre o que está no banco e grava a apuração de
 * cada dia, por vendedora e por loja.
 *
 * Como tudo aqui é derivado, o recálculo apaga o mês e refaz. É o que faz uma
 * correção de meta, um lançamento de CRM atrasado ou uma importação nova se
 * propagarem sozinhos pelo mês inteiro.
 */

/** Só o que a tela precisa saber para não confundir ausência com zero. */
const SITUACAO_NO_BANCO: Record<string, SituacaoApuracao> = {
  [SITUACAO.APURADA]: SituacaoApuracao.APURADA,
  [SITUACAO.SEM_MEDICAO]: SituacaoApuracao.SEM_MEDICAO,
  [SITUACAO.FORA_DA_APURACAO]: SituacaoApuracao.FORA_DA_APURACAO,
};

const decimal = (valor: number | null | undefined, casas = 4) =>
  valor === null || valor === undefined || !Number.isFinite(valor)
    ? null
    : new Prisma.Decimal(valor.toFixed(casas));

export type ResumoDoRecalculo = {
  lojas: number;
  vendedoras: number;
  dias: number;
  linhas: number;
  /** Lojas sem meta cadastrada no mês: a apuração fica em branco até cadastrar. */
  semMeta: string[];
  /** Lojas cuja soma dos pontos "alto" não fecha no total combinado. */
  pontuacaoDesbalanceada: { loja: string; soma: number; esperado: number }[];
};

export async function recalcularApuracao(
  banco: Banco,
  mesReferencia: Date,
  lojaIds?: string[],
): Promise<ResumoDoRecalculo> {
  const mes = mesDe(mesReferencia);
  const inicio = mes;
  const fim = fimDoMes(mes);
  const totalDeDiasDoMes = diasNoMes(mes);

  const lojas = await banco.loja.findMany({
    where: lojaIds?.length ? { id: { in: lojaIds } } : {},
    orderBy: { slug: "asc" },
  });

  const resumo: ResumoDoRecalculo = {
    lojas: 0,
    vendedoras: 0,
    dias: 0,
    linhas: 0,
    semMeta: [],
    pontuacaoDesbalanceada: [],
  };

  for (const loja of lojas) {
    // Apaga antes: uma vendedora que saiu do relatório não deixa apuração velha.
    await banco.apuracaoDia.deleteMany({
      where: { data: { gte: inicio, lte: fim }, vendedora: { lojaId: loja.id } },
    });
    await banco.apuracaoLojaDia.deleteMany({
      where: { data: { gte: inicio, lte: fim }, lojaId: loja.id },
    });

    const [meta, config, regrasNoBanco, faixasNoBanco] = await Promise.all([
      banco.metaMensal.findUnique({
        where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia: mes } },
      }),
      banco.configMes.findUnique({
        where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia: mes } },
      }),
      banco.regraPontuacao.findMany({
        where: { lojaId: loja.id, mesReferencia: mes },
        orderBy: { indicador: "asc" },
      }),
      banco.faixaPontuacao.findMany({
        where: { lojaId: loja.id, mesReferencia: mes },
        orderBy: { ordem: "asc" },
      }),
    ]);

    // Sem meta ou sem configuração não há o que apurar. Não é erro: é a loja
    // esperando o cadastro do mês.
    if (!meta || !config || regrasNoBanco.length === 0 || faixasNoBanco.length === 0) {
      resumo.semMeta.push(loja.nome);
      continue;
    }

    const regras: Regra[] = regrasNoBanco.map((regra) => ({
      indicador: regra.indicador,
      pontosBase: regra.pontosBase.toNumber(),
      pontosAlto: regra.pontosAlto.toNumber(),
      rateiaPorVendedora: regra.rateiaPorVendedora,
      proporcionalAosDias: regra.proporcionalAosDias,
      ativo: regra.ativo,
    }));

    const faixas: Faixa[] = faixasNoBanco.map((faixa) => ({
      ordem: faixa.ordem,
      pctMin: faixa.pctMin.toNumber(),
      pctMinInclusivo: faixa.pctMinInclusivo,
      pctMax: faixa.pctMax?.toNumber() ?? null,
      pctMaxInclusivo: faixa.pctMaxInclusivo,
      tipo: faixa.tipo,
      pontosFixos: faixa.pontosFixos?.toNumber() ?? null,
    }));

    const somaDosAltos = totalDePontosAlto(regras);
    const esperado = config.totalPontosAlto.toNumber();
    if (Math.abs(somaDosAltos - esperado) > 1e-9) {
      resumo.pontuacaoDesbalanceada.push({ loja: loja.nome, soma: somaDosAltos, esperado });
    }

    const metasDaLoja: MetasDaLoja = {
      valor: meta.valorLoja.toNumber(),
      pares: meta.paresLoja.toNumber(),
      bolsas: meta.bolsasLoja.toNumber(),
      pa: meta.pa.toNumber(),
      conversao: meta.conversao.toNumber(),
      crm: meta.crm.toNumber(),
      modoRateio: meta.modoRateio,
    };

    const [resultados, crm, vendedoras] = await Promise.all([
      banco.resultadoDiario.findMany({
        where: { data: { gte: inicio, lte: fim }, vendedora: { lojaId: loja.id } },
        orderBy: { data: "asc" },
      }),
      banco.crmDiario.findMany({
        where: { data: { gte: inicio, lte: fim }, vendedora: { lojaId: loja.id } },
      }),
      banco.vendedora.findMany({ where: { lojaId: loja.id } }),
    ]);

    if (resultados.length === 0) continue;

    const cadastro = new Map(vendedoras.map((vendedora) => [vendedora.id, vendedora]));

    // A meta de Valor do mês é a do relatório mais recente. Se ela mudar no
    // meio do mês, vale a última — é o número que o sistema da loja considera.
    const metaValorDoMes = new Map<string, number>();
    for (const resultado of resultados) {
      metaValorDoMes.set(resultado.vendedoraId, resultado.metaValorMes.toNumber());
    }

    /** Quem está no programa neste mês: meta maior que zero e conta como vendedora. */
    const ativas = [...metaValorDoMes.entries()].filter(
      ([id, metaValor]) => metaValor > 0 && (cadastro.get(id)?.contaComoVendedora ?? false),
    );
    const somaDasMetasAtivas = ativas.reduce((soma, [, metaValor]) => soma + metaValor, 0);

    const crmPorVendedoraEData = new Map<string, number>();
    for (const lancamento of crm) {
      crmPorVendedoraEData.set(
        `${lancamento.vendedoraId}|${lancamento.data.getTime()}`,
        lancamento.vendasInfluenciadas,
      );
    }

    const datas = [...new Set(resultados.map((r) => r.data.getTime()))].sort((a, b) => a - b);

    /** Acumulado corrido de cada vendedora, dia a dia. */
    const acumuladoPorVendedora = new Map<string, Componentes>();
    const linhasDaVendedora: Prisma.ApuracaoDiaCreateManyInput[] = [];
    const linhasDaLoja: Prisma.ApuracaoLojaDiaCreateManyInput[] = [];

    for (const tempo of datas) {
      const data = new Date(tempo);
      const dias = { decorridos: diasDecorridos(data), noMes: totalDeDiasDoMes };
      const doDia = resultados.filter((r) => r.data.getTime() === tempo);

      // "Da loja" = tudo que a loja vendeu, com a trava manual respeitada.
      const acumuladoDasAtivas: Componentes[] = [];
      const componentesDoDiaDasAtivas: Componentes[] = [];

      for (const resultado of doDia) {
        const vendedora = cadastro.get(resultado.vendedoraId);
        if (!vendedora) continue;

        const componentesDoDia: Componentes = {
          valor: resultado.valor.toNumber(),
          calcados: resultado.calcados,
          bolsas: resultado.bolsas,
          totalPecas: resultado.totalPecas,
          boletos: resultado.boletos,
          oportunidades: resultado.oportunidades,
          crmVendas: crmPorVendedoraEData.get(`${resultado.vendedoraId}|${tempo}`) ?? 0,
        };

        const acumulado = somarComponentes([
          acumuladoPorVendedora.get(resultado.vendedoraId) ?? COMPONENTES_ZERADOS,
          componentesDoDia,
        ]);
        acumuladoPorVendedora.set(resultado.vendedoraId, acumulado);

        const metaValor = metaValorDoMes.get(resultado.vendedoraId) ?? 0;

        // O realizado da LOJA é o total da loja, e não só o de quem está no
        // programa: uma vendedora sem meta neste mês ainda vende, e a venda
        // dela é da loja. É o que a linha "Subtotal" do relatório soma, e é
        // sobre esse total que a gerente é remunerada.
        //
        // A trava manual `contaComoVendedora` continua valendo: ela existe
        // justamente para tirar do total as linhas que não são vendedoras.
        if (vendedora.contaComoVendedora) {
          acumuladoDasAtivas.push(acumulado);
          componentesDoDiaDasAtivas.push(componentesDoDia);
        }
        void metaValor;

        const metas = metasDaVendedora({
          metaValorDaVendedora: vendedora.contaComoVendedora ? metaValor : 0,
          somaDasMetasAtivas,
          quantidadeDeAtivas: ativas.length,
          loja: metasDaLoja,
        });

        const apurado = apurarTudo({
          regras,
          faixas,
          realizados: realizadoPorIndicador(acumulado),
          metas,
          dias,
          valorDoPonto: config.valorPontoVendedora.toNumber(),
          recebeBonus: vendedora.recebeBonusVendedora,
        });

        // A leitura do dia isolado alimenta o gráfico de 7 dias e a contagem de
        // consistência: em quantos dias ela ficou acima de 110%.
        const realizadoDoDia = realizadoPorIndicador(componentesDoDia);

        for (const item of apurado.porIndicador) {
          const regra = regras.find((r) => r.indicador === item.indicador)!;
          const metaDoIndicador = metas[item.indicador];
          const metaDoDia =
            metaDoIndicador === null
              ? null
              : regra.proporcionalAosDias
                ? metaDoIndicador / totalDeDiasDoMes
                : metaDoIndicador;

          const realizadoDia = realizadoDoDia[item.indicador];
          const faixaDoDia =
            metaDoDia !== null && metaDoDia > 0 && realizadoDia !== null
              ? (faixaDe(realizadoDia / metaDoDia, faixas)?.tipo ?? null)
              : null;

          linhasDaVendedora.push({
            vendedoraId: resultado.vendedoraId,
            data,
            indicador: item.indicador,
            realizadoDia: decimal(realizadoDia),
            metaDia: decimal(metaDoDia),
            faixaDia: faixaDoDia as TipoFaixa | null,
            situacao: SITUACAO_NO_BANCO[item.situacao],
            meta: decimal(item.meta),
            acumulado: decimal(item.realizado),
            metaProporcional: decimal(item.metaProporcional),
            pct: decimal(item.pct),
            faixa: item.faixa,
            pontos: new Prisma.Decimal(item.pontos.toFixed(2)),
            bonusReais: new Prisma.Decimal(
              (item.pontos * (vendedora.recebeBonusVendedora ? config.valorPontoVendedora.toNumber() : 0)).toFixed(2),
            ),
            diasDecorridos: dias.decorridos,
            diasDoMes: dias.noMes,
          });
        }
      }

      // A loja: o total dela contra a meta cheia dela.
      const acumuladoDaLoja = somarComponentes(acumuladoDasAtivas);
      const apuradoDaLoja = apurarTudo({
        regras,
        faixas,
        realizados: realizadoPorIndicador(acumuladoDaLoja),
        metas: metasDaGerente(metasDaLoja),
        dias,
        valorDoPonto: config.valorPontoGerente.toNumber(),
      });

      for (const item of apuradoDaLoja.porIndicador) {
        linhasDaLoja.push({
          lojaId: loja.id,
          data,
          indicador: item.indicador,
          situacao: SITUACAO_NO_BANCO[item.situacao],
          meta: decimal(item.meta),
          acumulado: decimal(item.realizado),
          metaProporcional: decimal(item.metaProporcional),
          pct: decimal(item.pct),
          faixa: item.faixa,
          pontos: new Prisma.Decimal(item.pontos.toFixed(2)),
          bonusReais: new Prisma.Decimal(
            (item.pontos * config.valorPontoGerente.toNumber()).toFixed(2),
          ),
          diasDecorridos: dias.decorridos,
          diasDoMes: dias.noMes,
        });
      }
    }

    if (linhasDaVendedora.length > 0) {
      await banco.apuracaoDia.createMany({ data: linhasDaVendedora });
    }
    if (linhasDaLoja.length > 0) {
      await banco.apuracaoLojaDia.createMany({ data: linhasDaLoja });
    }

    resumo.lojas += 1;
    resumo.vendedoras += acumuladoPorVendedora.size;
    resumo.dias += datas.length;
    resumo.linhas += linhasDaVendedora.length + linhasDaLoja.length;
  }

  return resumo;
}

// ─────────────────────────────────────────────────────────────
// Leitura para as telas
// ─────────────────────────────────────────────────────────────

export type LinhaDoRanking = {
  vendedoraId: string;
  nome: string;
  recebeBonusVendedora: boolean;
  pontos: number;
  bonusReais: number;
  /** Média das tendências ponderada pelos pontos, com a cobertura da medição. */
  ritmo: Ritmo;
  selo: Selo | null;
  porIndicador: {
    indicador: Indicador;
    situacao: SituacaoApuracao;
    meta: number | null;
    acumulado: number | null;
    metaProporcional: number | null;
    pct: number | null;
    faixa: TipoFaixa | null;
    pontos: number;
  }[];
};

export type ApuracaoDaLoja = {
  data: Date | null;
  diasDecorridos: number;
  diasDoMes: number;
  vendedoras: LinhaDoRanking[];
  gerente: {
    pontos: number;
    bonusReais: number;
    ritmo: Ritmo;
    selo: Selo | null;
    porIndicador: LinhaDoRanking["porIndicador"];
  } | null;
};

/**
 * A apuração de uma loja numa data — a mais recente, se nenhuma for pedida.
 * É a leitura que o painel e a tela de pontos usam.
 */
export async function lerApuracao(
  banco: Banco,
  lojaId: string,
  data?: Date,
): Promise<ApuracaoDaLoja> {
  const maisRecente =
    data ??
    (
      await banco.apuracaoLojaDia.findFirst({
        where: { lojaId },
        orderBy: { data: "desc" },
        select: { data: true },
      })
    )?.data;

  if (!maisRecente) {
    return { data: null, diasDecorridos: 0, diasDoMes: 0, vendedoras: [], gerente: null };
  }

  const [daLoja, dasVendedoras, regras] = await Promise.all([
    banco.apuracaoLojaDia.findMany({
      where: { lojaId, data: maisRecente },
      orderBy: { indicador: "asc" },
    }),
    banco.apuracaoDia.findMany({
      where: { data: maisRecente, vendedora: { lojaId } },
      include: { vendedora: { select: { nome: true, recebeBonusVendedora: true } } },
      orderBy: [{ vendedora: { nome: "asc" } }, { indicador: "asc" }],
    }),
    banco.regraPontuacao.findMany({
      where: { lojaId, mesReferencia: mesDe(maisRecente) },
      select: { indicador: true, pontosAlto: true },
    }),
  ]);

  // O peso de cada indicador no ritmo é o que ele vale em pontos.
  const pontosAltoPorIndicador = new Map(
    regras.map((regra) => [regra.indicador, regra.pontosAlto.toNumber()]),
  );
  const pesar = (itens: LinhaDoRanking["porIndicador"]) =>
    itens.map((item) => ({
      pct: item.pct,
      situacao:
        item.situacao === SituacaoApuracao.APURADA
          ? SITUACAO.APURADA
          : item.situacao === SituacaoApuracao.SEM_MEDICAO
            ? SITUACAO.SEM_MEDICAO
            : SITUACAO.FORA_DA_APURACAO,
      pontosAlto: pontosAltoPorIndicador.get(item.indicador) ?? 0,
    }));

  const porVendedora = new Map<string, LinhaDoRanking>();

  for (const linha of dasVendedoras) {
    const atual =
      porVendedora.get(linha.vendedoraId) ??
      ({
        vendedoraId: linha.vendedoraId,
        nome: linha.vendedora.nome,
        recebeBonusVendedora: linha.vendedora.recebeBonusVendedora,
        pontos: 0,
        bonusReais: 0,
        ritmo: { valor: null, pesoMedido: 0, pesoTotal: 0, cobertura: 0 },
        selo: null,
        porIndicador: [],
      } satisfies LinhaDoRanking);

    atual.pontos += linha.pontos.toNumber();
    atual.bonusReais += linha.bonusReais.toNumber();
    atual.porIndicador.push({
      indicador: linha.indicador,
      situacao: linha.situacao,
      meta: linha.meta?.toNumber() ?? null,
      acumulado: linha.acumulado?.toNumber() ?? null,
      metaProporcional: linha.metaProporcional?.toNumber() ?? null,
      pct: linha.pct?.toNumber() ?? null,
      faixa: linha.faixa,
      pontos: linha.pontos.toNumber(),
    });

    porVendedora.set(linha.vendedoraId, atual);
  }

  const indicadoresDaLoja: LinhaDoRanking["porIndicador"] = daLoja.map((linha) => ({
    indicador: linha.indicador,
    situacao: linha.situacao,
    meta: linha.meta?.toNumber() ?? null,
    acumulado: linha.acumulado?.toNumber() ?? null,
    metaProporcional: linha.metaProporcional?.toNumber() ?? null,
    pct: linha.pct?.toNumber() ?? null,
    faixa: linha.faixa,
    pontos: linha.pontos.toNumber(),
  }));

  const ritmoDaLoja = ritmoDoMes(pesar(indicadoresDaLoja));

  const vendedoras = [...porVendedora.values()]
    .map((linha) => {
      const ritmo = ritmoDoMes(pesar(linha.porIndicador));
      return { ...linha, ritmo, selo: seloDoRitmo(ritmo) };
    })
    // Pontos primeiro: é a régua do programa, e não varia com a cobertura.
    // O ritmo só desempata.
    .sort((a, b) => b.pontos - a.pontos || (b.ritmo.valor ?? -1) - (a.ritmo.valor ?? -1));

  return {
    data: maisRecente,
    diasDecorridos: daLoja[0]?.diasDecorridos ?? 0,
    diasDoMes: daLoja[0]?.diasDoMes ?? 0,
    vendedoras,
    gerente: daLoja.length
      ? {
          pontos: daLoja.reduce((soma, linha) => soma + linha.pontos.toNumber(), 0),
          bonusReais: daLoja.reduce((soma, linha) => soma + linha.bonusReais.toNumber(), 0),
          ritmo: ritmoDaLoja,
          selo: seloDoRitmo(ritmoDaLoja),
          porIndicador: daLoja.map((linha) => ({
            indicador: linha.indicador,
            situacao: linha.situacao,
            meta: linha.meta?.toNumber() ?? null,
            acumulado: linha.acumulado?.toNumber() ?? null,
            metaProporcional: linha.metaProporcional?.toNumber() ?? null,
            pct: linha.pct?.toNumber() ?? null,
            faixa: linha.faixa,
            pontos: linha.pontos.toNumber(),
          })),
        }
      : null,
  };
}
