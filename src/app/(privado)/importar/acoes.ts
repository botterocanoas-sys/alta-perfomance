"use server";

import { revalidatePath } from "next/cache";

import { diaEmPortoAlegre } from "@/lib/data";
import { exigirAdmin } from "@/lib/escopo";
import { RelatorioInvalido } from "@/lib/relatorio/parser";
import { confirmarImportacao, montarPrevia, type Previa } from "@/lib/relatorio/importar";
import { sessaoAtual } from "@/lib/sessao-cookie";

const TAMANHO_MAXIMO = 8 * 1024 * 1024;

export type EstadoDaImportacao =
  | { fase: "inicio"; erro?: string; detalhes?: string[] }
  | { fase: "previa"; previa: Previa }
  | { fase: "gravado"; resumo: { linhas: number; vendedorasCriadas: number; dias: number; data: Date } };

function falha(erro: string, detalhes: string[] = []): EstadoDaImportacao {
  return { fase: "inicio", erro, detalhes };
}

type ArquivoLido =
  | { ok: true; nome: string; conteudo: Buffer }
  | { ok: false; erro: string };

async function lerArquivo(formulario: FormData): Promise<ArquivoLido> {
  const arquivo = formulario.get("arquivo");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Escolha o arquivo .xlsx do relatório." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erro: "O arquivo passa de 8 MB. Confira se é mesmo o relatório." };
  }
  if (!arquivo.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, erro: "O arquivo precisa ser .xlsx, exportado do sistema da loja." };
  }

  return { ok: true, nome: arquivo.name, conteudo: Buffer.from(await arquivo.arrayBuffer()) };
}

function lerData(formulario: FormData): Date {
  const texto = formulario.get("data");
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return diaEmPortoAlegre();
  }
  return new Date(`${texto}T00:00:00.000Z`);
}

/** Passo 1: lê e confere o arquivo, sem gravar nada. */
export async function previsualizar(
  _anterior: EstadoDaImportacao,
  formulario: FormData,
): Promise<EstadoDaImportacao> {
  const sessao = await sessaoAtual();
  if (!sessao) return falha("Sua sessão expirou. Entre de novo.");

  try {
    exigirAdmin(sessao);
  } catch {
    return falha("Apenas o administrador importa o relatório.");
  }

  const arquivo = await lerArquivo(formulario);
  if (!arquivo.ok) return falha(arquivo.erro);

  try {
    const previa = await montarPrevia(arquivo.conteudo, arquivo.nome, lerData(formulario));
    return { fase: "previa", previa };
  } catch (erro) {
    if (erro instanceof RelatorioInvalido) return falha(erro.message, erro.detalhes);
    return falha("Não consegui ler este arquivo. Confira se é o .xlsx exportado do sistema.");
  }
}

/** Passo 2: grava tudo de uma vez, depois de o admin conferir a prévia. */
export async function confirmar(
  _anterior: EstadoDaImportacao,
  formulario: FormData,
): Promise<EstadoDaImportacao> {
  const sessao = await sessaoAtual();
  if (!sessao) return falha("Sua sessão expirou. Entre de novo.");

  try {
    exigirAdmin(sessao);
  } catch {
    return falha("Apenas o administrador importa o relatório.");
  }

  const arquivo = await lerArquivo(formulario);
  if (!arquivo.ok) return falha(arquivo.erro);

  const dataReferencia = lerData(formulario);
  const nomesAutorizados = formulario.getAll("nomeNovo").filter((v): v is string => typeof v === "string");

  try {
    const resultado = await confirmarImportacao({
      conteudo: arquivo.conteudo,
      arquivoNome: arquivo.nome,
      dataReferencia,
      usuarioId: sessao.usuarioId,
      nomesAutorizados,
    });

    revalidatePath("/painel");
    revalidatePath("/conferencia");

    return {
      fase: "gravado",
      resumo: {
        linhas: resultado.linhasGravadas,
        vendedorasCriadas: resultado.vendedorasCriadas,
        dias: resultado.diasRecalculados,
        data: dataReferencia,
      },
    };
  } catch (erro) {
    if (erro instanceof RelatorioInvalido) return falha(erro.message, erro.detalhes);
    return falha("Não consegui gravar a importação. Nada foi alterado.");
  }
}
