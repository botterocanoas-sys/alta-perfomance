import { Indicador, ModoRateio, TipoFaixa } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  apurarIndicador,
  apurarTudo,
  faixaDe,
  metaAjustada,
  metasDaGerente,
  metasDaVendedora,
  realizadoPorIndicador,
  ritmoDoMes,
  SELO,
  seloDoRitmo,
  SITUACAO,
  totalDePontosAlto,
  type Faixa,
  type Regra,
  type Situacao,
} from "@/lib/pontuacao";

/**
 * Motor de pontos — itens 3 e 4 dos testes obrigatórios da seção 11.
 */

/** As faixas aprovadas: 110% cravado paga a base. */
const FAIXAS: Faixa[] = [
  { ordem: 1, pctMin: 0, pctMinInclusivo: true, pctMax: 0.95, pctMaxInclusivo: false, tipo: TipoFaixa.ZERO, pontosFixos: 0 },
  { ordem: 2, pctMin: 0.95, pctMinInclusivo: true, pctMax: 1, pctMaxInclusivo: false, tipo: TipoFaixa.MEIO, pontosFixos: 0.5 },
  { ordem: 3, pctMin: 1, pctMinInclusivo: true, pctMax: 1.1, pctMaxInclusivo: true, tipo: TipoFaixa.BASE, pontosFixos: null },
  { ordem: 4, pctMin: 1.1, pctMinInclusivo: false, pctMax: null, pctMaxInclusivo: false, tipo: TipoFaixa.ALTO, pontosFixos: null },
];

const REGRAS: Regra[] = [
  { indicador: Indicador.VALOR, pontosBase: 10, pontosAlto: 15, rateiaPorVendedora: true, proporcionalAosDias: true, ativo: true },
  { indicador: Indicador.PARES, pontosBase: 4, pontosAlto: 7, rateiaPorVendedora: true, proporcionalAosDias: true, ativo: true },
  { indicador: Indicador.BOLSAS, pontosBase: 4, pontosAlto: 7, rateiaPorVendedora: true, proporcionalAosDias: true, ativo: true },
  { indicador: Indicador.PA, pontosBase: 3, pontosAlto: 5, rateiaPorVendedora: false, proporcionalAosDias: false, ativo: true },
  { indicador: Indicador.CONVERSAO, pontosBase: 2, pontosAlto: 3, rateiaPorVendedora: false, proporcionalAosDias: false, ativo: true },
  { indicador: Indicador.CRM, pontosBase: 2, pontosAlto: 3, rateiaPorVendedora: false, proporcionalAosDias: false, ativo: true },
];

const regraDe = (indicador: Indicador) => REGRAS.find((r) => r.indicador === indicador)!;
const MES_INTEIRO = { decorridos: 30, noMes: 30 };

/** Apura o VALOR com meta 100, para que o realizado seja o próprio percentual. */
function pontosCom(pct: number, regra = regraDe(Indicador.VALOR)) {
  return apurarIndicador({
    regra,
    faixas: FAIXAS,
    realizado: pct * 100,
    meta: 100,
    dias: MES_INTEIRO,
  });
}

