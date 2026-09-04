import { createHash } from "node:crypto";
import { Prisma, StatusImportacao } from "@prisma/client";

import { prisma } from "@/lib/db";
import { diaEmPortoAlegre, horarioDeExtracao, mesDe } from "@/lib/data";
import { normalizar } from "@/lib/texto";
import {
  lerRelatorio,
  RelatorioInvalido,
  somarBloco,
  type BlocoDeLoja,
  type LinhaDoRelatorio,
} from "./parser";
import { recalcularMes } from "./recalcular";

/**
 * Importação do relatório diário.
 *
 * Duas etapas, de propósito: `montarPrevia` lê e confere sem gravar nada, e
 * `confirmarImportacao` grava tudo de uma vez. Entre as duas, o admin vê o que
 * vai acontecer — quantas lojas, quantas vendedoras, quais nomes são novos — e
 * decide. É a exigência da seção 8.4: ou grava tudo, ou não grava nada.
 */

/** Quanto a soma das metas individuais pode divergir da meta da loja sem virar aviso. */
const TOLERANCIA_DE_META = 0.01;

export type NomeNovo = {
  lojaId: string;
  lojaNome: string;
  /** Como está escrito no arquivo. */
  nome: string;
  nomeNormalizado: string;
  metaValor: number;
  /** Quem tem meta zero não é apurada neste mês; provavelmente não é vendedora. */
  ativaNoMes: boolean;
  linhaOriginal: number;
  /** A chave que o formulário usa para confirmar a criação. */
  chave: string;
};

export type ConferenciaDeBloco = {
  campo: string;
  somado: number;
  noSubtotal: number;
  bate: boolean;
};

export type PreviaDeLoja = {
  lojaId: string;
  lojaNome: string;
  chaveNoRelatorio: string;
  linhas: number;
  ativas: number;
  inativas: number;
  nomesConhecidos: number;
  nomesNovos: number;
  conferencias: ConferenciaDeBloco[];
  metaDaLoja: { noRelatorio: number; cadastrada: number | null; diferenca: number | null } | null;
};

export type Previa = {
  arquivoNome: string;
  sha256: string;
  aba: string;
  linhaDoCabecalho: number;
  dataReferencia: Date;
  mesReferencia: Date;
  extraidoEm: Date | null;
  lojas: PreviaDeLoja[];
  nomesNovos: NomeNovo[];
  avisos: string[];
  /** Havendo qualquer erro, a importação não pode ser confirmada. */
  erros: string[];
  jaImportado: { id: string; arquivoNome: string; dataReferencia: Date } | null;
};

export function chaveDoNomeNovo(lojaId: string, nomeNormalizado: string): string {
  return `${lojaId}::${nomeNormalizado}`;
}

function arredondar(valor: number, casas = 4): number {
  return Number(valor.toFixed(casas));
}

/**
 * Lê o arquivo, casa com o cadastro e monta o retrato do que aconteceria.
 * Não grava nada. Erros aqui impedem a confirmação; avisos, não.
 */
