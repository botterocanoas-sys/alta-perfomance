import * as xlsx from "xlsx";

/**
 * Monta relatórios sintéticos no mesmo formato do arquivo real.
 *
 * Serve para testar o que o arquivo de exemplo não traz: blocos em outra ordem,
 * coluna faltando, cabeçalho em outra altura, e — o mais importante — dois dias
 * seguidos com acumulados diferentes, para exercitar o delta.
 */

export const CABECALHO = [
  "Loja",
  "Vendedor",
  "Valor",
  "Base Comissao",
  "Meta",
  "PA",
  "T. Medio",
  "BS",
  "Oportunidades",
  "Boletos",
  "Conversao",
  "Calçados",
  "Bolsas",
  "Cintos",
  "Carteiras",
  "Meias",
  "Kit Cuidado",
  "Total",
];

export type LinhaSintetica = {
  nome: string;
  valor?: number;
  meta?: number;
  oportunidades?: number;
  boletos?: number;
  calcados?: number;
  bolsas?: number;
  cintos?: number;
  carteiras?: number;
  meias?: number;
  kitCuidado?: number;
  /** Quando omitido, é a soma das categorias — como no arquivo real. */
  total?: number;
};

export type BlocoSintetico = {
  /** O texto exato da célula "Loja", com espaços se quiser testar isso. */
  loja: string;
  linhas: LinhaSintetica[];
  /** Acrescenta a linha "Subtotal" somando o bloco. Ligado por padrão. */
  comSubtotal?: boolean;
};

function montarLinha(loja: string | null, linha: LinhaSintetica): (string | number | null)[] {
  const calcados = linha.calcados ?? 0;
  const bolsas = linha.bolsas ?? 0;
  const cintos = linha.cintos ?? 0;
  const carteiras = linha.carteiras ?? 0;
  const meias = linha.meias ?? 0;
  const kitCuidado = linha.kitCuidado ?? 0;
  const total = linha.total ?? calcados + bolsas + cintos + carteiras + meias + kitCuidado;

  const boletos = linha.boletos ?? 0;
  const oportunidades = linha.oportunidades ?? 0;
  const valor = linha.valor ?? 0;

  return [
    loja,
    linha.nome,
    valor,
    valor,
    linha.meta ?? 0,
    // O relatório traz P.A. e Conversão já calculados; o app recalcula, mas
    // guardamos valores coerentes para o arquivo parecer com o de verdade.
    boletos === 0 ? 0 : Number((total / boletos).toFixed(4)),
    boletos === 0 ? 0 : Number((valor / boletos).toFixed(4)),
    0,
    oportunidades,
    boletos,
    oportunidades === 0 ? 0 : Number(((boletos / oportunidades) * 100).toFixed(2)),
    calcados,
    bolsas,
    cintos,
    carteiras,
    meias,
    kitCuidado,
    total,
  ];
}

function somar(linhas: LinhaSintetica[]): LinhaSintetica {
  const soma = (pegar: (linha: LinhaSintetica) => number) =>
    linhas.reduce((total, linha) => total + pegar(linha), 0);

  const calcados = soma((l) => l.calcados ?? 0);
  const bolsas = soma((l) => l.bolsas ?? 0);
  const cintos = soma((l) => l.cintos ?? 0);
  const carteiras = soma((l) => l.carteiras ?? 0);
  const meias = soma((l) => l.meias ?? 0);
  const kitCuidado = soma((l) => l.kitCuidado ?? 0);

  return {
    nome: "Subtotal",
    valor: Number(soma((l) => l.valor ?? 0).toFixed(4)),
    meta: soma((l) => l.meta ?? 0),
    oportunidades: soma((l) => l.oportunidades ?? 0),
    boletos: soma((l) => l.boletos ?? 0),
    calcados,
    bolsas,
    cintos,
    carteiras,
    meias,
    kitCuidado,
    total: soma(
      (l) =>
        l.total ??
        (l.calcados ?? 0) +
          (l.bolsas ?? 0) +
          (l.cintos ?? 0) +
          (l.carteiras ?? 0) +
          (l.meias ?? 0) +
          (l.kitCuidado ?? 0),
    ),
  };
}

export function montarRelatorio(
  blocos: BlocoSintetico[],
  opcoes: { linhasAntesDoCabecalho?: number; cabecalho?: string[] } = {},
): Buffer {
  const antes = opcoes.linhasAntesDoCabecalho ?? 12;
  const linhas: (string | number | null)[][] = [];

  linhas.push(["Relatório Performance por Vendedor"]);
  for (let i = 1; i < antes; i += 1) linhas.push([]);

  linhas.push(opcoes.cabecalho ?? CABECALHO);

  for (const bloco of blocos) {
    bloco.linhas.forEach((linha, indice) => {
      // A coluna "Loja" só vem preenchida na primeira linha do bloco.
      linhas.push(montarLinha(indice === 0 ? bloco.loja : null, linha));
    });

    if (bloco.comSubtotal !== false) {
      linhas.push(montarLinha(null, somar(bloco.linhas)));
    }
  }

  const aba = xlsx.utils.aoa_to_sheet(linhas);
  const pasta = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(pasta, aba, "Indicadores");

  return xlsx.write(pasta, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** As três chaves de loja como aparecem no relatório real. */
export const CHAVES = {
  padre: "PORTO A. - RS - PADRE CHAGAS",
  park: "CANOAS - RS - PARK SHOPPING",
  // Com o espaço na frente, exatamente como no arquivo de verdade.
  barra: " PORTO A. - RS - BARRA SHOPPING",
} as const;
