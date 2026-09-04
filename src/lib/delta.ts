/**
 * O cálculo do resultado de um dia.
 *
 * O relatório traz ACUMULADOS DO MÊS até a hora da extração, nunca o resultado
 * daquele dia. O resultado do dia sai por diferença — e é aqui que mora a
 * armadilha central do brief (seção 5).
 *
 * Funções puras: não conhecem banco nem Prisma, para que os três casos possam
 * ser testados um a um.
 */

/** As grandezas que se somam ao longo do mês e podem ser subtraídas. */
export type Acumulado = {
  valor: number;
  calcados: number;
  bolsas: number;
  cintos: number;
  carteiras: number;
  meias: number;
  kitCuidado: number;
  /** Soma de todas as categorias. É o numerador do P.A. */
  total: number;
  boletos: number;
  oportunidades: number;
};

export type ResultadoDoDia = Acumulado & {
  /**
   * Razões recalculadas a partir dos componentes do dia.
   * `null` quando o denominador é zero — sem resultado, nunca 0 nem infinito.
   */
  pa: number | null;
  conversao: number | null;
};

export const ACUMULADO_ZERADO: Acumulado = {
  valor: 0,
  calcados: 0,
  bolsas: 0,
  cintos: 0,
  carteiras: 0,
  meias: 0,
  kitCuidado: 0,
  total: 0,
  boletos: 0,
  oportunidades: 0,
};

const CAMPOS = Object.keys(ACUMULADO_ZERADO) as (keyof Acumulado)[];

/**
 * Diferença entre dois acumulados.
 *
 * `base` nulo significa primeira importação do mês: o resultado do dia é o
 * próprio acumulado.
 *
 * O resultado pode ser NEGATIVO, e isso é legítimo: uma devolução ou um
 * cancelamento derruba o acumulado de um dia para o outro. Não forçamos para
 * zero e não tratamos como erro — a apuração é mensal e sempre recalculada
 * sobre o acumulado, então um dia negativo não corrompe a pontuação; ele só
 * aparece na leitura daquele dia, e a tela diz o que é.
 */
export function subtrairAcumulados(atual: Acumulado, base: Acumulado | null): Acumulado {
  if (!base) return { ...atual };

  const diferenca = { ...ACUMULADO_ZERADO };
  for (const campo of CAMPOS) diferenca[campo] = atual[campo] - base[campo];
  return diferenca;
}

/**
 * P.A. e Conversão do dia, a partir dos componentes já deltados.
 *
 * Nunca subtraia essas duas diretamente: são razões, e a diferença entre duas
 * médias não é a média do período.
 *
 *   P.A.      = peças do dia ÷ boletos do dia
 *   Conversão = boletos do dia ÷ oportunidades do dia
 *
 * "Peças" é a coluna `Total` do relatório — a soma de todas as categorias, não
 * só calçados. Conferido no arquivo real: Tereza tem Total 8 e Boletos 7, e o
 * relatório traz P.A. 1,1429 = 8 ÷ 7.
 */
export function razoesDoDia(doDia: Acumulado): { pa: number | null; conversao: number | null } {
  return {
    pa: doDia.boletos === 0 ? null : doDia.total / doDia.boletos,
    conversao: doDia.oportunidades === 0 ? null : doDia.boletos / doDia.oportunidades,
  };
}

/** O resultado completo de um dia: as quantidades por diferença e as razões recalculadas. */
export function calcularResultadoDoDia(
  atual: Acumulado,
  base: Acumulado | null,
): ResultadoDoDia {
  const doDia = subtrairAcumulados(atual, base);
  return { ...doDia, ...razoesDoDia(doDia) };
}

/** Houve devolução ou cancelamento neste dia? Serve para a tela avisar. */
export function temQuedaNoDia(resultado: ResultadoDoDia): boolean {
  return CAMPOS.some((campo) => resultado[campo] < 0);
}

// ─────────────────────────────────────────────────────────────
// A cadeia do mês
// ─────────────────────────────────────────────────────────────

export type ImportacaoOficial<T> = {
  /** Dia civil a que a importação pertence. */
  data: Date;
  acumulado: Acumulado;
  referencia: T;
};

export type DiaCalculado<T> = {
  data: Date;
  resultado: ResultadoDoDia;
  origem: T;
  /** Nulo na primeira importação do mês. */
  base: T | null;
};

/**
 * Percorre as importações oficiais de UM mês, em ordem, e devolve o resultado
 * de cada dia.
 *
 * Duas regras que esta função existe para garantir:
 *
 * 1. **A cadeia nunca atravessa a virada do mês.** O acumulado do relatório
 *    zera quando o mês muda; comparar a primeira importação de outubro com a
 *    última de setembro daria um delta negativo gigante. Por isso a função
 *    recebe as importações de um mês só, e a primeira delas sempre tem base
 *    nula. Quem separa por mês é `recalcularMes`.
 *
 * 2. **A base é a importação oficial anterior, não "ontem".** Se um dia não
 *    teve importação — loja fechada, ou o admin esqueceu —, o delta do próximo
 *    dia cobre o período inteiro desde a última importação. É a leitura certa:
 *    o que foi vendido no intervalo aparece todo junto, em vez de sumir.
 *
 * Havendo mais de uma importação no mesmo dia, a lista já deve conter só a
 * oficial (a mais recente) — a comparação é sempre com o dia anterior, nunca
 * com a importação anterior do mesmo dia.
 */
export function calcularMes<T>(oficiais: ImportacaoOficial<T>[]): DiaCalculado<T>[] {
  const emOrdem = [...oficiais].sort((a, b) => a.data.getTime() - b.data.getTime());

  return emOrdem.map((oficial, indice) => {
    const anterior = indice === 0 ? null : emOrdem[indice - 1];

    return {
      data: oficial.data,
      resultado: calcularResultadoDoDia(oficial.acumulado, anterior?.acumulado ?? null),
      origem: oficial.referencia,
      base: anterior?.referencia ?? null,
    };
  });
}
