import { Indicador, SituacaoApuracao, TipoFaixa } from "@prisma/client";

import { lerApuracao, type LinhaDoRanking } from "@/lib/apuracao";
import { diaEmPortoAlegre, fimDoMes, mesDe } from "@/lib/data";
import { prisma } from "@/lib/db";
import { gerarInsights, type Insight } from "@/lib/insights";
import { melhorDegrau, proximoDegrau, type Degrau, type Faixa, type Regra } from "@/lib/pontuacao";

/**
 * Tudo que a tela da reunião precisa, numa leitura só.
 *
 * A tela é a mais importante do app: a gerente tem trinta segundos por
 * vendedora. A ordem aqui é a ordem da conversa — o que aconteceu, quanto
 * vale, o que atacar hoje, e o que ficou combinado da última vez.
 */

/** Quantos dias o gráfico e a comparação "melhorou ou piorou" olham para trás. */
const JANELA = 7;

export type PontoNoGrafico = {
  data: Date;
  /** Pontos projetados naquele dia — a apuração é mensal, isto é a foto. */
  pontos: number;
  /** O que aconteceu no próprio dia, para a barra ter sentido de esforço. */
  valorDoDia: number;
};

export type ComparacaoSemanal = {
  indicador: Indicador;
  /** Percentual de uma semana atrás, quando havia apuração. */
  pctAntes: number | null;
  pctAgora: number | null;
  /** 1 melhorou, -1 piorou, 0 igual, null sem base de comparação. */
  direcao: 1 | -1 | 0 | null;
};

export type Consistencia = {
  indicador: Indicador;
  acimaDe110: number;
  entre100e110: number;
  abaixoDe95: number;
  diasComDado: number;
};

export type DegrauNaTela = Degrau & {
  /** Quanto falta, já traduzido para a unidade que a vendedora entende. */
  falta: { quantidade: number; unidade: string };
  ganhoEmReais: number;
};

export type DadosDaReuniao = {
  data: Date | null;
  diasDecorridos: number;
  diasDoMes: number;
  linha: LinhaDoRanking | null;
  /** Pontos de ontem e a variação, para o veredito. */
  pontosOntem: number | null;
  variacao: number | null;
  grafico: PontoNoGrafico[];
  comparacao: ComparacaoSemanal[];
  consistencia: Consistencia[];
  atacarHoje: DegrauNaTela | null;
  /** De 3 a 5 frases, cada uma nascida de uma distância numérica. */
  insights: Insight[];
  /** O indicador com pior ritmo — nem sempre é o mesmo que atacar hoje. */
  piorIndicador: Indicador | null;
  mediaDaLoja: Map<Indicador, number>;
  reuniaoDeHoje: Reuniao | null;
  ultimaReuniao: Reuniao | null;
  historico: Reuniao[];
};

export type Reuniao = {
  id: string;
  data: Date;
  pauta: string;
  acordos: string;
  observacoes: string;
  proximosPassos: string;
  registradoPor: string;
};

/**
 * Traduz "falta 0,12 da meta proporcional" para a unidade real.
 *
 * Para quantidades é direto. Para razões, a conta é sobre o denominador que a
 * pessoa já tem: subir o P.A. de 1,3 para 1,6 com 7 boletos é vender mais
 * peças, e é assim que a gerente fala.
 */
function traduzirFalta(
  degrau: Degrau,
  componentes: { boletos: number; oportunidades: number; totalPecas: number; crmVendas: number },
): { quantidade: number; unidade: string } {
  const paraCima = (valor: number) => Math.max(1, Math.ceil(valor - 1e-9));

  switch (degrau.indicador) {
    case Indicador.VALOR:
      return { quantidade: Math.ceil(degrau.faltaNaMeta), unidade: "reais" };
    case Indicador.PARES:
      return { quantidade: paraCima(degrau.faltaNaMeta), unidade: "pares" };
    case Indicador.BOLSAS:
      return { quantidade: paraCima(degrau.faltaNaMeta), unidade: "bolsas" };
    case Indicador.PA: {
      // Peças a mais, com os boletos que ela já tem.
      const necessarias = degrau.alvoNaMeta * componentes.boletos - componentes.totalPecas;
      return { quantidade: paraCima(necessarias), unidade: "peças" };
    }
    case Indicador.CONVERSAO: {
      // Vendas a mais, nos atendimentos que ela já teve.
      const necessarios = degrau.alvoNaMeta * componentes.oportunidades - componentes.boletos;
      return { quantidade: paraCima(necessarios), unidade: "vendas" };
    }
    case Indicador.CRM: {
      const necessarias = degrau.alvoNaMeta * componentes.boletos - componentes.crmVendas;
      return { quantidade: paraCima(necessarias), unidade: "vendas com CRM" };
    }
  }
}

