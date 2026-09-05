"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recalcularApuracao } from "@/lib/apuracao";
import { mesDe } from "@/lib/data";
import { prisma } from "@/lib/db";
import { AcessoNegado, exigirAcessoALoja } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

/**
 * Lançamento do CRM do dia.
 *
 * A gerente digita a QUANTIDADE de vendas influenciadas pelo CRM. O app é que
 * divide pelos boletos e compara com a meta de 0,20 — ela nunca digita 0,20.
 */

const Lancamento = z.object({
  lojaId: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type EstadoDoCrm = {
  erro: string | null;
  salvos: number | null;
};

export async function salvarCrm(
  _anterior: EstadoDoCrm,
  formulario: FormData,
): Promise<EstadoDoCrm> {
  const sessao = await sessaoAtual();
  if (!sessao) return { erro: "Sua sessão expirou. Entre de novo.", salvos: null };

  const cabecalho = Lancamento.safeParse({
    lojaId: formulario.get("lojaId"),
    data: formulario.get("data"),
  });
  if (!cabecalho.success) return { erro: "Não consegui ler o formulário.", salvos: null };

  // A loja vem do formulário: sem esta checagem, dava para lançar CRM na loja
  // de outra gerente.
  try {
    await exigirAcessoALoja(sessao, cabecalho.data.lojaId);
  } catch (erro) {
    if (erro instanceof AcessoNegado) {
      return { erro: "Você não tem acesso a esta loja.", salvos: null };
    }
    throw erro;
  }

  const data = new Date(`${cabecalho.data.data}T00:00:00.000Z`);

  // As vendedoras da loja, para não aceitar id de fora vindo do formulário.
  const daLoja = new Set(
    (await prisma.vendedora.findMany({
      where: { lojaId: cabecalho.data.lojaId },
      select: { id: true },
    })).map((vendedora) => vendedora.id),
  );

  const aGravar: { vendedoraId: string; quantidade: number }[] = [];

  for (const [campo, valor] of formulario.entries()) {
    if (!campo.startsWith("crm:")) continue;

    const vendedoraId = campo.slice(4);
    if (!daLoja.has(vendedoraId)) continue;

    const texto = String(valor).trim();
    if (texto === "") continue;

    const quantidade = Number(texto.replace(",", "."));
    if (!Number.isFinite(quantidade) || quantidade < 0 || !Number.isInteger(quantidade)) {
      return {
        erro: "O CRM é a quantidade de vendas influenciadas: um número inteiro, sem vírgula.",
        salvos: null,
      };
    }

    aGravar.push({ vendedoraId, quantidade });
  }

  if (aGravar.length === 0) {
    return { erro: "Preencha ao menos uma vendedora antes de salvar.", salvos: null };
  }

  await prisma.$transaction(async (tx) => {
    for (const linha of aGravar) {
      await tx.crmDiario.upsert({
        where: { vendedoraId_data: { vendedoraId: linha.vendedoraId, data } },
        update: { vendasInfluenciadas: linha.quantidade, registradoPor: sessao.usuarioId },
        create: {
          vendedoraId: linha.vendedoraId,
          data,
          vendasInfluenciadas: linha.quantidade,
          registradoPor: sessao.usuarioId,
        },
      });
    }

    // O CRM entra na pontuação: o mês inteiro é refeito, para um lançamento
    // atrasado se propagar sozinho.
    await recalcularApuracao(tx, mesDe(data), [cabecalho.data.lojaId]);
  });

  revalidatePath("/crm");
  revalidatePath("/painel");
  revalidatePath("/pontos");

  return { erro: null, salvos: aGravar.length };
}