describe("as fronteiras das faixas", () => {
  it.each([
    [0, TipoFaixa.ZERO, 0],
    [0.5, TipoFaixa.ZERO, 0],
    [0.949, TipoFaixa.ZERO, 0],
    [0.9499999, TipoFaixa.ZERO, 0],
    [0.95, TipoFaixa.MEIO, 0.5],
    [0.99, TipoFaixa.MEIO, 0.5],
    [0.999999, TipoFaixa.MEIO, 0.5],
    [1, TipoFaixa.BASE, 10],
    [1.05, TipoFaixa.BASE, 10],
    [1.0999999, TipoFaixa.BASE, 10],
    [1.1, TipoFaixa.BASE, 10],
    [1.1000001, TipoFaixa.ALTO, 15],
    [1.5, TipoFaixa.ALTO, 15],
    [10, TipoFaixa.ALTO, 15],
  ])("%s → %s, %s pontos", (pct, faixaEsperada, pontosEsperados) => {
    const apurado = pontosCom(pct);
    expect(apurado.faixa).toBe(faixaEsperada);
    expect(apurado.pontos).toBe(pontosEsperados);
  });

  it("os quatro casos que o brief cita por nome", () => {
    expect(pontosCom(0.949).pontos).toBe(0); // 94,9%
    expect(pontosCom(0.95).pontos).toBe(0.5); // 95%
    expect(pontosCom(1).pontos).toBe(10); // 100%
    expect(pontosCom(1.1).pontos).toBe(10); // 110% cravado paga a BASE
  });

  it("110% cravado paga a base, e um fio acima já paga o alto", () => {
    expect(pontosCom(1.1).faixa).toBe(TipoFaixa.BASE);
    expect(pontosCom(1.1 + 1e-9).faixa).toBe(TipoFaixa.ALTO);
  });

  it("nenhum percentual cai em duas faixas nem fica sem faixa", () => {
    for (let pct = 0; pct <= 2; pct += 0.001) {
      const casadas = FAIXAS.filter((faixa) => faixaDe(pct, [faixa]) !== null);
      expect(casadas, `${pct} casou em ${casadas.length} faixas`).toHaveLength(1);
    }
  });

  it("cada indicador paga os próprios pontos na mesma faixa", () => {
    const emAlto = (indicador: Indicador) => pontosCom(1.2, regraDe(indicador)).pontos;

    expect(emAlto(Indicador.VALOR)).toBe(15);
    expect(emAlto(Indicador.PARES)).toBe(7);
    expect(emAlto(Indicador.BOLSAS)).toBe(7);
    expect(emAlto(Indicador.PA)).toBe(5);
    expect(emAlto(Indicador.CONVERSAO)).toBe(3);
    expect(emAlto(Indicador.CRM)).toBe(3);
  });

  it("o teto do mês é 40 pontos", () => {
    expect(totalDePontosAlto(REGRAS)).toBe(40);

    const tudoNoAlto = apurarTudo({
      regras: REGRAS,
      faixas: FAIXAS,
      realizados: {
        VALOR: 200, PARES: 200, BOLSAS: 200, PA: 200, CONVERSAO: 200, CRM: 200,
      },
      metas: { VALOR: 100, PARES: 100, BOLSAS: 100, PA: 100, CONVERSAO: 100, CRM: 100 },
      dias: MES_INTEIRO,
      valorDoPonto: 15,
    });

    expect(tudoNoAlto.pontos).toBe(40);
    expect(tudoNoAlto.bonusReais).toBe(600);
  });
});

describe("a meta proporcional aos dias", () => {
  it("quantidades encolhem com os dias corridos", () => {
    const valor = regraDe(Indicador.VALOR);
    expect(metaAjustada(30000, valor, { decorridos: 1, noMes: 30 })).toBe(1000);
    expect(metaAjustada(30000, valor, { decorridos: 10, noMes: 30 })).toBe(10000);
    expect(metaAjustada(30000, valor, { decorridos: 30, noMes: 30 })).toBe(30000);
  });

  it("razões não encolhem: comparam direto com a meta fixa", () => {
    const pa = regraDe(Indicador.PA);
    expect(metaAjustada(1.6, pa, { decorridos: 3, noMes: 30 })).toBe(1.6);
    expect(metaAjustada(1.6, pa, { decorridos: 30, noMes: 30 })).toBe(1.6);
  });

  it("o percentual do dia 3 é o mesmo da tendência do mês", () => {
    // 3.000 em 3 dias, meta de 30.000 no mês: a média diária de 1.000 vezes 30
    // dias projeta 30.000, ou seja 100% da meta.
    const apurado = apurarIndicador({
      regra: regraDe(Indicador.VALOR),
      faixas: FAIXAS,
      realizado: 3000,
      meta: 30000,
      dias: { decorridos: 3, noMes: 30 },
    });

    expect(apurado.metaProporcional).toBe(3000);
    expect(apurado.pct).toBe(1);

    const projecao = ((3000 / 3) * 30) / 30000;
    expect(apurado.pct).toBeCloseTo(projecao, 10);
  });

  it("no último dia do mês a fórmula vira a apuração final", () => {
    const apurado = apurarIndicador({
      regra: regraDe(Indicador.VALOR),
      faixas: FAIXAS,
      realizado: 31500,
      meta: 30000,
      dias: MES_INTEIRO,
    });

    expect(apurado.metaProporcional).toBe(30000);
    expect(apurado.pct).toBeCloseTo(1.05, 10);
    expect(apurado.faixa).toBe(TipoFaixa.BASE);
  });
});