export async function lerDadosDaReuniao(
  vendedoraId: string,
  lojaId: string,
): Promise<DadosDaReuniao> {
  const apuracao = await lerApuracao(prisma, lojaId);
  const linha = apuracao.vendedoras.find((item) => item.vendedoraId === vendedoraId) ?? null;

  const vazio: DadosDaReuniao = {
    data: apuracao.data,
    diasDecorridos: apuracao.diasDecorridos,
    diasDoMes: apuracao.diasDoMes,
    linha,
    pontosOntem: null,
    variacao: null,
    grafico: [],
    comparacao: [],
    consistencia: [],
    atacarHoje: null,
    insights: [],
    piorIndicador: null,
    mediaDaLoja: new Map(),
    reuniaoDeHoje: null,
    ultimaReuniao: null,
    historico: [],
  };

  // A reunião é datada pelo dia em que ela ACONTECE, não pelo dia dos números.
  // A gerente conversa hoje sobre o relatório de ontem; usar a data da
  // importação faria o registro de hoje nunca ser encontrado.
  const reunioes = await lerReunioes(vendedoraId);
  if (!apuracao.data || !linha) return { ...vazio, ...reunioes };

  const hoje = apuracao.data;
  const mes = mesDe(hoje);
  const inicioDaJanela = new Date(hoje.getTime() - (JANELA - 1) * 86_400_000);
  const umaSemanaAtras = new Date(hoje.getTime() - JANELA * 86_400_000);

  const [porDia, resultadosDaJanela, daSemanaPassada, consistenciaCrua, regras, faixas, crm, resultados] =
    await Promise.all([
      prisma.apuracaoDia.groupBy({
        by: ["data"],
        where: { vendedoraId, data: { gte: inicioDaJanela, lte: hoje } },
        _sum: { pontos: true },
        orderBy: { data: "asc" },
      }),
      prisma.resultadoDiario.findMany({
        where: { vendedoraId, data: { gte: inicioDaJanela, lte: hoje } },
        orderBy: { data: "asc" },
      }),
      prisma.apuracaoDia.findMany({ where: { vendedoraId, data: umaSemanaAtras } }),
      prisma.apuracaoDia.findMany({
        where: { vendedoraId, data: { gte: mes, lte: hoje } },
        select: { indicador: true, faixaDia: true },
      }),
      prisma.regraPontuacao.findMany({ where: { lojaId, mesReferencia: mes } }),
      prisma.faixaPontuacao.findMany({ where: { lojaId, mesReferencia: mes }, orderBy: { ordem: "asc" } }),
      prisma.crmDiario.findMany({ where: { vendedoraId, data: { gte: mes, lte: hoje } } }),
      prisma.resultadoDiario.findMany({ where: { vendedoraId, data: { gte: mes, lte: hoje } } }),
    ]);

  // ── o gráfico dos últimos 7 dias com dado ──
  const valorPorDia = new Map(
    resultadosDaJanela.map((r) => [r.data.getTime(), r.valor.toNumber()]),
  );
  const grafico: PontoNoGrafico[] = porDia.map((dia) => ({
    data: dia.data,
    pontos: dia._sum.pontos?.toNumber() ?? 0,
    valorDoDia: valorPorDia.get(dia.data.getTime()) ?? 0,
  }));

  const ontem = grafico.length >= 2 ? grafico[grafico.length - 2] : null;
  const pontosOntem = ontem?.pontos ?? null;
  const variacao = pontosOntem === null ? null : linha.pontos - pontosOntem;

  // ── melhorou ou piorou em relação à semana passada ──
  const pctAntesPorIndicador = new Map(
    daSemanaPassada.map((item) => [item.indicador, item.pct?.toNumber() ?? null]),
  );
  const comparacao: ComparacaoSemanal[] = linha.porIndicador.map((item) => {
    const pctAntes = pctAntesPorIndicador.get(item.indicador) ?? null;
    const pctAgora = item.pct;

    const direcao =
      pctAntes === null || pctAgora === null
        ? null
        : pctAgora > pctAntes + 1e-6
          ? 1
          : pctAgora < pctAntes - 1e-6
            ? -1
            : 0;

    return { indicador: item.indicador, pctAntes, pctAgora, direcao: direcao as 1 | -1 | 0 | null };
  });

  // ── consistência do mês, pela faixa de cada DIA ──
  const consistencia: Consistencia[] = linha.porIndicador.map((item) => {
    const dias = consistenciaCrua.filter((linha) => linha.indicador === item.indicador);
    const comDado = dias.filter((dia) => dia.faixaDia !== null);

    return {
      indicador: item.indicador,
      acimaDe110: comDado.filter((dia) => dia.faixaDia === TipoFaixa.ALTO).length,
      entre100e110: comDado.filter((dia) => dia.faixaDia === TipoFaixa.BASE).length,
      abaixoDe95: comDado.filter((dia) => dia.faixaDia === TipoFaixa.ZERO).length,
      diasComDado: comDado.length,
    };
  });

  // ── o que atacar hoje ──
  const regrasTipadas: Regra[] = regras.map((regra) => ({
    indicador: regra.indicador,
    pontosBase: regra.pontosBase.toNumber(),
    pontosAlto: regra.pontosAlto.toNumber(),
    rateiaPorVendedora: regra.rateiaPorVendedora,
    proporcionalAosDias: regra.proporcionalAosDias,
    ativo: regra.ativo,
  }));
  const faixasTipadas: Faixa[] = faixas.map((faixa) => ({
    ordem: faixa.ordem,
    pctMin: faixa.pctMin.toNumber(),
    pctMinInclusivo: faixa.pctMinInclusivo,
    pctMax: faixa.pctMax?.toNumber() ?? null,
    pctMaxInclusivo: faixa.pctMaxInclusivo,
    tipo: faixa.tipo,
    pontosFixos: faixa.pontosFixos?.toNumber() ?? null,
  }));

  const componentes = {
    boletos: resultados.reduce((soma, r) => soma + r.boletos, 0),
    oportunidades: resultados.reduce((soma, r) => soma + r.oportunidades, 0),
    totalPecas: resultados.reduce((soma, r) => soma + r.totalPecas, 0),
    crmVendas: crm.reduce((soma, c) => soma + c.vendasInfluenciadas, 0),
  };

  const degraus = linha.porIndicador
    .filter((item) => item.situacao === SituacaoApuracao.APURADA)
    .map((item) => {
      const regra = regrasTipadas.find((r) => r.indicador === item.indicador);
      if (!regra) return null;
      return proximoDegrau({
        regra,
        faixas: faixasTipadas,
        pct: item.pct,
        metaProporcional: item.metaProporcional,
      });
    });

  const melhor = melhorDegrau(degraus);
  const valorDoPonto = linha.recebeBonusVendedora
    ? (await prisma.configMes.findUnique({
        where: { lojaId_mesReferencia: { lojaId, mesReferencia: mes } },
        select: { valorPontoVendedora: true },
      }))?.valorPontoVendedora.toNumber() ?? 0
    : 0;

  const atacarHoje: DegrauNaTela | null = melhor
    ? {
        ...melhor,
        falta: traduzirFalta(melhor, componentes),
        ganhoEmReais: melhor.ganhoEmPontos * valorDoPonto,
      }
    : null;

  // ── a média da loja, que os insights usam para comparar ──
  const mediaDaLoja = new Map<Indicador, number>();
  for (const item of apuracao.gerente?.porIndicador ?? []) {
    if (item.pct !== null) mediaDaLoja.set(item.indicador, item.pct);
  }

  const insights = gerarInsights({
    porIndicador: linha.porIndicador,
    mediaDaLoja,
    diasDecorridos: apuracao.diasDecorridos,
    diasDoMes: apuracao.diasDoMes,
    degrauNoCard: melhor,
    degraus: degraus.filter((degrau): degrau is Degrau => degrau !== null),
    valorDoPonto,
  });

  // ── o pior indicador, para a tela poder explicar a diferença ──
  const medidos = linha.porIndicador.filter(
    (item) => item.situacao === SituacaoApuracao.APURADA && item.pct !== null,
  );
  const piorIndicador =
    medidos.length > 0
      ? medidos.reduce((pior, item) => (item.pct! < pior.pct! ? item : pior)).indicador
      : null;

  return {
    data: apuracao.data,
    diasDecorridos: apuracao.diasDecorridos,
    diasDoMes: apuracao.diasDoMes,
    linha,
    pontosOntem,
    variacao,
    grafico,
    comparacao,
    consistencia,
    atacarHoje,
    insights,
    piorIndicador,
    mediaDaLoja,
    ...reunioes,
  };
}

