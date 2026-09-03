import { hash, verify } from "@node-rs/argon2";

// Parâmetros recomendados pelo OWASP para Argon2id (2024): 19 MiB de memória,
// 2 iterações, paralelismo 1. Em 4 logins por dia o custo é irrelevante, e
// deixa um vazamento do banco inútil na prática.
const OPCOES = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function gerarHashDeSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES);
}

export async function senhaConfere(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha, OPCOES);
  } catch {
    // Hash corrompido ou em formato desconhecido: trata como senha errada em
    // vez de derrubar a tela de login.
    return false;
  }
}