describe("o mapa dos denominadores", () => {
  it("boletos zerados deixam P.A. e CRM indefinidos, e a Conversão em 0%", () => {
    // Atendeu 3 pessoas e não vendeu nenhuma.
    const realizados = realizadoPorIndicador({
      valor: 0,
      calcados: 0,
      bolsas: 0,
      totalPecas: 0,
      boletos: 0,
      oportunidades: 3,
      crmVendas: 0,
    });

    expect(realizados.PA).toBeNull();
    expect(realizados.CRM).toBeNull();
    // Conversão é 0 ÷ 3: valor definido, e ruim. Não é ausência de medição.
    expect(realizados.CONVERSAO).toBe(0);
  });

  it("oportunidades zeradas deixam a Conversão indefinida", () => {
    const realizados = realizadoPorIndicador({
      ...{ valor: 0, calcados: 0, bolsas: 0, totalPecas: 0, crmVendas: 0 },
      boletos: 0,
      oportunidades: 0,
    });

    expect(realizados.CONVERSAO).toBeNull();
    expect(realizados.PA).toBeNull();
  });

  it("com boletos, as três razões existem", () => {
    const realizados = realizadoPorIndicador({
      valor: 2014.24,
      calcados: 7,
      bolsas: 0,
      totalPecas: 8,
      boletos: 7,
      oportunidades: 10,
      crmVendas: 2,
    });

    expect(realizados.PA).toBeCloseTo(8 / 7, 6);
    expect(realizados.CONVERSAO).toBeCloseTo(0.7, 6);
    expect(realizados.CRM).toBeCloseTo(2 / 7, 6);
  });

  it("a Conversão é boletos ÷ oportunidades, nunca o inverso", () => {
    const realizados = realizadoPorIndicador({
      ...{ valor: 0, calcados: 0, bolsas: 0, totalPecas: 4, crmVendas: 0 },
      boletos: 4,
      oportunidades: 9,
    });

    expect(realizados.CONVERSAO).toBeCloseTo(0.4444, 4); // 4/9
    expect(realizados.CONVERSAO).not.toBeCloseTo(2.25, 2); // 9/4 seria isto
  });
});

describe("ausência de medição não é zero por cento", () => {
  it("SEM_MEDICAO não tem percentual, e a tela não pode mostrar 0%", () => {
    const apurado = apurarIndicador({
      regra: regraDe(Indicador.PA),
      faixas: FAIXAS,
      realizado: null,
      meta: 1.6,
      dias: MES_INTEIRO,
    });

    expect(apurado.situacao).toBe(SITUACAO.SEM_MEDICAO);
    expect(apurado.pct).toBeNull();
    expect(apurado.faixa).toBeNull();
  });

  it("0% real é APURADA, cai na faixa ZERO e mostra percentual", () => {
    const apurado = apurarIndicador({
      regra: regraDe(Indicador.CONVERSAO),
      faixas: FAIXAS,
      realizado: 0,
      meta: 0.6,
      dias: MES_INTEIRO,
    });

    expect(apurado.situacao).toBe(SITUACAO.APURADA);
    expect(apurado.pct).toBe(0);
    expect(apurado.faixa).toBe(TipoFaixa.ZERO);
  });

  it("no FECHAMENTO do mês, sem medição vale 0 ponto — decisão explícita", () => {
    // Um mês inteiro sem nenhum boleto: o P.A. nunca teve denominador. Não há
    // desempenho a premiar, então são 0 pontos. O que não pode é o zero nascer
    // de um null que virou zero no meio do caminho: a situação continua
    // registrada como SEM_MEDICAO, e a tela mostra "—" em vez de 0%.
    const fechamento = apurarIndicador({
      regra: regraDe(Indicador.PA),
      faixas: FAIXAS,
      realizado: null,
      meta: 1.6,
      dias: MES_INTEIRO,
    });

    expect(fechamento.pontos).toBe(0);
    expect(fechamento.situacao).toBe(SITUACAO.SEM_MEDICAO);
    expect(fechamento.pct).toBeNull();
  });

  it("sem medição e 0% dão os mesmos pontos, e situações diferentes", () => {
    const semMedicao = apurarIndicador({
      regra: regraDe(Indicador.PA), faixas: FAIXAS, realizado: null, meta: 1.6, dias: MES_INTEIRO,
    });
    const zeroReal = apurarIndicador({
      regra: regraDe(Indicador.PA), faixas: FAIXAS, realizado: 0, meta: 1.6, dias: MES_INTEIRO,
    });

    expect(semMedicao.pontos).toBe(zeroReal.pontos);
    expect(semMedicao.situacao).not.toBe(zeroReal.situacao);
  });
});

