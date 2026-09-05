import { Indicador, SituacaoApuracao, TipoFaixa } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { LinhaDoRanking } from "@/lib/apuracao";
import { gerarInsights, TOM, type EntradaDosInsights } from "@/lib/insights";
import type { Degrau } from "@/lib/pontuacao";

/**
 * Insights — seção 9 do brief.
 *
 * A regra que estes testes protegem: toda frase nasce de uma distância
 * numérica. Nada de elogio nem crítica genérica, e hipótese sempre como
 * hipótese a checar.
 */

type Item = LinhaDoRanking["porIndicador"][number];

function indicador(
  indicador: Indicador,
  pct: number | null,
  extras: Partial<Item> = {},
): Item {
  return {
    indicador,
    situacao: pct === null ? SituacaoApuracao.SEM_MEDICAO : SituacaoApuracao.APURADA,
    meta: 1000,
    acumulado: pct === null ? null : pct * 100,
    metaProporcional: 100,
    pct,
    faixa: null,
    pontos: 0,
    ...extras,
  };
}

function entrada(parcial: Partial<EntradaDosInsights> = {}): EntradaDosInsights {
  return {
    porIndicador: [],
    mediaDaLoja: new Map(),
    diasDecorridos: 10,
    diasDoMes: 30,
    degrauNoCard: null,
    degraus: [],
    valorDoPonto: 15,
    ...parcial,
  };
}

describe("as três faixas de ritmo da seção 9", () => {
  it("abaixo de 80% vira prioridade, com a distância até o ritmo", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [
          indicador(Indicador.PARES, 0.62, { acumulado: 62, metaProporcional: 100 }),
        ],
      }),
    );

    const prioridade = insights.find((i) => i.tom === TOM.PRIORIDADE);
    expect(prioridade).toBeDefined();
    expect(prioridade!.texto).toContain("62%");
    // A distância aparece na unidade do indicador, não em abstrato.
    expect(prioridade!.texto).toContain("38 pares");
  });

  it("de 80% a 100% diz quanto falta POR DIA nos dias que sobram", () => {
    const insights = gerarInsights(
      entrada({
        diasDecorridos: 10,
        diasDoMes: 30,
        porIndicador: [
          // Meta de 1.000 no mês, 400 feitos: faltam 600 em 20 dias = 30 por dia.
          indicador(Indicador.VALOR, 0.91, { meta: 1000, acumulado: 400, metaProporcional: 440 }),
        ],
      }),
    );

    const recuperavel = insights.find((i) => i.tom === TOM.RECUPERAVEL);
    expect(recuperavel).toBeDefined();
    expect(recuperavel!.texto).toContain("ainda dá para recuperar");
    // O Intl separa "R$" do número com espaço não separável, não com espaço comum.
    expect(recuperavel!.texto).toMatch(/R\$\s30,00/);
    expect(recuperavel!.texto).toContain("20 dias");
  });

  it("acima de 100% reconhece com o número, sem elogio solto", () => {
    const insights = gerarInsights(
      entrada({ porIndicador: [indicador(Indicador.CONVERSAO, 1.18)] }),
    );

    const reconhecimento = insights.find((i) => i.tom === TOM.RECONHECIMENTO);
    expect(reconhecimento).toBeDefined();
    expect(reconhecimento!.texto).toContain("118%");
    // Nada de "parabéns", "ótimo", "excelente".
    expect(reconhecimento!.texto).not.toMatch(/parabéns|ótim|excelente|muito bem/i);
  });

  it("a prioridade vem antes do reconhecimento", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [
          indicador(Indicador.CONVERSAO, 1.3),
          indicador(Indicador.VALOR, 0.4),
        ],
      }),
    );

    expect(insights[0].tom).toBe(TOM.PRIORIDADE);
    expect(insights[0].indicador).toBe(Indicador.VALOR);
  });

  it("o pior de todos aparece primeiro entre as prioridades", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [
          indicador(Indicador.PARES, 0.7),
          indicador(Indicador.VALOR, 0.3),
        ],
      }),
    );

    expect(insights[0].indicador).toBe(Indicador.VALOR);
  });
});

