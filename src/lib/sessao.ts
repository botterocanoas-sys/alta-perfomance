/**
 * Sessão: autenticação e ciclo de vida do token.
 *
 * Este arquivo não conhece cookies nem o Next de propósito — só banco e
 * criptografia. A ponte com o navegador fica em `sessao-cookie.ts`. A separação
 * existe para que estas regras possam ser testadas direto, sem subir o app.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Papel } from "@prisma/client";

import { prisma } from "@/lib/db";
import { senhaConfere } from "@/lib/senha";

/** Quanto tempo a sessão dura sem precisar entrar de novo. */
const DURACAO_EM_DIAS = 7;

/**
 * O que o resto do app sabe sobre quem está logado.
 * `lojaIdDoUsuario` é nulo para o admin, que enxerga as três lojas.
 */
export type SessaoAtiva = {
  usuarioId: string;
  username: string;
  nome: string;
  papel: Papel;
  lojaIdDoUsuario: string | null;
};

/**
 * O cookie guarda um token aleatório; o banco guarda apenas o hash dele.
 * Assim, quem conseguir ler a tabela de sessões não consegue se passar por
 * ninguém — precisaria do token original, que só existe no navegador.
 */
function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function novoToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Comparação de tempo constante, para não vazar informação pelo relógio. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type ResultadoDeLogin =
  | { ok: true; token: string; expiraEm: Date }
  | { ok: false; erro: string };

/**
 * Confere usuário e senha e abre uma sessão.
 *
 * A mensagem de erro é sempre a mesma para usuário inexistente, senha errada e
 * usuário desativado: dizer "esse usuário não existe" entregaria de graça quais
 * logins são válidos.
 */
export async function autenticar(
  username: string,
  senha: string,
): Promise<ResultadoDeLogin> {
  const ERRO_GENERICO = "Usuário ou senha incorretos.";

  const usuario = await prisma.usuario.findUnique({
    where: { username: username.trim().toLowerCase() },
  });

  if (!usuario || !usuario.ativo) {
    // Gasta o mesmo tempo de um login válido, para que a resposta não denuncie
    // pelo relógio se o usuário existe.
    await senhaConfere(
      "$argon2id$v=19$m=19456,t=2,p=1$c2FsZ3Vpbmhvc2FsZ2E$0000000000000000000000000000000000000000000",
      senha,
    );
    return { ok: false, erro: ERRO_GENERICO };
  }

  if (!(await senhaConfere(usuario.senhaHash, senha))) {
    return { ok: false, erro: ERRO_GENERICO };
  }

  const token = novoToken();
  const expiraEm = new Date(Date.now() + DURACAO_EM_DIAS * 24 * 60 * 60 * 1000);

  await prisma.sessao.create({
    data: { id: hashDoToken(token), usuarioId: usuario.id, expiraEm },
  });

  return { ok: true, token, expiraEm };
}

/** Lê a sessão a partir de um token, sem depender de cookies (usado nos testes). */
export async function sessaoPeloToken(token: string): Promise<SessaoAtiva | null> {
  if (!token) return null;

  const sessao = await prisma.sessao.findUnique({
    where: { id: hashDoToken(token) },
    include: { usuario: true },
  });

  if (!sessao) return null;

  if (sessao.expiraEm.getTime() <= Date.now() || !sessao.usuario.ativo) {
    await prisma.sessao.delete({ where: { id: sessao.id } }).catch(() => {});
    return null;
  }

  // Confirma que o registro encontrado é mesmo o do token apresentado.
  if (!iguaisEmTempoConstante(sessao.id, hashDoToken(token))) return null;

  return {
    usuarioId: sessao.usuario.id,
    username: sessao.usuario.username,
    nome: sessao.usuario.nome,
    papel: sessao.usuario.papel,
    lojaIdDoUsuario: sessao.usuario.lojaId,
  };
}

export async function encerrarSessao(token: string): Promise<void> {
  if (!token) return;
  await prisma.sessao.delete({ where: { id: hashDoToken(token) } }).catch(() => {});
}

/** Apaga sessões vencidas. Chamado a cada login, para a tabela não crescer à toa. */
export async function limparSessoesVencidas(): Promise<void> {
  await prisma.sessao.deleteMany({ where: { expiraEm: { lte: new Date() } } });
}