describe("meta zero deixa o indicador fora da apuração", () => {
  it("não pontua e não produz percentual", () => {
    const apurado = apurarIndicador({
      regra: regraDe(Indicador.VALOR),
      faixas: FAIXAS,
      realizado: 5000,
      meta: 0,
      dias: MES_INTEIRO,
    });

    expect(apurado.situacao).toBe(SITUACAO.FORA_DA_APURACAO);
    expect(apurado.pct).toBeNull();
    expect(apurado.pontos).toBe(0);
  });

  it("nenhuma divisão por meta zero escapa", () => {
    for (const meta of [0, null, -1]) {
      const apurado = apurarIndicador({
        regra: regraDe(Indicador.VALOR), faixas: FAIXAS, realizado: 5000, meta, dias: MES_INTEIRO,
      });
      expect(apurado.pct).toBeNull();
      expect(Number.isFinite(apurado.pct as unknown as number)).toBe(false);
    }
  });

  it("um indicador desligado sai da conta sem quebrar nada", () => {
    const desligado = { ...regraDe(Indicador.CRM), ativo: false };
    const apurado = apurarIndicador({
      regra: desligado, faixas: FAIXAS, realizado: 0.3, meta: 0.2, dias: MES_INTEIRO,
    });

    expect(apurado.situacao).toBe(SITUACAO.FORA_DA_APURACAO);
    expect(apurado.pontos).toBe(0);
    expect(totalDePontosAlto([...REGRAS.filter((r) => r.indicador !== Indicador.CRM), desligado])).toBe(37);
  });
});

