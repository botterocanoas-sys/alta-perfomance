import { Indicador, ModoRateio, TipoFaixa } from "@prisma/client";

/**
 * O motor de pontos. Funções puras: não conhecem banco, para que cada regra
 * possa ser testada isolada.
 *
 * As regras estão em `docs/02-regras-confirmadas.md`. Em resumo:
 *
 *  - a apuração é MENSAL, com teto de 40 pontos;
 *  - durante o mês, o acumulado é comparado à meta proporcional aos dias já
 *    corridos — conta idêntica à "tendência" do brief;
 *  - razões (P.A., Conversão, CRM) NÃO levam proporcional: não crescem com o
 *    número de dias, e comparam direto com a meta fixa;
 *  - 110% cravado paga a base; só acima disso paga o alto.
 */

// ─────────────────────────────────────────────────────────────
// O mapa dos denominadores
// ─────────────────────────────────────────────────────────────

/**
 * Em que situação um indicador está para uma pessoa, num dia.
 *
 * A diferença entre SEM_MEDICAO e um atingimento de 0% é a que mais engana:
 *
 *  - **0%** é medição de verdade. A vendedora teve denominador e o numerador
 *    deu zero. Pontua 0, e a tela mostra 0%.
 *  - **SEM_MEDICAO** é ausência de denominador. Não houve boleto no período,
 *    então o P.A. não existe — não é zero. A tela mostra "—", nunca uma barra
 *    zerada num indicador que a pessoa não chegou a ter.
 *
 * No fechamento do mês, as duas rendem 0 ponto: sem boleto no mês inteiro não
 * há desempenho a premiar. Mas o zero do fechamento é decisão explícita, e não
 * um `null` que virou zero no meio do caminho.
 */
export const SITUACAO = {
  APURADA: "APURADA",
  SEM_MEDICAO: "SEM_MEDICAO",
  FORA_DA_APURACAO: "FORA_DA_APURACAO",
} as const;

export type Situacao = (typeof SITUACAO)[keyof typeof SITUACAO];

/** Os componentes acumulados de uma pessoa (ou da loja) até uma data. */
export type Componentes = {
  valor: number;
  calcados: number;
  bolsas: number;
  /** Soma de todas as categorias. É o numerador do P.A. */
  totalPecas: number;
  boletos: number;
  oportunidades: number;
  /** Quantidade de vendas influenciadas pelo CRM, lançada pela gerente. */
  crmVendas: number;
};

/**
 * Traduz os componentes no realizado de cada indicador.
 *
 * É o único lugar do app que decide quando uma razão existe. O mapa:
 *
 * | Denominador zerado | Consequência |
 * |---|---|
 * | Boletos = 0 | P.A. indefinido · CRM indefinido |
 * | Boletos = 0, com oportunidades | Conversão DEFINIDA em 0% — atendeu e não vendeu |
 * | Oportunidades = 0 | Conversão indefinida |
 *
 * `null` quer dizer indefinido. Nunca 0, nunca infinito.
 */
export function realizadoPorIndicador(
  componentes: Componentes,
): Record<Indicador, number | null> {
  const { boletos, oportunidades } = componentes;

  return {
    [Indicador.VALOR]: componentes.valor,
    [Indicador.PARES]: componentes.calcados,
    [Indicador.BOLSAS]: componentes.bolsas,
    // Peças por atendimento: sem venda no período, não existe média de peças.
    [Indicador.PA]: boletos === 0 ? null : componentes.totalPecas / boletos,
    // Conversão: 0 boletos em 3 oportunidades é 0% de verdade, não ausência.
    [Indicador.CONVERSAO]: oportunidades === 0 ? null : boletos / oportunidades,
    // Proporção das vendas influenciadas pelo CRM: sem venda, não há proporção.
    [Indicador.CRM]: boletos === 0 ? null : componentes.crmVendas / boletos,
  };
}

export const COMPONENTES_ZERADOS: Componentes = {
  valor: 0,
  calcados: 0,
  bolsas: 0,
  totalPecas: 0,
  boletos: 0,
  oportunidades: 0,
  crmVendas: 0,
};