describe("hipótese é hipótese, nunca diagnóstico", () => {
  it("liga o mais forte ao mais fraco e sugere uma leitura a checar", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [
          indicador(Indicador.CONVERSAO, 1.25),
          indicador(Indicador.VALOR, 0.55),
        ],
      }),
    );

    const hipotese = insights.find((i) => i.tom === TOM.HIPOTESE);
    expect(hipotese).toBeDefined();
    expect(hipotese!.texto).toContain("Conversão");
    expect(hipotese!.texto).toContain("Valor");
    // O exemplo do próprio brief: conversão alta com valor baixo.
    expect(hipotese!.texto).toContain("o valor de cada venda é baixo");
  });

  it("a frase se marca como hipótese, e devolve a decisão para a gerente", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [
          indicador(Indicador.CONVERSAO, 1.25),
          indicador(Indicador.VALOR, 0.55),
        ],
      }),
    );

    const hipotese = insights.find((i) => i.tom === TOM.HIPOTESE)!;
    expect(hipotese.texto).toMatch(/Pode ser que/);
    expect(hipotese.texto).toMatch(/vale perguntar a ela, não é conclusão do app/);
    // Nunca afirma.
    expect(hipotese.texto).not.toMatch(/o problema dela é|ela precisa|ela não sabe/i);
  });

  it("sem par conhecido, usa a diferença numérica em vez de inventar leitura", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [
          indicador(Indicador.CRM, 1.4),
          indicador(Indicador.BOLSAS, 0.3),
        ],
      }),
    );

    const hipotese = insights.find((i) => i.tom === TOM.HIPOTESE);
    expect(hipotese).toBeDefined();
    expect(hipotese!.texto).toContain("de diferença entre o melhor e o pior");
    expect(hipotese!.texto).toContain("Vale perguntar");
  });

  it("com forte e fraco quase iguais, não levanta hipótese nenhuma", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [
          indicador(Indicador.CONVERSAO, 1.02),
          indicador(Indicador.VALOR, 0.95),
        ],
      }),
    );

    expect(insights.some((i) => i.tom === TOM.HIPOTESE)).toBe(false);
  });

  it("com um indicador só, não há forte contra fraco", () => {
    const insights = gerarInsights(entrada({ porIndicador: [indicador(Indicador.VALOR, 0.5)] }));
    expect(insights.some((i) => i.tom === TOM.HIPOTESE)).toBe(false);
  });
});

describe("comparação com a loja", () => {
  it("aponta a maior distância, com os dois números", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [indicador(Indicador.PA, 0.7), indicador(Indicador.VALOR, 1.02)],
        mediaDaLoja: new Map([
          [Indicador.PA, 1.05],
          [Indicador.VALOR, 1.0],
        ]),
      }),
    );

    const comparacao = insights.find((i) => i.tom === TOM.COMPARACAO);
    expect(comparacao).toBeDefined();
    expect(comparacao!.indicador).toBe(Indicador.PA);
    expect(comparacao!.texto).toContain("70%");
    expect(comparacao!.texto).toContain("105%");
    expect(comparacao!.texto).toContain("abaixo da loja");
  });

  it("também reconhece quando ela está acima da loja", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [indicador(Indicador.CONVERSAO, 1.4)],
        mediaDaLoja: new Map([[Indicador.CONVERSAO, 1.0]]),
      }),
    );

    const comparacao = insights.find((i) => i.tom === TOM.COMPARACAO)!;
    expect(comparacao.texto).toContain("acima da loja");
    expect(comparacao.texto).toContain("puxa o time para cima");
  });

  it("diferença pequena não vira frase: é ruído, não informação", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [indicador(Indicador.VALOR, 1.02)],
        mediaDaLoja: new Map([[Indicador.VALOR, 1.0]]),
      }),
    );

    expect(insights.some((i) => i.tom === TOM.COMPARACAO)).toBe(false);
  });

  it("sem média da loja, não compara", () => {
    const insights = gerarInsights(entrada({ porIndicador: [indicador(Indicador.VALOR, 0.5)] }));
    expect(insights.some((i) => i.tom === TOM.COMPARACAO)).toBe(false);
  });
});

