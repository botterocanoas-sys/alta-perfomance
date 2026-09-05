import { Indicador, SituacaoApuracao } from "@prisma/client";

import type { LinhaDoRanking } from "@/lib/apuracao";
import type { Degrau } from "@/lib/pontuacao";

/**
 * Os insights da tela da reunião (seção 9 do brief).
 *
 * Funções puras sobre os números já calculados. Sem IA, sem texto gerado: cada
 * frase nasce de uma **distância numérica** entre meta, realizado e ritmo, e
 * carrega o número que a originou. Não há elogio nem crítica genérica — se não
 * dá para apontar a conta, a frase não existe.
 *
 * Hipótese é sempre hipótese. O app não diz "o ticket dela é baixo"; diz que os
 * números são compatíveis com isso e que vale checar na conversa. Quem sabe é a
 * gerente, que estava lá.
 */

export const TOM = {
  /** Ritmo abaixo de 80%: a distância maior do mês. */
  PRIORIDADE: "PRIORIDADE",
  /** Entre 80% e 100%: ainda dá para recuperar, e dá para dizer quanto por dia. */
  RECUPERAVEL: "RECUPERAVEL",
  /** Acima de 100%: reconhecer, com o número. */
  RECONHECIMENTO: "RECONHECIMENTO",
  /** Forte contra fraco, com uma leitura possível — a checar, nunca a afirmar. */
  HIPOTESE: "HIPOTESE",
  /** A distância para a média da loja. */
  COMPARACAO: "COMPARACAO",
  /** Perto de virar de faixa: quanto falta e quanto vale. */
  DEGRAU: "DEGRAU",
} as const;

export type Tom = (typeof TOM)[keyof typeof TOM];

export type Insight = {
  /** Identifica a frase, para a tela e para os testes. */
  chave: string;
  tom: Tom;
  texto: string;
  indicador: Indicador | null;
  /** Quanto mais alto, mais cedo a frase aparece. Sai da distância numérica. */
  peso: number;
};

const ROTULO: Record<Indicador, string> = {
  VALOR: "Valor",
  PARES: "Pares",
  BOLSAS: "Bolsas",
  PA: "P.A.",
  CONVERSAO: "Conversão",
  CRM: "CRM",
};

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

/** A unidade de cada indicador, para a frase falar como a loja fala. */
const UNIDADE: Record<Indicador, string> = {
  VALOR: "",
  PARES: "pares",
  BOLSAS: "bolsas",
  PA: "peças por atendimento",
  CONVERSAO: "de conversão",
  CRM: "de CRM",
};

function quantidade(indicador: Indicador, valor: number): string {
  if (indicador === Indicador.VALOR) return reais.format(valor);
  if (indicador === Indicador.PARES || indicador === Indicador.BOLSAS) {
    const inteiro = Math.max(1, Math.ceil(valor - 1e-9));
    return `${inteiro} ${inteiro === 1 ? UNIDADE[indicador].replace(/s$/, "") : UNIDADE[indicador]}`;
  }
  return `${numero.format(valor)} ${UNIDADE[indicador]}`;
}

/**
 * As leituras possíveis quando um indicador vai muito melhor que outro.
 *
 * São hipóteses de venda, não diagnósticos: a mesma combinação de números pode
 * ter várias causas, e só a conversa separa.
 */
const HIPOTESES: Partial<Record<`${Indicador}>${Indicador}`, string>> = {
  "CONVERSAO>VALOR":
    "ela fecha com quase todo mundo que atende, mas o valor de cada venda é baixo",
  "CONVERSAO>PARES": "ela converte bem, mas leva pouca peça em cada venda",
  "PA>CONVERSAO": "quando ela vende, vende bem; o gargalo parece ser fechar a venda",
  "VALOR>PARES": "ela fatura com poucas peças — ticket alto e volume baixo",
  "VALOR>CONVERSAO": "poucas vendas, mas grandes",
  "PARES>VALOR": "ela vende volume, mas de produto mais barato",
  "PARES>PA": "ela vende bastante par, mas quase sempre um por atendimento",
  "BOLSAS>PARES": "a bolsa está saindo mais que o calçado, que é o carro-chefe",
};

