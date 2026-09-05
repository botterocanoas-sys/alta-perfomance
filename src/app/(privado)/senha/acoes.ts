"use server";

import { definirSenhaDeOutro, trocarSenha } from "@/lib/sessao";
import { sessaoAtual, tokenDaRequisicao } from "@/lib/sessao-cookie";

export type EstadoDaSenha = { erro: string | null; feito: boolean };

export async function alterarMinhaSenha(
  _anterior: EstadoDaSenha,
  formulario: FormData,
): Promise<EstadoDaSenha> {
  const sessao = await sessaoAtual();
  const token = await tokenDaRequisicao();
  if (!sessao || !token) return { erro: "Sua sessão expirou. Entre de novo.", feito: false };

  const resultado = await trocarSenha({
    usuarioId: sessao.usuarioId,
    senhaAtual: String(formulario.get("senhaAtual") ?? ""),
    senhaNova: String(formulario.get("senhaNova") ?? ""),
    repeticao: String(formulario.get("repeticao") ?? ""),
    tokenAtual: token,
  });

  if (!resultado.ok) return { erro: resultado.erro, feito: false };
  return { erro: null, feito: true };
}

export type EstadoDaRedefinicao = { erro: string | null; feito: string | null };

/**
 * O admin define a senha de outra pessoa. O id do alvo vem do formulário, mas
 * quem manda é a sessão: se quem chama não for admin, a ação recusa — o campo
 * escondido não dá poder nenhum a ninguém.
 */
export async function redefinirSenhaDeOutro(
  _anterior: EstadoDaRedefinicao,
  formulario: FormData,
): Promise<EstadoDaRedefinicao> {
  const sessao = await sessaoAtual();
  if (!sessao) return { erro: "Sua sessão expirou. Entre de novo.", feito: null };

  const resultado = await definirSenhaDeOutro({
    adminId: sessao.usuarioId,
    alvoUsuarioId: String(formulario.get("alvoUsuarioId") ?? ""),
    senhaNova: String(formulario.get("senhaNova") ?? ""),
    repeticao: String(formulario.get("repeticao") ?? ""),
  });

  if (!resultado.ok) return { erro: resultado.erro, feito: null };

  const nome = String(formulario.get("alvoNome") ?? "essa pessoa");
  return {
    erro: null,
    feito: `Senha de ${nome} definida. Avise a senha nova pessoalmente e peça para ela trocar em seguida.`,
  };
}
