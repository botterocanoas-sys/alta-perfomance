"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { gravarCookieDeSessao } from "@/lib/sessao-cookie";
import { autenticar, limparSessoesVencidas } from "@/lib/sessao";

const Credenciais = z.object({
  username: z.string().trim().min(1, "Informe o usuário."),
  senha: z.string().min(1, "Informe a senha."),
});

export type EstadoDoLogin = { erro: string | null };

export async function entrar(
  _anterior: EstadoDoLogin,
  formulario: FormData,
): Promise<EstadoDoLogin> {
  const dados = Credenciais.safeParse({
    username: formulario.get("username"),
    senha: formulario.get("senha"),
  });

  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message ?? "Preencha usuário e senha." };
  }

  const resultado = await autenticar(dados.data.username, dados.data.senha);
  if (!resultado.ok) return { erro: resultado.erro };

  await gravarCookieDeSessao(resultado.token, resultado.expiraEm);
  await limparSessoesVencidas();

  // Fora do try/catch: redirect funciona lançando uma exceção que o Next trata.
  redirect("/painel");
}
