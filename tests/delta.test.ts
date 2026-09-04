import { describe, expect, it } from "vitest";

import {
  ACUMULADO_ZERADO,
  calcularMes,
  calcularResultadoDoDia,
  razoesDoDia,
  subtrairAcumulados,
  temQuedaNoDia,
  type Acumulado,
} from "@/lib/delta";
import { diaUtc } from "@/lib/data";

/**
 * O cálculo do delta — a armadilha central do brief (seção 5) e o item 1 dos
 * testes obrigatórios da seção 11.
 */

function acumulado(parcial: Partial<Acumulado>): Acumulado {
  return { ...ACUMULADO_ZERADO, ...parcial };
}

describe("os três casos da seção 5", () => {
  it("primeira importação do mês: o resultado do dia é o próprio acumulado", () => {
    const dia1 = acumulado({ valor: 1200, calcados: 4, boletos: 3, oportunidades: 7, total: 5 });

    const resultado = calcularResultadoDoDia(dia1, null);

    expect(resultado.valor).toBe(1200);
    expect(resultado.calcados).toBe(4);
    expect(resultado.boletos).toBe(3);
  });

  it("importação normal: o dia é a diferença para a oficial do dia anterior", () => {
    const ontem = acumulado({ valor: 1200, calcados: 4, boletos: 3, oportunidades: 7, total: 5 });
    const hoje = acumulado({ valor: 2000, calcados: 7, boletos: 5, oportunidades: 12, total: 8 });

    const resultado = calcularResultadoDoDia(hoje, ontem);

    expect(resultado.valor).toBe(800);
    expect(resultado.calcados).toBe(3);
    expect(resultado.boletos).toBe(2);
    expect(resultado.oportunidades).toBe(5);
    expect(resultado.total).toBe(3);
  });

  it("duas importações no mesmo dia: a base continua sendo a do dia anterior", () => {
    const dia1 = { data: diaUtc(2026, 9, 1), acumulado: acumulado({ valor: 1000, boletos: 2 }), referencia: "d1" };
    // A segunda importação do dia 2 substitui a primeira — só a oficial entra
    // na lista. A base dela é o dia 1, nunca a importação anterior do dia 2.
    const dia2 = { data: diaUtc(2026, 9, 2), acumulado: acumulado({ valor: 1800, boletos: 5 }), referencia: "d2-tarde" };

    const dias = calcularMes([dia1, dia2]);

    expect(dias).toHaveLength(2);
    expect(dias[1].base).toBe("d1");
    expect(dias[1].resultado.valor).toBe(800);
    expect(dias[1].resultado.boletos).toBe(3);
  });
});

describe("P.A. e Conversão são recalculadas, nunca subtraídas", () => {
  it("P.A. do dia é o Total do dia dividido pelos Boletos do dia", () => {
    // Conferido no relatório real: quem tem Total 8 e Boletos 7 aparece com
    // P.A. 1,1429. É a coluna Total, a soma de TODAS as categorias, e não só
    // Calçados.
    const resultado = calcularResultadoDoDia(
      acumulado({ total: 8, boletos: 7, calcados: 7, carteiras: 1 }),
      null,
    );

    expect(resultado.pa).toBeCloseTo(1.1429, 4);
    // Se usasse Calçados daria 1,0 — o erro que este teste existe para pegar.
    expect(resultado.pa).not.toBeCloseTo(1.0, 4);
  });

  it("Conversão do dia é Boletos do dia sobre Oportunidades do dia", () => {
    const resultado = calcularResultadoDoDia(acumulado({ boletos: 4, oportunidades: 9 }), null);
    expect(resultado.conversao).toBeCloseTo(0.4444, 4);
  });

  it("subtrair as razões do relatório daria resultado errado", () => {
    // Acumulado de ontem: 2 boletos em 4 oportunidades → 50%.
    // Acumulado de hoje:  3 boletos em 10 oportunidades → 30%.
    // O DIA teve 1 boleto em 6 oportunidades → 16,67%, e não 30 − 50 = −20%.
    const ontem = acumulado({ boletos: 2, oportunidades: 4 });
    const hoje = acumulado({ boletos: 3, oportunidades: 10 });

    const resultado = calcularResultadoDoDia(hoje, ontem);

    expect(resultado.conversao).toBeCloseTo(1 / 6, 4);
    expect(resultado.conversao).toBeGreaterThan(0);
  });
});

describe("denominador zero vira null, nunca 0 nem infinito", () => {
  it("um dia com atendimentos e nenhuma venda deixa o P.A. em branco", () => {
    // O caso que acontece de verdade: uma vendedora ATIVA que atendeu e não
    // vendeu naquele dia. No arquivo cheio isso quase não aparece, porque os
    // números são acumulados do mês; no delta de um dia, aparece toda hora.
    const ontem = acumulado({ boletos: 5, oportunidades: 11, total: 7, valor: 2000 });
    const hoje = acumulado({ boletos: 5, oportunidades: 13, total: 7, valor: 2000 });

    const resultado = calcularResultadoDoDia(hoje, ontem);

    expect(resultado.boletos).toBe(0);
    expect(resultado.oportunidades).toBe(2);
    expect(resultado.pa).toBeNull();
    expect(resultado.conversao).toBe(0); // 0 de 2 oportunidades é zero de verdade
  });

  it("um dia sem nenhum atendimento deixa as duas razões em branco", () => {
    const parado = acumulado({ boletos: 4, oportunidades: 9, total: 4 });

    const resultado = calcularResultadoDoDia(parado, parado);

    expect(resultado.pa).toBeNull();
    expect(resultado.conversao).toBeNull();
  });

  it("nunca devolve zero nem infinito no lugar de null", () => {
    const razoes = razoesDoDia(ACUMULADO_ZERADO);
    expect(razoes.pa).toBeNull();
    expect(razoes.conversao).toBeNull();
    expect(Number.isFinite(razoes.pa as unknown as number)).toBe(false);
  });
});