describe("o rateio das metas", () => {
  const loja = {
    valor: 55000, pares: 190, bolsas: 5, pa: 1.6, conversao: 0.6, crm: 0.2,
    modoRateio: ModoRateio.PROPORCIONAL,
  };

  it("Padre: a divisão desigual do Valor arrasta Pares e Bolsas", () => {
    const daGerente = metasDaVendedora({
      metaValorDaVendedora: 11000, somaDasMetasAtivas: 55000, quantidadeDeAtivas: 2, loja,
    });
    const daOutra = metasDaVendedora({
      metaValorDaVendedora: 44000, somaDasMetasAtivas: 55000, quantidadeDeAtivas: 2, loja,
    });

    expect(daGerente.VALOR).toBe(11000);
    expect(daOutra.VALOR).toBe(44000);

    // 190 pares na proporção 20/80, e não 95 para cada.
    expect(daGerente.PARES).toBeCloseTo(38, 6);
    expect(daOutra.PARES).toBeCloseTo(152, 6);
    expect(daGerente.PARES! + daOutra.PARES!).toBeCloseTo(190, 6);

    expect(daGerente.BOLSAS).toBeCloseTo(1, 6);
    expect(daOutra.BOLSAS).toBeCloseTo(4, 6);
  });

  it("Barra: onde o Valor já divide igual, o rateio devolve a divisão igual", () => {
    const barra = { ...loja, valor: 100000, pares: 340, bolsas: 15 };
    const metas = [33334, 33333, 33333].map((meta) =>
      metasDaVendedora({
        metaValorDaVendedora: meta, somaDasMetasAtivas: 100000, quantidadeDeAtivas: 3, loja: barra,
      }),
    );

    for (const meta of metas) expect(meta.PARES).toBeCloseTo(340 / 3, 1);
    expect(metas.reduce((soma, m) => soma + m.PARES!, 0)).toBeCloseTo(340, 6);
  });

  it("as fatias sempre somam a meta da loja, mesmo desiguais", () => {
    const soma = [11000, 44000]
      .map((meta) =>
        metasDaVendedora({
          metaValorDaVendedora: meta, somaDasMetasAtivas: 55000, quantidadeDeAtivas: 2, loja,
        }),
      )
      .reduce((total, m) => total + m.BOLSAS!, 0);

    expect(soma).toBeCloseTo(5, 10);
  });

  it("no modo IGUAL a divisão ignora o peso do Valor", () => {
    const igual = { ...loja, modoRateio: ModoRateio.IGUAL };
    const daGerente = metasDaVendedora({
      metaValorDaVendedora: 11000, somaDasMetasAtivas: 55000, quantidadeDeAtivas: 2, loja: igual,
    });

    expect(daGerente.PARES).toBeCloseTo(95, 6);
    expect(daGerente.VALOR).toBe(11000); // Valor continua vindo do relatório
  });

  it("P.A., Conversão e CRM são idênticas às da loja", () => {
    const vendedora = metasDaVendedora({
      metaValorDaVendedora: 11000, somaDasMetasAtivas: 55000, quantidadeDeAtivas: 2, loja,
    });
    const gerente = metasDaGerente(loja);

    expect(vendedora.PA).toBe(gerente.PA);
    expect(vendedora.CONVERSAO).toBe(gerente.CONVERSAO);
    expect(vendedora.CRM).toBe(gerente.CRM);
  });

  it("meta de Valor zerada tira a pessoa de todos os indicadores", () => {
    const fora = metasDaVendedora({
      metaValorDaVendedora: 0, somaDasMetasAtivas: 55000, quantidadeDeAtivas: 2, loja,
    });

    for (const meta of Object.values(fora)) expect(meta).toBeNull();
  });

  it("a gerente é apurada contra a meta cheia da loja", () => {
    const gerente = metasDaGerente(loja);
    expect(gerente.VALOR).toBe(55000);
    expect(gerente.PARES).toBe(190);
    expect(gerente.BOLSAS).toBe(5);
  });
});

describe("o total do mês", () => {
  const entradaBase = {
    regras: REGRAS,
    faixas: FAIXAS,
    dias: MES_INTEIRO,
    metas: { VALOR: 33333, PARES: 113.3, BOLSAS: 5, PA: 1.6, CONVERSAO: 0.6, CRM: 0.2 },
  };

  it("soma os pontos dos seis indicadores e converte em reais", () => {
    const total = apurarTudo({
      ...entradaBase,
      realizados: { VALOR: 35000, PARES: 100, BOLSAS: 6, PA: 1.7, CONVERSAO: 0.55, CRM: null },
      valorDoPonto: 15,
    });

    const porIndicador = Object.fromEntries(
      total.porIndicador.map((item) => [item.indicador, item.pontos]),
    );

    expect(porIndicador.VALOR).toBe(10); // 35.000 / 33.333 = 105% → base
    expect(porIndicador.PARES).toBe(0); // 100 / 113,3 = 88% → zero
    expect(porIndicador.BOLSAS).toBe(7); // 6 / 5 = 120% → alto
    expect(porIndicador.PA).toBe(3); // 1,7 / 1,6 = 106% → base
    expect(porIndicador.CONVERSAO).toBe(0); // 0,55 / 0,6 = 91,7% → zero
    expect(porIndicador.CRM).toBe(0); // sem medição

    expect(total.pontos).toBe(20);
    expect(total.bonusReais).toBe(300);
  });

  it("a gerente que também vende tem apuração, e bônus de vendedora zerado", () => {
    const comum = {
      ...entradaBase,
      realizados: { VALOR: 35000, PARES: 120, BOLSAS: 6, PA: 1.7, CONVERSAO: 0.7, CRM: 0.3 },
      valorDoPonto: 15,
    };

    const vendedora = apurarTudo(comum);
    const gerenteQueVende = apurarTudo({ ...comum, recebeBonus: false });

    // Os números dela continuam na tela: servem para a conversa da reunião.
    expect(gerenteQueVende.pontos).toBe(vendedora.pontos);
    expect(gerenteQueVende.pontos).toBeGreaterThan(0);
    // Só o dinheiro é zerado: ela é remunerada pelo resultado da loja.
    expect(gerenteQueVende.bonusReais).toBe(0);
    expect(vendedora.bonusReais).toBeGreaterThan(0);
  });

  it("o ponto da gerente vale R$ 25 e o da vendedora R$ 15", () => {
    const realizados = { VALOR: 35000, PARES: 120, BOLSAS: 6, PA: 1.7, CONVERSAO: 0.7, CRM: 0.3 };

    const comoVendedora = apurarTudo({ ...entradaBase, realizados, valorDoPonto: 15 });
    const comoGerente = apurarTudo({ ...entradaBase, realizados, valorDoPonto: 25 });

    expect(comoGerente.bonusReais / comoVendedora.bonusReais).toBeCloseTo(25 / 15, 10);
  });
});

