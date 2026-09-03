import "server-only";

import { cookies } from "next/headers";

import { sessaoPeloToken, type SessaoAtiva } from "@/lib/sessao";

/**
 * Ponte entre a sessão e o navegador.
 *
 * Separado de `sessao.ts` porque só isto depende do Next: assim a lógica de
 * autenticação continua testável sem subir o servidor.
 */

export const NOME_DO_COOKIE = "alta_sessao";

export async function gravarCookieDeSessao(token: string, expiraEm: Date): Promise<void> {
  const jar = await cookies();
  jar.set(NOME_DO_COOKIE, token, {
    httpOnly: true, // fora do alcance de qualquer JavaScript da página
    sameSite: "lax", // não viaja em requisição vinda de outro site
    secure: process.env.NODE_ENV === "production", // só por HTTPS no ar
    path: "/",
    expires: expiraEm,
  });
}

export async function apagarCookieDeSessao(): Promise<void> {
  const jar = await cookies();
  jar.delete(NOME_DO_COOKIE);
}

export async function tokenDaRequisicao(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(NOME_DO_COOKIE)?.value ?? null;
}

/** A sessão de quem está pedindo a página agora, ou nulo se não houver. */
export async function sessaoAtual(): Promise<SessaoAtiva | null> {
  const token = await tokenDaRequisicao();
  if (!token) return null;
  return sessaoPeloToken(token);
}