export type EntradaDosInsights = {
  porIndicador: LinhaDoRanking["porIndicador"];
  /** O ritmo de cada indicador na loja, para comparar. */
  mediaDaLoja: Map<Indicador, number>;
  diasDecorridos: number;
  diasDoMes: number;
  /** O degrau já mostrado no card "atacar hoje" — não repetimos como frase. */
  degrauNoCard: Degrau | null;
  /** Outros degraus possíveis, para a frase de "perto de virar de faixa". */
  degraus: Degrau[];
  /** Quanto vale um ponto para esta pessoa. Zero quando ela não recebe bônus. */
  valorDoPonto: number;
};

/** Só entram na conta os indicadores que têm meta e medição. */
function medidos(porIndicador: LinhaDoRanking["porIndicador"]) {
  return porIndicador.filter(
    (item) => item.situacao === SituacaoApuracao.APURADA && item.pct !== null,
  );
}

/**
 * Gera de 3 a 5 frases, ordenadas por relevância.
 *
 * Pode devolver menos de 3 no começo do mês, quando quase nada foi medido — é
 * melhor que inventar frase sem número por trás.
 */
export function gerarInsights(entrada: EntradaDosInsights): Insight[] {
  const candidatos: Insight[] = [
    ...frasesDeRitmo(entrada),
    ...frasesDeHipotese(entrada),
    ...frasesDeComparacao(entrada),
    ...frasesDeDegrau(entrada),
  ];

  // Uma frase por indicador, para não repetir o mesmo assunto de dois ângulos.
  const vistos = new Set<string>();
  const escolhidos: Insight[] = [];

  for (const insight of [...candidatos].sort((a, b) => b.peso - a.peso)) {
    const assunto = `${insight.tom}:${insight.indicador ?? ""}`;
    if (vistos.has(assunto)) continue;
    vistos.add(assunto);
    escolhidos.push(insight);
    if (escolhidos.length === 5) break;
  }

  return escolhidos;
}

/** Prioridade, recuperável e reconhecimento — as três faixas da seção 9. */
function frasesDeRitmo(entrada: EntradaDosInsights): Insight[] {
  const diasQueFaltam = Math.max(0, entrada.diasDoMes - entrada.diasDecorridos);

  return medidos(entrada.porIndicador).flatMap((item): Insight[] => {
    const ritmo = item.pct!;
    const rotulo = ROTULO[item.indicador];

    // Abaixo de 80%: prioridade, com a distância até o ritmo de hoje.
    if (ritmo < 0.8) {
      const falta =
        item.metaProporcional !== null && item.acumulado !== null
          ? item.metaProporcional - item.acumulado
          : null;

      return [
        {
          chave: `prioridade-${item.indicador}`,
          tom: TOM.PRIORIDADE,
          indicador: item.indicador,
          peso: 100 + (0.8 - ritmo) * 100,
          texto:
            falta !== null && falta > 0
              ? `${rotulo} está em ${pct.format(ritmo)} do ritmo — a maior distância dela hoje. Para voltar ao ritmo faltam ${quantidade(item.indicador, falta)}.`
              : `${rotulo} está em ${pct.format(ritmo)} do ritmo — a maior distância dela hoje.`,
        },
      ];
    }

    // De 80% a 100%: ainda dá para recuperar, e dá para dizer quanto por dia.
    if (ritmo < 1) {
      const faltaNoMes =
        item.meta !== null && item.acumulado !== null ? item.meta - item.acumulado : null;

      const porDia =
        faltaNoMes !== null && faltaNoMes > 0 && diasQueFaltam > 0
          ? faltaNoMes / diasQueFaltam
          : null;

      return [
        {
          chave: `recuperavel-${item.indicador}`,
          tom: TOM.RECUPERAVEL,
          indicador: item.indicador,
          peso: 60 + (1 - ritmo) * 100,
          texto:
            porDia !== null
              ? `${rotulo} em ${pct.format(ritmo)} do ritmo: ainda dá para recuperar. São ${quantidade(item.indicador, porDia)} por dia nos ${diasQueFaltam} dias que faltam.`
              : `${rotulo} em ${pct.format(ritmo)} do ritmo: ainda dá para recuperar.`,
        },
      ];
    }

    // Acima de 100%: reconhecer, com o número.
    return [
      {
        chave: `reconhecimento-${item.indicador}`,
        tom: TOM.RECONHECIMENTO,
        indicador: item.indicador,
        peso: 20 + Math.min(30, (ritmo - 1) * 100),
        texto: `${rotulo} em ${pct.format(ritmo)} do ritmo. É o que está sustentando o mês dela — vale manter o que está funcionando.`,
      },
    ];
  });
}

