"use server";

import { redirect } from "next/navigation";

import { apagarCookieDeSessao, tokenDaRequisicao } from "@/lib/sessao-cookie";
import { encerrarSessao } from "@/lib/sessao";

export async function sair() {
  const token = await tokenDaRequisicao();

  // Apaga a sessão no banco também: o cookie sumir do navegador não basta se
  // alguém já copiou o token.
  if (token) await encerrarSessao(token);
  await apagarCookieDeSessao();

  redirect("/entrar");
}
