import { Papel } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { SessaoAtiva } from "@/lib/sessao";

/**
 * ISOLAMENTO POR LOJA
 *
 * Este arquivo é o único lugar do app autorizado a decidir quais lojas uma
 * sessão pode ler ou escrever. Nenhuma consulta pode montar um `where` com
 * `lojaId` por conta própria: toda leitura passa por `escopoDeLojas` e toda
 * escrita por `exigirAcessoALoja`.
 *
 * A regra é do servidor, não da tela. Esconder um botão não impede ninguém de
 * trocar o id na barra de endereço — e a seção 2 do brief é explícita: uma
 * consulta que devolva dado de outra loja é falha de segurança, não bug de
 * interface.
 */

/** Lançado quando a sessão tenta alcançar uma loja fora do escopo dela. */
export class AcessoNegado extends Error {
  constructor(mensagem = "Você não tem acesso a esta loja.") {
    super(mensagem);
    this.name = "AcessoNegado";
  }
}

/** Lançado quando não há sessão válida. */
export class NaoAutenticado extends Error {
  constructor(mensagem = "Faça login para continuar.") {
    super(mensagem);
    this.name = "NaoAutenticado";
  }
}

export function ehAdmin(sessao: SessaoAtiva): boolean {
  return sessao.papel === Papel.ADMIN;
}

/**
 * As lojas que esta sessão pode enxergar.
 * Gerente: exatamente uma. Admin: todas.
 */
export async function lojasPermitidas(sessao: SessaoAtiva): Promise<string[]> {
  if (ehAdmin(sessao)) {
    const lojas = await prisma.loja.findMany({ select: { id: true }, orderBy: { slug: "asc" } });
    return lojas.map((loja) => loja.id);
  }

  // Uma gerente sem loja é erro de cadastro. Devolver lista vazia é mais seguro
  // do que devolver tudo.
  return sessao.lojaIdDoUsuario ? [sessao.lojaIdDoUsuario] : [];
}

/**
 * O filtro que deve entrar em TODA consulta que tenha `lojaId`.
 *
 *   const where = { ...(await escopoDeLojas(sessao)), mesReferencia: mes };
 *
 * Para uma gerente isso vira `{ lojaId: { in: ["<id da loja dela>"] } }`; para
 * o admin, a lista das três. Uma gerente sem loja recebe uma lista vazia, que
 * no Postgres não casa com nada — o pior caso é não ver dado nenhum, nunca ver
 * dado dos outros.
 */
export async function escopoDeLojas(
  sessao: SessaoAtiva,
): Promise<{ lojaId: { in: string[] } }> {
  return { lojaId: { in: await lojasPermitidas(sessao) } };
}

/**
 * Confere que a sessão pode agir sobre uma loja específica e devolve a loja.
 * Use antes de qualquer escrita e ao abrir uma página de loja.
 *
 * @throws AcessoNegado quando a loja não está no escopo da sessão.
 */
export async function exigirAcessoALoja(sessao: SessaoAtiva, lojaId: string) {
  const permitidas = await lojasPermitidas(sessao);
  if (!permitidas.includes(lojaId)) throw new AcessoNegado();

  const loja = await prisma.loja.findUnique({ where: { id: lojaId } });
  if (!loja) throw new AcessoNegado();
  return loja;
}

/**
 * A loja que a sessão está vendo agora.
 *
 * Gerente: sempre a dela — um `lojaId` vindo da URL é ignorado, não obedecido.
 * Admin: a que ele pediu; sem pedido, a primeira em ordem alfabética.
 */
export async function lojaEmFoco(sessao: SessaoAtiva, lojaIdPedida?: string | null) {
  if (!ehAdmin(sessao)) {
    if (!sessao.lojaIdDoUsuario) throw new AcessoNegado("Sua conta não está ligada a uma loja.");
    return exigirAcessoALoja(sessao, sessao.lojaIdDoUsuario);
  }

  if (lojaIdPedida) return exigirAcessoALoja(sessao, lojaIdPedida);

  const primeira = await prisma.loja.findFirst({ orderBy: { slug: "asc" } });
  if (!primeira) throw new AcessoNegado("Nenhuma loja cadastrada.");
  return primeira;
}

/**
 * Só o admin importa o relatório diário (seção 2 do brief).
 * @throws AcessoNegado
 */
export function exigirAdmin(sessao: SessaoAtiva): void {
  if (!ehAdmin(sessao)) throw new AcessoNegado("Apenas o administrador pode fazer isso.");
}

/**
 * Confere que a sessão pode alcançar uma vendedora, pela loja dela.
 * Evita o buraco clássico: o id da vendedora vem da URL e ninguém checa de
 * que loja ela é.
 *
 * @throws AcessoNegado
 */
export async function exigirAcessoAVendedora(sessao: SessaoAtiva, vendedoraId: string) {
  const permitidas = await lojasPermitidas(sessao);

  const vendedora = await prisma.vendedora.findFirst({
    where: { id: vendedoraId, lojaId: { in: permitidas } },
    include: { loja: true },
  });

  // Mesma resposta para "não existe" e "é de outra loja": distinguir os dois
  // casos permitiria descobrir quem trabalha nas outras lojas.
  if (!vendedora) throw new AcessoNegado("Vendedora não encontrada nesta loja.");
  return vendedora;
}
