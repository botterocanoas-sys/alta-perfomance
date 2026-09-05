"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recalcularApuracao } from "@/lib/apuracao";
import { diaEmPortoAlegre, mesDe } from "@/lib/data";
import { prisma } from "@/lib/db";
import { AcessoNegado, exigirAcessoALoja, exigirAcessoAVendedora } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";
import { normalizar } from "@/lib/texto";

/**
 * Gerenciar vendedoras (seção 8.6 do brief).
 *
 * Toda mudança aqui mexe em quem entra no rateio das metas e nos totais da
 * loja, então cada ação recalcula o mês inteiro — não adianta corrigir o
 * cadastro e deixar a pontuação velha para trás.
 */

export type EstadoDasVendedoras = { erro: string | null; feito: string | null };

const VAZIO: EstadoDasVendedoras = { erro: null, feito: null };

async function recalcularLoja(lojaId: string) {
  await recalcularApuracao(prisma, mesDe(diaEmPortoAlegre()), [lojaId]);
  revalidatePath("/vendedoras");
  revalidatePath("/painel");
  revalidatePath("/pontos");
}

async function comAcesso<T>(
  acao: (sessao: NonNullable<Awaited<ReturnType<typeof sessaoAtual>>>) => Promise<T>,
): Promise<T | EstadoDasVendedoras> {
  const sessao = await sessaoAtual();
  if (!sessao) return { ...VAZIO, erro: "Sua sessão expirou. Entre de novo." };

  try {
    return await acao(sessao);
  } catch (erro) {
    if (erro instanceof AcessoNegado) return { ...VAZIO, erro: erro.message };
    throw erro;
  }
}

const Criar = z.object({
  lojaId: z.string().uuid(),
  nome: z.string().trim().min(2, "O nome precisa ter ao menos duas letras.").max(80),
});

export async function criarVendedora(
  _anterior: EstadoDasVendedoras,
  formulario: FormData,
): Promise<EstadoDasVendedoras> {
  return (await comAcesso(async (sessao) => {
    const dados = Criar.safeParse({
      lojaId: formulario.get("lojaId"),
      nome: formulario.get("nome"),
    });
    if (!dados.success) {
      return { ...VAZIO, erro: dados.error.issues[0]?.message ?? "Nome inválido." };
    }

    await exigirAcessoALoja(sessao, dados.data.lojaId);
    const nome = normalizar(dados.data.nome);

    const jaExiste = await prisma.vendedora.findUnique({
      where: { lojaId_nome: { lojaId: dados.data.lojaId, nome } },
    });
    if (jaExiste) {
      return { ...VAZIO, erro: `Já existe uma ${nome} nesta loja.` };
    }

    await prisma.vendedora.create({
      data: { lojaId: dados.data.lojaId, nome, ativaDesde: diaEmPortoAlegre() },
    });

    // O nome do relatório costuma ser o mesmo; o apelido é criado na primeira
    // importação em que ela aparecer, com a confirmação na prévia.
    await recalcularLoja(dados.data.lojaId);

    return { ...VAZIO, feito: `${nome} cadastrada.` };
  })) as EstadoDasVendedoras;
}

const Alterar = z.object({
  vendedoraId: z.string().uuid(),
  nome: z.string().trim().min(2).max(80).optional(),
});

/**
 * Lê uma caixa de seleção sem depender da ordem dos campos no formulário.
 *
 * Caixa desmarcada não é enviada pelo navegador, então cada uma vem
 * acompanhada de um campo escondido com "nao". Perguntar se "sim" está entre os
 * valores enviados é o que torna a leitura independente de qual veio primeiro.
 */
function marcada(formulario: FormData, campo: string): boolean | undefined {
  const valores = formulario.getAll(campo).map(String);
  if (valores.length === 0) return undefined;
  return valores.includes("sim");
}

export async function alterarVendedora(
  _anterior: EstadoDasVendedoras,
  formulario: FormData,
): Promise<EstadoDasVendedoras> {
  return (await comAcesso(async (sessao) => {
    const dados = Alterar.safeParse({
      vendedoraId: formulario.get("vendedoraId"),
      nome: formulario.get("nome") || undefined,
    });
    if (!dados.success) return { ...VAZIO, erro: "Não consegui ler o formulário." };

    // O id vem do formulário: sem esta checagem, dava para editar a vendedora
    // de outra loja.
    const vendedora = await exigirAcessoAVendedora(sessao, dados.data.vendedoraId);

    const mudancas: {
      nome?: string;
      contaComoVendedora?: boolean;
      recebeBonusVendedora?: boolean;
      arquivadaEm?: Date | null;
    } = {};

    if (dados.data.nome) {
      const nome = normalizar(dados.data.nome);
      if (nome !== vendedora.nome) {
        const conflito = await prisma.vendedora.findUnique({
          where: { lojaId_nome: { lojaId: vendedora.lojaId, nome } },
        });
        if (conflito) return { ...VAZIO, erro: `Já existe uma ${nome} nesta loja.` };
        mudancas.nome = nome;
      }
    }

    const conta = marcada(formulario, "contaComoVendedora");
    if (conta !== undefined && conta !== vendedora.contaComoVendedora) {
      mudancas.contaComoVendedora = conta;
    }

    const recebe = marcada(formulario, "recebeBonusVendedora");
    if (recebe !== undefined && recebe !== vendedora.recebeBonusVendedora) {
      mudancas.recebeBonusVendedora = recebe;
    }

    const arquivar = marcada(formulario, "arquivada");
    if (arquivar !== undefined && arquivar !== (vendedora.arquivadaEm !== null)) {
      mudancas.arquivadaEm = arquivar ? diaEmPortoAlegre() : null;
    }

    if (Object.keys(mudancas).length === 0) {
      return { ...VAZIO, erro: "Nada mudou." };
    }

    await prisma.vendedora.update({ where: { id: vendedora.id }, data: mudancas });
    await recalcularLoja(vendedora.lojaId);

    return { ...VAZIO, feito: `${mudancas.nome ?? vendedora.nome} atualizada.` };
  })) as EstadoDasVendedoras;
}