/** O mais forte contra o mais fraco, com uma leitura a checar na conversa. */
function frasesDeHipotese(entrada: EntradaDosInsights): Insight[] {
  const comMedida = medidos(entrada.porIndicador);
  if (comMedida.length < 2) return [];

  const ordenados = [...comMedida].sort((a, b) => b.pct! - a.pct!);
  const forte = ordenados[0];
  const fraco = ordenados[ordenados.length - 1];

  // Sem distância relevante entre os dois, não há o que levantar.
  const distancia = forte.pct! - fraco.pct!;
  if (distancia < 0.25) return [];

  const leitura = HIPOTESES[`${forte.indicador}>${fraco.indicador}`];

  return [
    {
      chave: `hipotese-${forte.indicador}-${fraco.indicador}`,
      tom: TOM.HIPOTESE,
      indicador: fraco.indicador,
      peso: 80 + distancia * 20,
      texto: leitura
        ? `${ROTULO[forte.indicador]} em ${pct.format(forte.pct!)} e ${ROTULO[fraco.indicador]} em ${pct.format(fraco.pct!)}. Pode ser que ${leitura} — vale perguntar a ela, não é conclusão do app.`
        : `${ROTULO[forte.indicador]} em ${pct.format(forte.pct!)} e ${ROTULO[fraco.indicador]} em ${pct.format(fraco.pct!)}: ${pct.format(distancia)} de diferença entre o melhor e o pior. Vale perguntar o que muda de um atendimento para o outro.`,
    },
  ];
}

/** A maior distância para a média da loja, para cima ou para baixo. */
function frasesDeComparacao(entrada: EntradaDosInsights): Insight[] {
  const comparaveis = medidos(entrada.porIndicador)
    .map((item) => {
      const daLoja = entrada.mediaDaLoja.get(item.indicador);
      if (daLoja === undefined) return null;
      return { item, daLoja, diferenca: item.pct! - daLoja };
    })
    .filter((linha): linha is NonNullable<typeof linha> => linha !== null);

  if (comparaveis.length === 0) return [];

  const maior = comparaveis.reduce((melhor, linha) =>
    Math.abs(linha.diferenca) > Math.abs(melhor.diferenca) ? linha : melhor,
  );

  // Diferença pequena não é informação: é ruído.
  if (Math.abs(maior.diferenca) < 0.15) return [];

  const rotulo = ROTULO[maior.item.indicador];
  const acima = maior.diferenca > 0;

  return [
    {
      chave: `comparacao-${maior.item.indicador}`,
      tom: TOM.COMPARACAO,
      indicador: maior.item.indicador,
      peso: 50 + Math.abs(maior.diferenca) * 20,
      texto: acima
        ? `Em ${rotulo} ela está ${pct.format(maior.diferenca)} acima da loja (${pct.format(maior.item.pct!)} contra ${pct.format(maior.daLoja)}). É onde ela puxa o time para cima.`
        : `Em ${rotulo} ela está ${pct.format(Math.abs(maior.diferenca))} abaixo da loja (${pct.format(maior.item.pct!)} contra ${pct.format(maior.daLoja)}). As colegas estão achando um caminho que ela ainda não achou.`,
    },
  ];
}

/** Perto de virar de faixa: quanto falta e quanto vale em pontos e em reais. */
function frasesDeDegrau(entrada: EntradaDosInsights): Insight[] {
  const outros = entrada.degraus.filter(
    (degrau) => degrau.indicador !== entrada.degrauNoCard?.indicador,
  );

  // Só vale a frase quando está perto de verdade: até 5% da meta até hoje.
  const perto = outros.filter((degrau) => degrau.faltaEmPct <= 0.05);
  if (perto.length === 0) return [];

  const melhor = perto.reduce((a, b) => (b.retorno > a.retorno ? b : a));
  const emReais = melhor.ganhoEmPontos * entrada.valorDoPonto;

  return [
    {
      chave: `degrau-${melhor.indicador}`,
      tom: TOM.DEGRAU,
      indicador: melhor.indicador,
      peso: 70 + melhor.ganhoEmPontos,
      texto: `${ROTULO[melhor.indicador]} está a ${pct.format(melhor.faltaEmPct)} de virar de faixa: vale ${numero.format(melhor.ganhoEmPontos)} ${melhor.ganhoEmPontos === 1 ? "ponto" : "pontos"}${emReais > 0 ? ` = ${reais.format(emReais)}` : ""}.`,
    },
  ];
}