describe("o ritmo do mês e os selos do ranking", () => {
  const item = (
    pct: number | null,
    pontosAlto: number,
    situacao: Situacao = SITUACAO.APURADA,
  ) => ({ pct, situacao, pontosAlto });

  it("é a média dos percentuais ponderada pelos pontos de cada indicador", () => {
    // Valor a 120% pesando 15, Conversão a 40% pesando 3.
    const ritmo = ritmoDoMes([item(1.2, 15), item(0.4, 3)]);
    expect(ritmo).toBeCloseTo((1.2 * 15 + 0.4 * 3) / 18, 6);
  });

  it("ir mal no Valor pesa mais do que ir mal na Conversão", () => {
    const valorRuim = ritmoDoMes([item(0.5, 15), item(1.2, 3)]);
    const conversaoRuim = ritmoDoMes([item(1.2, 15), item(0.5, 3)]);

    expect(valorRuim!).toBeLessThan(conversaoRuim!);
  });

  it("indicador sem medição fica de fora, em vez de contar como zero", () => {
    const comAusencia = ritmoDoMes([item(1.1, 15), item(null, 5, SITUACAO.SEM_MEDICAO)]);
    const soOMedido = ritmoDoMes([item(1.1, 15)]);

    expect(comAusencia).toBe(soOMedido);
    // Se o ausente virasse zero, o ritmo cairia para 0,825.
    expect(comAusencia).toBeCloseTo(1.1, 6);
  });

  it("indicador fora da apuração também não entra", () => {
    const ritmo = ritmoDoMes([item(1.0, 10), item(2, 15, SITUACAO.FORA_DA_APURACAO)]);
    expect(ritmo).toBe(1);
  });

  it("sem nenhum indicador medido, o ritmo é nulo e não há selo", () => {
    expect(ritmoDoMes([])).toBeNull();
    expect(ritmoDoMes([item(null, 15, SITUACAO.SEM_MEDICAO)])).toBeNull();
    expect(seloDoRitmo(null)).toBeNull();
  });

  it.each([
    [1.5, SELO.NO_RITMO],
    [1.0, SELO.NO_RITMO],
    [0.999, SELO.ATENCAO],
    [0.9, SELO.ATENCAO],
    [0.8, SELO.ATENCAO],
    [0.799, SELO.CRITICO],
    [0.5, SELO.CRITICO],
    [0, SELO.CRITICO],
  ])("ritmo %s → selo %s", (ritmo, esperado) => {
    expect(seloDoRitmo(ritmo)).toBe(esperado);
  });

  it("os cortes do brief: 100% e 80%", () => {
    // "no ritmo" começa exatamente em 100%, "atenção" exatamente em 80%.
    expect(seloDoRitmo(1)).toBe(SELO.NO_RITMO);
    expect(seloDoRitmo(1 - 1e-9)).toBe(SELO.ATENCAO);
    expect(seloDoRitmo(0.8)).toBe(SELO.ATENCAO);
    expect(seloDoRitmo(0.8 - 1e-9)).toBe(SELO.CRITICO);
  });
});