describe("delta negativo é legítimo", () => {
  it("uma devolução derruba o acumulado e o dia fica negativo", () => {
    const ontem = acumulado({ valor: 3000, calcados: 9, boletos: 6, oportunidades: 14, total: 10 });
    const hoje = acumulado({ valor: 2711, calcados: 8, boletos: 6, oportunidades: 15, total: 9 });

    const resultado = calcularResultadoDoDia(hoje, ontem);

    expect(resultado.valor).toBe(-289);
    expect(resultado.calcados).toBe(-1);
    expect(temQuedaNoDia(resultado)).toBe(true);
  });

  it("não força para zero e não some com a queda", () => {
    const resultado = subtrairAcumulados(acumulado({ valor: 100 }), acumulado({ valor: 500 }));
    expect(resultado.valor).toBe(-400);
    expect(resultado.valor).not.toBe(0);
  });

  it("um dia negativo não contamina o acumulado do mês", () => {
    // A apuração é mensal e sempre feita sobre o acumulado. O dia negativo
    // aparece na leitura daquele dia; o acumulado do fim continua sendo o que
    // o relatório diz.
    const dias = calcularMes([
      { data: diaUtc(2026, 9, 1), acumulado: acumulado({ valor: 1000 }), referencia: "d1" },
      { data: diaUtc(2026, 9, 2), acumulado: acumulado({ valor: 3000 }), referencia: "d2" },
      { data: diaUtc(2026, 9, 3), acumulado: acumulado({ valor: 2711 }), referencia: "d3" },
    ]);

    expect(dias.map((dia) => dia.resultado.valor)).toEqual([1000, 2000, -289]);
    // A soma dos dias é o acumulado final, inclusive com a devolução no meio.
    expect(dias.reduce((soma, dia) => soma + dia.resultado.valor, 0)).toBe(2711);
  });
});

describe("a virada do mês", () => {
  it("a primeira importação de um mês novo não é comparada com o mês anterior", () => {
    // O acumulado do relatório zera quando o mês muda. Se a cadeia atravessasse
    // a fronteira, o dia 1 de outubro viria com um delta negativo do tamanho de
    // setembro inteiro.
    const setembro = calcularMes([
      { data: diaUtc(2026, 9, 29), acumulado: acumulado({ valor: 90000, boletos: 210 }), referencia: "s29" },
      { data: diaUtc(2026, 9, 30), acumulado: acumulado({ valor: 98000, boletos: 230 }), referencia: "s30" },
    ]);

    const outubro = calcularMes([
      { data: diaUtc(2026, 10, 1), acumulado: acumulado({ valor: 2400, boletos: 6 }), referencia: "o1" },
      { data: diaUtc(2026, 10, 2), acumulado: acumulado({ valor: 5100, boletos: 13 }), referencia: "o2" },
    ]);

    expect(setembro[1].resultado.valor).toBe(8000);

    // O primeiro dia de outubro tem base nula e resultado igual ao acumulado.
    expect(outubro[0].base).toBeNull();
    expect(outubro[0].resultado.valor).toBe(2400);
    expect(outubro[0].resultado.valor).toBeGreaterThan(0);
    expect(outubro[1].resultado.valor).toBe(2700);
  });

  it("o que aconteceria se a cadeia atravessasse o mês, para deixar claro o estrago", () => {
    const ultimoDeSetembro = acumulado({ valor: 98000 });
    const primeiroDeOutubro = acumulado({ valor: 2400 });

    const errado = subtrairAcumulados(primeiroDeOutubro, ultimoDeSetembro);
    expect(errado.valor).toBe(-95600); // é isto que `calcularMes` por mês evita
  });
});

describe("dias sem importação", () => {
  it("o delta do próximo dia cobre o período inteiro desde a última importação", () => {
    // Domingo sem importação: o resultado da segunda-feira traz os dois dias
    // juntos, em vez de o movimento sumir.
    const dias = calcularMes([
      { data: diaUtc(2026, 9, 4), acumulado: acumulado({ valor: 4000 }), referencia: "sexta" },
      { data: diaUtc(2026, 9, 7), acumulado: acumulado({ valor: 9500 }), referencia: "segunda" },
    ]);

    expect(dias[1].base).toBe("sexta");
    expect(dias[1].resultado.valor).toBe(5500);
  });

  it("a ordem das importações não depende de como elas chegaram", () => {
    const foraDeOrdem = calcularMes([
      { data: diaUtc(2026, 9, 3), acumulado: acumulado({ valor: 3000 }), referencia: "d3" },
      { data: diaUtc(2026, 9, 1), acumulado: acumulado({ valor: 1000 }), referencia: "d1" },
      { data: diaUtc(2026, 9, 2), acumulado: acumulado({ valor: 1800 }), referencia: "d2" },
    ]);

    expect(foraDeOrdem.map((dia) => dia.origem)).toEqual(["d1", "d2", "d3"]);
    expect(foraDeOrdem.map((dia) => dia.resultado.valor)).toEqual([1000, 800, 1200]);
  });
});
