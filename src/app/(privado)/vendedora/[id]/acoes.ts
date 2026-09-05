"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { diaEmPortoAlegre } from "@/lib/data";
import { prisma } from "@/lib/db";
import { AcessoNegado, exigirAcessoAVendedora } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

const Registro = z.object({
  vendedoraId: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pauta: z.string().max(4000),
  acordos: z.string().max(4000),
  observacoes: z.string().max(4000),
  proximosPassos: z.string().max(4000),
});

export type EstadoDaReuniao = { erro: string | null; salvoEm: string | null };

/**
 * Salva o registro da reunião do dia.
 *
 * Uma reunião por vendedora e por data: salvar de novo atualiza a mesma, em vez
 * de empilhar duas conversas do mesmo dia.
 */
export async function salvarReuniao(
  _anterior: EstadoDaReuniao,
  formulario: FormData,
): Promise<EstadoDaReuniao> {
  const sessao = await sessaoAtual();
  if (!sessao) return { erro: "Sua sessão expirou. Entre de novo.", salvoEm: null };

  const dados = Registro.safeParse({
    vendedoraId: formulario.get("vendedoraId"),
    data: formulario.get("data"),
    pauta: formulario.get("pauta") ?? "",
    acordos: formulario.get("acordos") ?? "",
    observacoes: formulario.get("observacoes") ?? "",
    proximosPassos: formulario.get("proximosPassos") ?? "",
  });

  if (!dados.success) return { erro: "Não consegui ler o formulário.", salvoEm: null };

  // O id vem do formulário: sem esta checagem, dava para registrar reunião na
  // vendedora de outra loja.
  try {
    await exigirAcessoAVendedora(sessao, dados.data.vendedoraId);
  } catch (erro) {
    if (erro instanceof AcessoNegado) {
      return { erro: "Você não tem acesso a esta vendedora.", salvoEm: null };
    }
    throw erro;
  }

  const data = new Date(`${dados.data.data}T00:00:00.000Z`);
  const conteudo = {
    pauta: dados.data.pauta.trim(),
    acordos: dados.data.acordos.trim(),
    observacoes: dados.data.observacoes.trim(),
    proximosPassos: dados.data.proximosPassos.trim(),
  };

  const vazio = Object.values(conteudo).every((texto) => texto === "");
  if (vazio) {
    return { erro: "Escreva ao menos um campo antes de salvar.", salvoEm: null };
  }

  await prisma.reuniao.upsert({
    where: { vendedoraId_data: { vendedoraId: dados.data.vendedoraId, data } },
    update: { ...conteudo, registradoPor: sessao.usuarioId },
    create: {
      vendedoraId: dados.data.vendedoraId,
      data,
      registradoPor: sessao.usuarioId,
      ...conteudo,
    },
  });

  revalidatePath(`/vendedora/${dados.data.vendedoraId}`);

  return {
    erro: null,
    salvoEm: new Date().toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

/** A data de hoje em Porto Alegre, no formato do campo de data. */
export async function hojeParaFormulario(): Promise<string> {
  return diaEmPortoAlegre().toISOString().slice(0, 10);
}