export function somarComponentes(partes: Componentes[]): Componentes {
  return partes.reduce((soma, parte) => {
    const total = { ...soma };
    for (const campo of Object.keys(COMPONENTES_ZERADOS) as (keyof Componentes)[]) {
      total[campo] = soma[campo] + parte[campo];
    }
    return total;
  }, COMPONENTES_ZERADOS);
}

// ─────────────────────────────────────────────────────────────
// Faixas e pontos
// ─────────────────────────────────────────────────────────────

export type Faixa = {
  ordem: number;
  pctMin: number;
  pctMinInclusivo: boolean;
  /** Nulo é "sem teto". */
  pctMax: number | null;
  pctMaxInclusivo: boolean;
  tipo: TipoFaixa;
  /** Preenchido só na faixa MEIO (0,5). Nas outras, os pontos vêm da regra. */
  pontosFixos: number | null;
};

export type Regra = {
  indicador: Indicador;
  pontosBase: number;
  pontosAlto: number;
  rateiaPorVendedora: boolean;
  proporcionalAosDias: boolean;
  ativo: boolean;
};

/**
 * Em qual faixa cai um percentual.
 *
 * Cada ponta diz se ela mesma entra na faixa, então não há epsilon nem
 * dependência da ordem de avaliação. As quatro faixas aprovadas:
 *
 *   ZERO [0, 0.95)  ·  MEIO [0.95, 1.00)  ·  BASE [1.00, 1.10]  ·  ALTO (1.10, ∞)
 */
export function faixaDe(pct: number, faixas: Faixa[]): Faixa | null {
  return (
    faixas.find((faixa) => {
      const acimaDoMinimo = faixa.pctMinInclusivo ? pct >= faixa.pctMin : pct > faixa.pctMin;
      if (!acimaDoMinimo) return false;

      if (faixa.pctMax === null) return true;
      return faixa.pctMaxInclusivo ? pct <= faixa.pctMax : pct < faixa.pctMax;
    }) ?? null
  );
}

/** Quantos pontos aquela faixa vale para aquele indicador. */
export function pontosDaFaixa(faixa: Faixa, regra: Regra): number {
  switch (faixa.tipo) {
    case TipoFaixa.ZERO:
      return faixa.pontosFixos ?? 0;
    case TipoFaixa.MEIO:
      return faixa.pontosFixos ?? 0.5;
    case TipoFaixa.BASE:
      return regra.pontosBase;
    case TipoFaixa.ALTO:
      return regra.pontosAlto;
  }
}

/**
 * A meta ajustada ao ponto do mês em que estamos.
 *
 * Quantidades (Valor, Pares, Bolsas) crescem com os dias, então a meta é
 * reduzida na proporção dos dias corridos. Razões não: comparar o P.A.
 * acumulado com "1,6 × 3 ÷ 30" não faria sentido nenhum.
 */
export function metaAjustada(
  meta: number,
  regra: Regra,
  dias: { decorridos: number; noMes: number },
): number {
  if (!regra.proporcionalAosDias) return meta;
  if (dias.noMes <= 0) return meta;
  return (meta * dias.decorridos) / dias.noMes;
}

export type ApuracaoDeIndicador = {
  indicador: Indicador;
  situacao: Situacao;
  realizado: number | null;
  meta: number | null;
  metaProporcional: number | null;
  /** Fração: 1.03 é 103%. Nulo quando não houve medição ou não há meta. */
  pct: number | null;
  faixa: TipoFaixa | null;
  pontos: number;
};

/**
 * Apura um indicador para uma pessoa (ou para a loja) numa data.
 *
 * Três saídas possíveis, e nenhuma delas confunde ausência com zero:
 *
 *  - FORA_DA_APURACAO — indicador desligado, ou meta ausente/zerada. A pessoa
 *    não está no programa naquele indicador; 0 ponto, e a tela não mostra %.
 *  - SEM_MEDICAO — não houve denominador. 0 ponto, e a tela mostra "—".
 *  - APURADA — há meta e há medição. O percentual e a faixa valem.
 */
