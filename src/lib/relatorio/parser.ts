import * as xlsx from "xlsx";

import { normalizar } from "@/lib/texto";

/**
 * Leitura do "Relatório Performance por Vendedor" (.xlsx).
 *
 * O que o arquivo real faz e que o parser não pode assumir de outro jeito:
 *
 *  - o cabeçalho não está na linha 1: vêm um título e ~11 linhas em branco
 *    antes. Achamos a linha do cabeçalho procurando a célula "Loja";
 *  - as colunas são localizadas PELO NOME, nunca pela posição;
 *  - os blocos das lojas vêm em ordem qualquer. Cada bloco é reconhecido pelo
 *    texto da célula "Loja", nunca por onde ele está no arquivo;
 *  - a coluna "Loja" só vem preenchida na primeira linha de cada bloco: o valor
 *    arrasta para baixo até o próximo preenchido;
 *  - a célula da Barra vem com espaço na frente. Tudo é comparado normalizado;
 *  - cada bloco termina numa linha cujo Vendedor é "Subtotal", que serve de
 *    conferência e nunca vira vendedora;
 *  - a coluna "Conversao" vem em pontos percentuais (44,44), não em fração.
 *    Guardamos como veio e convertemos só na hora de comparar com a meta.
 *
 * O parser não conhece o banco. Ele lê e valida a forma do arquivo; quem casa
 * com loja e vendedora é `importar.ts`.
 */

/** Nomes das colunas como aparecem no cabeçalho, já normalizados. */
const COLUNAS = {
  loja: "LOJA",
  vendedor: "VENDEDOR",
  valor: "VALOR",
  baseComissao: "BASE COMISSAO",
  meta: "META",
  pa: "PA",
  ticketMedio: "T. MEDIO",
  bs: "BS",
  oportunidades: "OPORTUNIDADES",
  boletos: "BOLETOS",
  conversao: "CONVERSAO",
  calcados: "CALCADOS",
  bolsas: "BOLSAS",
  cintos: "CINTOS",
  carteiras: "CARTEIRAS",
  meias: "MEIAS",
  kitCuidado: "KIT CUIDADO",
  total: "TOTAL",
} as const;

type ChaveDeColuna = keyof typeof COLUNAS;

/** O texto que fecha um bloco. Não é vendedora. */
const MARCA_DE_SUBTOTAL = "SUBTOTAL";

export type LinhaDoRelatorio = {
  /** Linha na planilha, contando a partir de 1, como o Excel mostra. */
  linhaOriginal: number;
  /** Nome como está escrito no arquivo, preservado. */
  nome: string;
  /** O mesmo nome sem acento, sem espaço sobrando e em maiúsculas. */
  nomeNormalizado: string;

  valor: number;
  baseComissao: number;
  metaValor: number;
  pa: number;
  ticketMedio: number;
  bs: number;
  oportunidades: number;
  boletos: number;
  /** Como veio: pontos percentuais (44.44), não fração. */
  conversao: number;
  calcados: number;
  bolsas: number;
  cintos: number;
  carteiras: number;
  meias: number;
  kitCuidado: number;
  total: number;
};

export type BlocoDeLoja = {
  /** Texto da célula "Loja", normalizado. Ex.: "PORTO A. - RS - BARRA SHOPPING". */
  chave: string;
  /**
   * A célula exatamente como estava no arquivo, sem aparar — na Barra ela vem
   * com espaço na frente. Só para exibir; a comparação usa `chave`.
   */
  chaveOriginal: string;
  linhaOriginal: number;
  vendedores: LinhaDoRelatorio[];
  /** A linha "Subtotal" do bloco, quando existe. */
  subtotal: LinhaDoRelatorio | null;
};

export type RelatorioLido = {
  aba: string;
  linhaDoCabecalho: number;
  blocos: BlocoDeLoja[];
};

export class RelatorioInvalido extends Error {
  readonly detalhes: string[];

  constructor(mensagem: string, detalhes: string[] = []) {
    super(mensagem);
    this.name = "RelatorioInvalido";
    this.detalhes = detalhes;
  }
}