export async function montarPrevia(
  conteudo: Buffer,
  arquivoNome: string,
  dataReferencia: Date = diaEmPortoAlegre(),
): Promise<Previa> {
  const sha256 = createHash("sha256").update(conteudo).digest("hex");
  const relatorio = lerRelatorio(conteudo);
  const mesReferencia = mesDe(dataReferencia);

  const [lojas, jaImportado] = await Promise.all([
    prisma.loja.findMany(),
    prisma.importacao.findUnique({
      where: { sha256 },
      select: { id: true, arquivoNome: true, dataReferencia: true },
    }),
  ]);

  const lojaPorChave = new Map(lojas.map((loja) => [loja.chaveRelatorio, loja]));

  const erros: string[] = [];
  const avisos: string[] = [];
  const previaDasLojas: PreviaDeLoja[] = [];
  const nomesNovos: NomeNovo[] = [];

  if (jaImportado) {
    erros.push(
      `Este arquivo já foi importado (${jaImportado.arquivoNome}, ` +
        `referente a ${jaImportado.dataReferencia.toLocaleDateString("pt-BR", { timeZone: "UTC" })}). ` +
        "Se quiser refazer, descarte a importação anterior antes.",
    );
  }

  const naoReconhecidos = relatorio.blocos.filter((bloco) => !lojaPorChave.has(bloco.chave));
  for (const bloco of naoReconhecidos) {
    erros.push(
      `Não reconheci a loja "${bloco.chaveOriginal}" (linha ${bloco.linhaOriginal}). ` +
        "Confira o cadastro das lojas.",
    );
  }

  const encontradas = new Set(relatorio.blocos.map((bloco) => bloco.chave));
  for (const loja of lojas) {
    if (!encontradas.has(loja.chaveRelatorio)) {
      avisos.push(`A loja ${loja.nome} não aparece neste arquivo.`);
    }
  }

  for (const bloco of relatorio.blocos) {
    const loja = lojaPorChave.get(bloco.chave);
    if (!loja) continue;

    const [apelidos, meta] = await Promise.all([
      prisma.vendedoraAlias.findMany({ where: { lojaId: loja.id } }),
      prisma.metaMensal.findUnique({
        where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia } },
        select: { valorLoja: true },
      }),
    ]);
    const conhecidos = new Set(apelidos.map((apelido) => apelido.nomeNoRelatorio));

    let novos = 0;
    for (const linha of bloco.vendedores) {
      if (conhecidos.has(linha.nomeNormalizado)) continue;
      novos += 1;
      nomesNovos.push({
        lojaId: loja.id,
        lojaNome: loja.nome,
        nome: linha.nome,
        nomeNormalizado: linha.nomeNormalizado,
        metaValor: linha.metaValor,
        ativaNoMes: linha.metaValor > 0,
        linhaOriginal: linha.linhaOriginal,
        chave: chaveDoNomeNovo(loja.id, linha.nomeNormalizado),
      });
    }

    const ativas = bloco.vendedores.filter((linha) => linha.metaValor > 0).length;
    const conferencias = conferirSubtotal(bloco);
    const metaDaLoja = montarConferenciaDeMeta(bloco, meta?.valorLoja ?? null);

    previaDasLojas.push({
      lojaId: loja.id,
      lojaNome: loja.nome,
      chaveNoRelatorio: bloco.chaveOriginal,
      linhas: bloco.vendedores.length,
      ativas,
      inativas: bloco.vendedores.length - ativas,
      nomesConhecidos: bloco.vendedores.length - novos,
      nomesNovos: novos,
      conferencias,
      metaDaLoja,
    });

    // A soma não bater com o Subtotal indica arquivo truncado ou lido errado.
    // Vira erro, não aviso: gravar um mês pela metade é pior do que não gravar.
    for (const conferencia of conferencias) {
      if (conferencia.bate) continue;
      erros.push(
        `Em ${loja.nome}, a soma de ${conferencia.campo} (${conferencia.somado}) não bate com ` +
          `a linha Subtotal (${conferencia.noSubtotal}). O arquivo pode estar incompleto.`,
      );
    }

    if (!meta) {
      avisos.push(
        `A loja ${loja.nome} ainda não tem metas cadastradas para este mês. ` +
          "A importação funciona, mas os pontos só serão calculados depois de você cadastrá-las.",
      );
    } else if (
      metaDaLoja.diferenca !== null &&
      Math.abs(metaDaLoja.diferenca) > TOLERANCIA_DE_META
    ) {
      avisos.push(
        `Em ${loja.nome}, a meta somada no relatório (R$ ${metaDaLoja.noRelatorio.toLocaleString("pt-BR")}) ` +
          `difere da cadastrada no app (R$ ${metaDaLoja.cadastrada!.toLocaleString("pt-BR")}). ` +
          "Confira a tela de metas do mês.",
      );
    }

    for (const linha of bloco.vendedores) {
      const somaDasCategorias =
        linha.calcados + linha.bolsas + linha.cintos + linha.carteiras + linha.meias + linha.kitCuidado;
      if (somaDasCategorias !== linha.total) {
        avisos.push(
          `${loja.nome}, linha ${linha.linhaOriginal} (${linha.nome}): a coluna Total (${linha.total}) ` +
            `não é a soma das categorias (${somaDasCategorias}). O P.A. usa a coluna Total.`,
        );
      }
    }
  }

  const semSubtotal = relatorio.blocos.filter((bloco) => !bloco.subtotal);
  for (const bloco of semSubtotal) {
    avisos.push(
      `O bloco "${bloco.chaveOriginal}" não tem linha Subtotal — não deu para conferir a soma.`,
    );
  }

  return {
    arquivoNome,
    sha256,
    aba: relatorio.aba,
    linhaDoCabecalho: relatorio.linhaDoCabecalho,
    dataReferencia,
    mesReferencia,
    extraidoEm: horarioDeExtracao(arquivoNome, dataReferencia),
    lojas: previaDasLojas,
    nomesNovos,
    avisos,
    erros,
    jaImportado,
  };
}

