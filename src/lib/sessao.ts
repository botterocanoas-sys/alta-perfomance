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
import { gerarHashDeSenha, senhaConfere } from "@/lib/senha";

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

export type ResultadoDaTrocaDeSenha = { ok: true } | { ok: false; erro: string };

/** Mínimo de caracteres da senha nova. Vale para todo mundo, admin incluído. */
export const MINIMO_DA_SENHA = 10;

/**
 * Troca a senha de quem está logado.
 *
 * Pede a senha atual mesmo já havendo sessão: é o que impede que um celular
 * deixado destravado no balcão vire uma conta tomada.
 *
 * Ao trocar, todas as outras sessões daquele usuário caem. Se a senha estava
 * comprometida, quem a estivesse usando em outro navegador continuaria dentro
 * — trocar a senha e deixar a sessão viva não resolve nada.
 */
export async function trocarSenha(entrada: {
  usuarioId: string;
  senhaAtual: string;
  senhaNova: string;
  repeticao: string;
  /** Token da sessão de quem está trocando, que é a única a sobreviver. */
  tokenAtual: string;
}): Promise<ResultadoDaTrocaDeSenha> {
  const usuario = await prisma.usuario.findUnique({ where: { id: entrada.usuarioId } });
  if (!usuario || !usuario.ativo) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };

  if (!(await senhaConfere(usuario.senhaHash, entrada.senhaAtual))) {
    return { ok: false, erro: "A senha atual não confere." };
  }

  if (entrada.senhaNova.length < MINIMO_DA_SENHA) {
    return {
      ok: false,
      erro: `A senha nova precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.`,
    };
  }

  if (entrada.senhaNova !== entrada.repeticao) {
    return { ok: false, erro: "As duas senhas novas não são iguais." };
  }

  if (await senhaConfere(usuario.senhaHash, entrada.senhaNova)) {
    return { ok: false, erro: "A senha nova é igual à antiga." };
  }

  const senhaHash = await gerarHashDeSenha(entrada.senhaNova);
  const sessaoQueFica = hashDoToken(entrada.tokenAtual);

  await prisma.$transaction([
    prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash } }),
    prisma.sessao.deleteMany({
      where: { usuarioId: usuario.id, id: { not: sessaoQueFica } },
    }),
  ]);

  return { ok: true };
}

/**
 * O admin define uma senha nova para outra pessoa.
 *
 * Existe por um motivo prático: são quatro pessoas e não há recuperação por
 * e-mail. Sem isto, gerente que esquece a senha num domingo só volta a entrar
 * se alguém abrir o banco de dados — o que é pior em todo sentido.
 *
 * Diferente da troca da própria senha, aqui caem TODAS as sessões de quem
 * recebeu a senha nova, inclusive a dela. Quem não sabia a senha antiga não
 * deve continuar dentro em aparelho nenhum.
 *
 * O admin não define a própria senha por aqui: para a dele vale a regra de
 * todo mundo, que é saber a atual.
 */
export async function definirSenhaDeOutro(entrada: {
  adminId: string;
  alvoUsuarioId: string;
  senhaNova: string;
  repeticao: string;
}): Promise<ResultadoDaTrocaDeSenha> {
  const admin = await prisma.usuario.findUnique({ where: { id: entrada.adminId } });
  if (!admin || !admin.ativo || admin.papel !== Papel.ADMIN) {
    return { ok: false, erro: "Só o administrador pode definir a senha de outra pessoa." };
  }

  if (entrada.alvoUsuarioId === entrada.adminId) {
    return { ok: false, erro: "Para trocar a sua própria senha, use o formulário acima." };
  }

  const alvo = await prisma.usuario.findUnique({ where: { id: entrada.alvoUsuarioId } });
  if (!alvo) return { ok: false, erro: "Esse usuário não existe." };

  if (entrada.senhaNova.length < MINIMO_DA_SENHA) {
    return {
      ok: false,
      erro: `A senha nova precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.`,
    };
  }

  if (entrada.senhaNova !== entrada.repeticao) {
    return { ok: false, erro: "As duas senhas novas não são iguais." };
  }

  const senhaHash = await gerarHashDeSenha(entrada.senhaNova);

  await prisma.$transaction([
    prisma.usuario.update({ where: { id: alvo.id }, data: { senhaHash } }),
    prisma.sessao.deleteMany({ where: { usuarioId: alvo.id } }),
  ]);

  return { ok: true };
}

export async function encerrarSessao(token: string): Promise<void> {
  if (!token) return;
  await prisma.sessao.delete({ where: { id: hashDoToken(token) } }).catch(() => {});
}

/** Apaga sessões vencidas. Chamado a cada login, para a tabela não crescer à toa. */
export async function limparSessoesVencidas(): Promise<void> {
  await prisma.sessao.deleteMany({ where: { expiraEm: { lte: new Date() } } });
}