/** Converte o que veio da célula em número, aceitando "1.234,56" e vazio. */
function numero(valor: unknown): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  const texto = String(valor)
    .replace(/\s/g, "")
    .replace(/[R$%]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const convertido = Number(texto);
  return Number.isFinite(convertido) ? convertido : 0;
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

/**
 * Acha a linha do cabeçalho procurando uma célula "Loja" que tenha "Vendedor"
 * na mesma linha. Só "Loja" não bastaria: a palavra pode aparecer no título.
 */
function acharCabecalho(linhas: unknown[][]): number {
  for (let indice = 0; indice < linhas.length; indice += 1) {
    const celulas = (linhas[indice] ?? []).map((celula) => normalizar(texto(celula)));
    if (celulas.includes(COLUNAS.loja) && celulas.includes(COLUNAS.vendedor)) return indice;
  }

  throw new RelatorioInvalido(
    "Não encontrei o cabeçalho da tabela neste arquivo.",
    ['Procurei uma linha que tivesse as colunas "Loja" e "Vendedor" e não achei nenhuma.'],
  );
}

/** Mapeia cada coluna esperada para o índice dela na planilha. */
function mapearColunas(linhaDoCabecalho: unknown[]): Record<ChaveDeColuna, number> {
  const normalizadas = linhaDoCabecalho.map((celula) => normalizar(texto(celula)));

  const posicoes = {} as Record<ChaveDeColuna, number>;
  const faltando: string[] = [];

  for (const [chave, rotulo] of Object.entries(COLUNAS) as [ChaveDeColuna, string][]) {
    const posicao = normalizadas.indexOf(rotulo);
    if (posicao === -1) faltando.push(rotulo);
    else posicoes[chave] = posicao;
  }

  if (faltando.length > 0) {
    throw new RelatorioInvalido(
      `O arquivo não tem ${faltando.length === 1 ? "uma coluna esperada" : "colunas esperadas"}.`,
      [
        `Faltando: ${faltando.join(", ")}.`,
        "Confira se o relatório exportado é o de Performance por Vendedor.",
      ],
    );
  }

  return posicoes;
}

/**
 * Lê o arquivo inteiro. Levanta `RelatorioInvalido` sem gravar nada quando a
 * forma do arquivo não bate — a seção 8.4 do brief não admite gravação parcial.
 */
export function lerRelatorio(conteudo: Buffer | ArrayBuffer): RelatorioLido {
  const pasta = xlsx.read(conteudo, { type: "buffer", cellDates: false });

  const nomeDaAba = pasta.SheetNames[0];
  if (!nomeDaAba) throw new RelatorioInvalido("O arquivo não tem nenhuma aba.");

  const planilha = pasta.Sheets[nomeDaAba];
  const linhas = xlsx.utils.sheet_to_json<unknown[]>(planilha, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });

  const indiceDoCabecalho = acharCabecalho(linhas);
  const colunas = mapearColunas(linhas[indiceDoCabecalho] ?? []);

  const blocos: BlocoDeLoja[] = [];
  const porChave = new Map<string, BlocoDeLoja>();
  let blocoAtual: BlocoDeLoja | null = null;

  for (let indice = indiceDoCabecalho + 1; indice < linhas.length; indice += 1) {
    const linha = linhas[indice] ?? [];
    const numeroDaLinha = indice + 1;

    const celulaDaLojaComoVeio = texto(linha[colunas.loja]);
    const celulaDaLoja = celulaDaLojaComoVeio.trim();
    const nome = texto(linha[colunas.vendedor]).trim();

    // Linha em branco entre blocos: não fecha nada, só é ignorada.
    if (celulaDaLoja === "" && nome === "") continue;

    // A coluna "Loja" só vem preenchida na primeira linha do bloco. Quando ela
    // aparece, começa um bloco novo (ou continua um já visto, se o arquivo
    // repetir a loja mais adiante).
    if (celulaDaLoja !== "") {
      const chave = normalizar(celulaDaLoja);
      const existente = porChave.get(chave);

      if (existente) {
        blocoAtual = existente;
      } else {
        blocoAtual = {
          chave,
          chaveOriginal: celulaDaLojaComoVeio,
          linhaOriginal: numeroDaLinha,
          vendedores: [],
          subtotal: null,
        };
        blocos.push(blocoAtual);
        porChave.set(chave, blocoAtual);
      }
    }

    if (nome === "") continue;

    if (!blocoAtual) {
      throw new RelatorioInvalido(
        `A linha ${numeroDaLinha} traz um vendedor antes de qualquer loja.`,
        ['A primeira linha de cada bloco precisa ter a loja preenchida na coluna "Loja".'],
      );
    }

    const ler = (chave: ChaveDeColuna) => numero(linha[colunas[chave]]);

    const registro: LinhaDoRelatorio = {
      linhaOriginal: numeroDaLinha,
      nome,
      nomeNormalizado: normalizar(nome),
      valor: ler("valor"),
      baseComissao: ler("baseComissao"),
      metaValor: ler("meta"),
      pa: ler("pa"),
      ticketMedio: ler("ticketMedio"),
      bs: ler("bs"),
      oportunidades: ler("oportunidades"),
      boletos: ler("boletos"),
      conversao: ler("conversao"),
      calcados: ler("calcados"),
      bolsas: ler("bolsas"),
      cintos: ler("cintos"),
      carteiras: ler("carteiras"),
      meias: ler("meias"),
      kitCuidado: ler("kitCuidado"),
      total: ler("total"),
    };

    if (registro.nomeNormalizado === MARCA_DE_SUBTOTAL) {
      blocoAtual.subtotal = registro;
      continue;
    }

    blocoAtual.vendedores.push(registro);
  }

  if (blocos.length === 0) {
    throw new RelatorioInvalido(
      "Não encontrei nenhum bloco de loja neste arquivo.",
      ["Achei o cabeçalho, mas nenhuma linha abaixo dele tinha loja e vendedor."],
    );
  }

  return { aba: nomeDaAba, linhaDoCabecalho: indiceDoCabecalho + 1, blocos };
}

/** A conversão do relatório vem em pontos percentuais; a meta, em fração. */
export function conversaoEmFracao(comoVeioNoRelatorio: number): number {
  return comoVeioNoRelatorio / 100;
}

/**
 * Soma dos vendedores de um bloco, para conferir contra a linha "Subtotal".
 * Só somamos o que é somável: P.A. e Conversão são razões e não entram.
 */
export function somarBloco(bloco: BlocoDeLoja) {
  const zerado = {
    valor: 0,
    baseComissao: 0,
    metaValor: 0,
    oportunidades: 0,
    boletos: 0,
    calcados: 0,
    bolsas: 0,
    cintos: 0,
    carteiras: 0,
    meias: 0,
    kitCuidado: 0,
    total: 0,
  };

  return bloco.vendedores.reduce((soma, linha) => {
    for (const chave of Object.keys(zerado) as (keyof typeof zerado)[]) {
      soma[chave] += linha[chave];
    }
    return soma;
  }, zerado);
}