async function lerReunioes(vendedoraId: string) {
  const dia = diaEmPortoAlegre();

  const todas = await prisma.reuniao.findMany({
    where: { vendedoraId },
    orderBy: { data: "desc" },
    take: 20,
    include: { usuario: { select: { nome: true } } },
  });

  const converter = (r: (typeof todas)[number]): Reuniao => ({
    id: r.id,
    data: r.data,
    pauta: r.pauta,
    acordos: r.acordos,
    observacoes: r.observacoes,
    proximosPassos: r.proximosPassos,
    registradoPor: r.usuario.nome,
  });

  const reuniaoDeHoje = todas.find((r) => r.data.getTime() === dia.getTime()) ?? null;

  // O que a gerente precisa cobrar é o acordo da ÚLTIMA reunião, que não é a de
  // hoje — senão ela cobraria o que acabou de escrever.
  const ultima = todas.find((r) => r.data.getTime() < dia.getTime()) ?? null;

  return {
    reuniaoDeHoje: reuniaoDeHoje ? converter(reuniaoDeHoje) : null,
    ultimaReuniao: ultima ? converter(ultima) : null,
    historico: todas.filter((r) => r.id !== reuniaoDeHoje?.id).map(converter),
  };
}

/** Guarda o mês corrente inteiro para a página, quando precisar. */
export function limitesDoMes(dia: Date) {
  return { inicio: mesDe(dia), fim: fimDoMes(dia) };
}