/** Soma dos vendedores contra a linha "Subtotal" do bloco. */
function conferirSubtotal(bloco: BlocoDeLoja): ConferenciaDeBloco[] {
  if (!bloco.subtotal) return [];

  const soma = somarBloco(bloco);
  const subtotal = bloco.subtotal;

  const campos: Array<[string, number, number]> = [
    ["Valor", arredondar(soma.valor, 2), arredondar(subtotal.valor, 2)],
    ["Oportunidades", soma.oportunidades, subtotal.oportunidades],
    ["Boletos", soma.boletos, subtotal.boletos],
    ["Calçados", soma.calcados, subtotal.calcados],
    ["Bolsas", soma.bolsas, subtotal.bolsas],
    ["Total de peças", soma.total, subtotal.total],
  ];

  return campos.map(([campo, somado, noSubtotal]) => ({
    campo,
    somado,
    noSubtotal,
    bate: Math.abs(somado - noSubtotal) < 0.01,
  }));
}

/**
 * A linha "Subtotal" traz a meta da loja. Comparar com a meta cadastrada pega
 * um desencontro entre o sistema da loja e o cadastro do app antes de ele virar
 * pontuação errada.
 */
function montarConferenciaDeMeta(bloco: BlocoDeLoja, cadastrada: Prisma.Decimal | null) {
  const noRelatorio = bloco.subtotal
    ? bloco.subtotal.metaValor
    : somarBloco(bloco).metaValor;

  if (!cadastrada) return { noRelatorio, cadastrada: null, diferenca: null };

  const valorCadastrado = cadastrada.toNumber();
  if (valorCadastrado === 0) return { noRelatorio, cadastrada: 0, diferenca: null };

  return {
    noRelatorio,
    cadastrada: valorCadastrado,
    diferenca: (noRelatorio - valorCadastrado) / valorCadastrado,
  };
}

export type ResultadoDaImportacao = {
  importacaoId: string;
  linhasGravadas: number;
  vendedorasCriadas: number;
  diasRecalculados: number;
};

/**
 * Grava a importação inteira, numa transação só.
 *
 * O arquivo é lido de novo aqui: a prévia serviu para o admin decidir, não como
 * fonte de dados. Confiar no que voltou da tela deixaria a gravação à mercê do
 * que o navegador mandou.
 */