export function apurarIndicador(entrada: {
  regra: Regra;
  faixas: Faixa[];
  realizado: number | null;
  meta: number | null;
  dias: { decorridos: number; noMes: number };
}): ApuracaoDeIndicador {
  const { regra, faixas, realizado, meta, dias } = entrada;

  const vazio = {
    indicador: regra.indicador,
    realizado,
    meta,
    metaProporcional: null,
    pct: null,
    faixa: null,
    pontos: 0,
  };

  if (!regra.ativo) return { ...vazio, situacao: SITUACAO.FORA_DA_APURACAO };

  // Meta zero é o critério de "fora do programa neste mês". Também é o que
  // impede qualquer divisão por meta zero mais adiante.
  if (meta === null || meta <= 0) return { ...vazio, situacao: SITUACAO.FORA_DA_APURACAO };

  const metaProporcional = metaAjustada(meta, regra, dias);
  if (metaProporcional <= 0) return { ...vazio, situacao: SITUACAO.FORA_DA_APURACAO };

  // Sem denominador não há desempenho a medir. Zero pontos, mas a tela precisa
  // saber que isto não é 0%.
  if (realizado === null) {
    return { ...vazio, metaProporcional, situacao: SITUACAO.SEM_MEDICAO };
  }

  const pct = realizado / metaProporcional;
  const faixa = faixaDe(pct, faixas);

  return {
    indicador: regra.indicador,
    situacao: SITUACAO.APURADA,
    realizado,
    meta,
    metaProporcional,
    pct,
    faixa: faixa?.tipo ?? null,
    pontos: faixa ? pontosDaFaixa(faixa, regra) : 0,
  };
}

// ─────────────────────────────────────────────────────────────
// As metas de cada vendedora
// ─────────────────────────────────────────────────────────────

export type MetasDaLoja = {
  valor: number;
  pares: number;
  bolsas: number;
  pa: number;
  conversao: number;
  crm: number;
  modoRateio: ModoRateio;
};

/**
 * As metas individuais de uma vendedora.
 *
 * - **Valor** nunca é calculado: vem da coluna "Meta" do relatório. Conferido
 *   no arquivo real, onde a Padre divide 20/80 e não em partes iguais.
 * - **Pares e Bolsas** são rateados pelo peso da meta de Valor dela dentro da
 *   loja. Onde a divisão de Valor já é igual, a fórmula devolve a divisão igual
 *   sozinha — um caso só, sem exceção no código.
 * - **P.A., Conversão e CRM** são fixas e idênticas às da loja.
 *
 * O denominador do rateio é a soma das metas de quem está ATIVA no mês (meta
 * maior que zero), para que as partes somem exatamente 1.
 */
export function metasDaVendedora(entrada: {
  metaValorDaVendedora: number;
  somaDasMetasAtivas: number;
  quantidadeDeAtivas: number;
  loja: MetasDaLoja;
}): Record<Indicador, number | null> {
  const { metaValorDaVendedora, somaDasMetasAtivas, quantidadeDeAtivas, loja } = entrada;

  // Meta zero é a marca de quem está fora do programa neste mês.
  if (metaValorDaVendedora <= 0) {
    return {
      [Indicador.VALOR]: null,
      [Indicador.PARES]: null,
      [Indicador.BOLSAS]: null,
      [Indicador.PA]: null,
      [Indicador.CONVERSAO]: null,
      [Indicador.CRM]: null,
    };
  }

  const fatia =
    loja.modoRateio === ModoRateio.IGUAL
      ? quantidadeDeAtivas > 0
        ? 1 / quantidadeDeAtivas
        : 0
      : somaDasMetasAtivas > 0
        ? metaValorDaVendedora / somaDasMetasAtivas
        : 0;

  return {
    [Indicador.VALOR]: metaValorDaVendedora,
    [Indicador.PARES]: loja.pares * fatia,
    [Indicador.BOLSAS]: loja.bolsas * fatia,
    [Indicador.PA]: loja.pa,
    [Indicador.CONVERSAO]: loja.conversao,
    [Indicador.CRM]: loja.crm,
  };
}

/** As metas da loja, que são as da gerente. */
export function metasDaGerente(loja: MetasDaLoja): Record<Indicador, number | null> {
  return {
    [Indicador.VALOR]: loja.valor,
    [Indicador.PARES]: loja.pares,
    [Indicador.BOLSAS]: loja.bolsas,
    [Indicador.PA]: loja.pa,
    [Indicador.CONVERSAO]: loja.conversao,
    [Indicador.CRM]: loja.crm,
  };
}