describe("perto de virar de faixa", () => {
  const degrau = (indicador: Indicador, faltaEmPct: number, ganhoEmPontos: number): Degrau => ({
    indicador,
    faixaAtual: TipoFaixa.MEIO,
    faixaAlvo: TipoFaixa.BASE,
    pctAlvo: 1,
    faltaEmPct,
    faltaNaMeta: faltaEmPct * 100,
    metaProporcional: 100,
    alvoNaMeta: 100,
    ganhoEmPontos,
    retorno: ganhoEmPontos / faltaEmPct,
  });

  it("diz quanto falta e quanto vale em pontos e em reais", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [indicador(Indicador.BOLSAS, 0.98)],
        degraus: [degrau(Indicador.BOLSAS, 0.02, 4)],
        valorDoPonto: 15,
      }),
    );

    const frase = insights.find((i) => i.tom === TOM.DEGRAU);
    expect(frase).toBeDefined();
    expect(frase!.texto).toContain("2%");
    expect(frase!.texto).toContain("4 pontos");
    expect(frase!.texto).toMatch(/R\$\s60,00/);
  });

  it("não repete o indicador que já está no card de atacar hoje", () => {
    const noCard = degrau(Indicador.BOLSAS, 0.02, 4);
    const insights = gerarInsights(
      entrada({
        porIndicador: [indicador(Indicador.BOLSAS, 0.98)],
        degraus: [noCard],
        degrauNoCard: noCard,
      }),
    );

    expect(insights.some((i) => i.tom === TOM.DEGRAU)).toBe(false);
  });

  it("longe da faixa não vira frase de degrau", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [indicador(Indicador.BOLSAS, 0.6)],
        degraus: [degrau(Indicador.BOLSAS, 0.35, 4)],
      }),
    );

    expect(insights.some((i) => i.tom === TOM.DEGRAU)).toBe(false);
  });

  it("sem bônus, a frase não promete reais", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [indicador(Indicador.BOLSAS, 0.98)],
        degraus: [degrau(Indicador.BOLSAS, 0.02, 4)],
        valorDoPonto: 0, // a gerente que vende
      }),
    );

    const frase = insights.find((i) => i.tom === TOM.DEGRAU)!;
    expect(frase.texto).toContain("4 pontos");
    expect(frase.texto).not.toContain("R$");
  });
});

describe("o conjunto de frases", () => {
  const seisIndicadores = [
    indicador(Indicador.VALOR, 0.55, { meta: 1000, acumulado: 200, metaProporcional: 363 }),
    indicador(Indicador.PARES, 0.72),
    indicador(Indicador.BOLSAS, 1.25),
    indicador(Indicador.PA, 0.88, { meta: 1.6, acumulado: 1.4, metaProporcional: 1.6 }),
    indicador(Indicador.CONVERSAO, 1.35),
    indicador(Indicador.CRM, 0.95),
  ];

  it("devolve no máximo cinco frases", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: seisIndicadores,
        mediaDaLoja: new Map([[Indicador.VALOR, 1.0]]),
      }),
    );

    expect(insights.length).toBeLessThanOrEqual(5);
    expect(insights.length).toBeGreaterThanOrEqual(3);
  });

  it("não repete o mesmo assunto duas vezes", () => {
    const insights = gerarInsights(entrada({ porIndicador: seisIndicadores }));
    const assuntos = insights.map((i) => `${i.tom}:${i.indicador}`);

    expect(new Set(assuntos).size).toBe(assuntos.length);
  });

  it("toda frase carrega um número", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: seisIndicadores,
        mediaDaLoja: new Map([[Indicador.VALOR, 1.0]]),
        degraus: [],
      }),
    );

    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      expect(insight.texto, insight.chave).toMatch(/\d/);
    }
  });

  it("indicador sem medição não gera frase nenhuma", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [
          indicador(Indicador.PA, null),
          indicador(Indicador.CRM, null),
        ],
      }),
    );

    expect(insights).toHaveLength(0);
  });

  it("indicador fora da apuração também não gera frase", () => {
    const insights = gerarInsights(
      entrada({
        porIndicador: [
          {
            ...indicador(Indicador.VALOR, 0.2),
            situacao: SituacaoApuracao.FORA_DA_APURACAO,
            pct: null,
          },
        ],
      }),
    );

    expect(insights).toHaveLength(0);
  });

  it("no começo do mês, poucas frases é melhor que frase inventada", () => {
    // Um indicador medido só: sai uma frase, não três de enchimento.
    const insights = gerarInsights(entrada({ porIndicador: [indicador(Indicador.VALOR, 0.9)] }));

    expect(insights).toHaveLength(1);
    expect(insights[0].texto).toMatch(/\d/);
  });
});