export async function confirmarImportacao(entrada: {
  conteudo: Buffer;
  arquivoNome: string;
  dataReferencia: Date;
  usuarioId: string;
  /** Chaves de `NomeNovo.chave` que o admin autorizou criar. */
  nomesAutorizados: string[];
}): Promise<ResultadoDaImportacao> {
  const previa = await montarPrevia(entrada.conteudo, entrada.arquivoNome, entrada.dataReferencia);

  if (previa.erros.length > 0) {
    throw new RelatorioInvalido("A importação não pode ser confirmada.", previa.erros);
  }

  const autorizados = new Set(entrada.nomesAutorizados);
  const naoAutorizados = previa.nomesNovos.filter((novo) => !autorizados.has(novo.chave));
  if (naoAutorizados.length > 0) {
    throw new RelatorioInvalido(
      `${naoAutorizados.length} ${naoAutorizados.length === 1 ? "nome novo precisa" : "nomes novos precisam"} de confirmação.`,
      naoAutorizados.map((novo) => `${novo.nome} (${novo.lojaNome}, linha ${novo.linhaOriginal})`),
    );
  }

  const relatorio = lerRelatorio(entrada.conteudo);
  const lojas = await prisma.loja.findMany();
  const lojaPorChave = new Map(lojas.map((loja) => [loja.chaveRelatorio, loja]));

  return prisma.$transaction(
    async (tx) => {
      const importacao = await tx.importacao.create({
        data: {
          arquivoNome: entrada.arquivoNome,
          sha256: previa.sha256,
          dataReferencia: entrada.dataReferencia,
          extraidoEm: previa.extraidoEm,
          importadoPor: entrada.usuarioId,
          status: StatusImportacao.CONFIRMADA,
        },
      });

      let vendedorasCriadas = 0;
      const linhas: Prisma.AcumuladoImportadoCreateManyInput[] = [];
      const lojasTocadas = new Set<string>();

      for (const bloco of relatorio.blocos) {
        const loja = lojaPorChave.get(bloco.chave);
        if (!loja) continue;
        lojasTocadas.add(loja.id);

        for (const linha of bloco.vendedores) {
          const vendedoraId = await acharOuCriarVendedora(tx, loja.id, linha, entrada.dataReferencia);
          if (vendedoraId.criada) vendedorasCriadas += 1;

          linhas.push({
            importacaoId: importacao.id,
            lojaId: loja.id,
            vendedoraId: vendedoraId.id,
            linhaOriginal: linha.linhaOriginal,
            valor: new Prisma.Decimal(linha.valor.toFixed(4)),
            baseComissao: new Prisma.Decimal(linha.baseComissao.toFixed(4)),
            metaValor: new Prisma.Decimal(linha.metaValor.toFixed(2)),
            pa: new Prisma.Decimal(linha.pa.toFixed(4)),
            ticketMedio: new Prisma.Decimal(linha.ticketMedio.toFixed(4)),
            bs: new Prisma.Decimal(linha.bs.toFixed(4)),
            oportunidades: Math.round(linha.oportunidades),
            boletos: Math.round(linha.boletos),
            conversao: new Prisma.Decimal(linha.conversao.toFixed(4)),
            calcados: Math.round(linha.calcados),
            bolsas: Math.round(linha.bolsas),
            cintos: Math.round(linha.cintos),
            carteiras: Math.round(linha.carteiras),
            meias: Math.round(linha.meias),
            kitCuidado: Math.round(linha.kitCuidado),
            total: Math.round(linha.total),
          });
        }
      }

      await tx.acumuladoImportado.createMany({ data: linhas });

      const recalculo = await recalcularMes(tx, previa.mesReferencia, [...lojasTocadas]);

      return {
        importacaoId: importacao.id,
        linhasGravadas: linhas.length,
        vendedorasCriadas,
        diasRecalculados: recalculo.diasCalculados,
      };
    },
    { timeout: 30_000 },
  );
}

/**
 * Casa o nome do relatório com uma vendedora já cadastrada, pelo apelido.
 * Não achando, cria — a autorização do admin já foi conferida antes.
 *
 * O nome é guardado normalizado no cadastro e o apelido preserva a grafia do
 * relatório, para que "VERÔNICA" e "VERONICA" continuem sendo a mesma pessoa.
 */
async function acharOuCriarVendedora(
  tx: Prisma.TransactionClient,
  lojaId: string,
  linha: LinhaDoRelatorio,
  dataReferencia: Date,
): Promise<{ id: string; criada: boolean }> {
  const apelido = await tx.vendedoraAlias.findUnique({
    where: { lojaId_nomeNoRelatorio: { lojaId, nomeNoRelatorio: linha.nomeNormalizado } },
    select: { vendedoraId: true },
  });
  if (apelido) return { id: apelido.vendedoraId, criada: false };

  const nome = normalizar(linha.nome);

  // Pode existir a vendedora com esse nome e faltar só o apelido — é o caso do
  // seed, que cadastra a pessoa antes da primeira importação.
  const existente = await tx.vendedora.findUnique({
    where: { lojaId_nome: { lojaId, nome } },
    select: { id: true },
  });

  const vendedora =
    existente ??
    (await tx.vendedora.create({
      data: { lojaId, nome, ativaDesde: mesDe(dataReferencia) },
      select: { id: true },
    }));

  await tx.vendedoraAlias.create({
    data: { vendedoraId: vendedora.id, lojaId, nomeNoRelatorio: linha.nomeNormalizado },
  });

  return { id: vendedora.id, criada: !existente };
}