// ─────────────────────────────────────────────────────────────
// O total do mês
// ─────────────────────────────────────────────────────────────

export type TotalApurado = {
  porIndicador: ApuracaoDeIndicador[];
  pontos: number;
  bonusReais: number;
};

/**
 * Apura os seis indicadores de uma vez e fecha o total.
 *
 * `recebeBonus` falso zera o dinheiro sem apagar a apuração: é o caso da
 * gerente que também vende, remunerada pelo resultado da loja. Os números dela
 * continuam na tela, porque servem para a conversa.
 */
export function apurarTudo(entrada: {
  regras: Regra[];
  faixas: Faixa[];
  realizados: Record<Indicador, number | null>;
  metas: Record<Indicador, number | null>;
  dias: { decorridos: number; noMes: number };
  valorDoPonto: number;
  recebeBonus?: boolean;
}): TotalApurado {
  const porIndicador = entrada.regras.map((regra) =>
    apurarIndicador({
      regra,
      faixas: entrada.faixas,
      realizado: entrada.realizados[regra.indicador],
      meta: entrada.metas[regra.indicador],
      dias: entrada.dias,
    }),
  );

  const pontos = porIndicador.reduce((soma, item) => soma + item.pontos, 0);
  const recebeBonus = entrada.recebeBonus ?? true;

  return {
    porIndicador,
    pontos,
    bonusReais: recebeBonus ? pontos * entrada.valorDoPonto : 0,
  };
}

/**
 * A soma dos pontos "alto" dos indicadores ativos. A regra do programa é que a
 * distribuição entre indicadores pode mudar todo mês, mas o total tem de
 * continuar fechando no valor combinado (40).
 */
export function totalDePontosAlto(regras: Regra[]): number {
  return regras.filter((regra) => regra.ativo).reduce((soma, regra) => soma + regra.pontosAlto, 0);
}

// ─────────────────────────────────────────────────────────────
// O ritmo do mês e os selos do ranking
// ─────────────────────────────────────────────────────────────

export const SELO = { NO_RITMO: "NO_RITMO", ATENCAO: "ATENCAO", CRITICO: "CRITICO" } as const;
export type Selo = (typeof SELO)[keyof typeof SELO];

/**
 * Um número só para dizer como a pessoa está no mês.
 *
 * O brief pede um selo por tendência, mas cada pessoa tem seis tendências —
 * uma por indicador. Juntamos numa média **ponderada pelos pontos que cada
 * indicador vale**: Valor pesa 15 e Conversão pesa 3, então ir mal no
 * faturamento derruba o ritmo mais do que ir mal na conversão. É a própria
 * régua do programa decidindo o peso, em vez de uma média simples que trataria
 * os seis como iguais.
 *
 * Indicadores sem medição ou fora da apuração não entram na conta: eles não
 * têm percentual, e contá-los como zero puniria a pessoa por ausência de dado.
 * Se nenhum indicador tiver percentual, o ritmo é nulo — sem selo.
 */
export function ritmoDoMes(
  itens: { pct: number | null; situacao: Situacao; pontosAlto: number }[],
): number | null {
  const medidos = itens.filter(
    (item) => item.situacao === SITUACAO.APURADA && item.pct !== null && item.pontosAlto > 0,
  );
  if (medidos.length === 0) return null;

  const peso = medidos.reduce((soma, item) => soma + item.pontosAlto, 0);
  if (peso <= 0) return null;

  return medidos.reduce((soma, item) => soma + item.pct! * item.pontosAlto, 0) / peso;
}

/**
 * O selo do ranking, nos cortes do brief (seção 8.2):
 * "no ritmo" a partir de 100%, "atenção" de 80% a 99%, "crítico" abaixo de 80%.
 */
export function seloDoRitmo(ritmo: number | null): Selo | null {
  if (ritmo === null) return null;
  if (ritmo >= 1) return SELO.NO_RITMO;
  if (ritmo >= 0.8) return SELO.ATENCAO;
  return SELO.CRITICO;
}
