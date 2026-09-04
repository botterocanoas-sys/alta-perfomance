import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { gerarHashDeSenha, senhaConfere } from "@/lib/senha";
import {
  autenticar,
  encerrarSessao,
  limparSessoesVencidas,
  sessaoPeloToken,
} from "@/lib/sessao";
import { normalizar } from "@/lib/texto";

describe("senha", () => {
  it("guarda um hash, nunca a senha em texto puro", async () => {
    const hash = await gerarHashDeSenha("barra123");
    expect(hash).not.toContain("barra123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("confere a senha certa e recusa a errada", async () => {
    const hash = await gerarHashDeSenha("barra123");
    expect(await senhaConfere(hash, "barra123")).toBe(true);
    expect(await senhaConfere(hash, "barra124")).toBe(false);
    expect(await senhaConfere(hash, "")).toBe(false);
  });

  it("dois hashes da mesma senha são diferentes", async () => {
    // Cada hash usa um sal próprio: senhas iguais não se denunciam no banco.
    expect(await gerarHashDeSenha("igual")).not.toBe(await gerarHashDeSenha("igual"));
  });

  it("um hash corrompido é senha errada, não queda do login", async () => {
    expect(await senhaConfere("isto-não-é-um-hash", "qualquer")).toBe(false);
  });
});

describe("nenhuma senha do seed foi gravada em texto puro", () => {
  it("os quatro usuários têm hash argon2id", async () => {
    const usuarios = await prisma.usuario.findMany();
    expect(usuarios).toHaveLength(4);

    for (const usuario of usuarios) {
      expect(usuario.senhaHash.startsWith("$argon2id$")).toBe(true);
      expect(usuario.senhaHash).not.toContain("123");
    }
  });
});

describe("login", () => {
  it("abre sessão com usuário e senha corretos", async () => {
    const resultado = await autenticar("gerentebarra", "barra123");
    expect(resultado.ok).toBe(true);

    if (!resultado.ok) return;
    const sessao = await sessaoPeloToken(resultado.token);
    expect(sessao?.username).toBe("gerentebarra");
    expect(sessao?.papel).toBe("GERENTE");
    expect(sessao?.lojaIdDoUsuario).not.toBeNull();
  });

  it("aceita o usuário digitado com maiúsculas ou espaço sobrando", async () => {
    const resultado = await autenticar("  GerenteBarra  ", "barra123");
    expect(resultado.ok).toBe(true);
  });

  it("recusa a senha errada", async () => {
    const resultado = await autenticar("gerentebarra", "senha-errada");
    expect(resultado.ok).toBe(false);
  });

  it("dá a mesma resposta para senha errada e usuário inexistente", async () => {
    // Mensagens diferentes entregariam quais logins existem.
    const senhaErrada = await autenticar("gerentebarra", "nao-e-essa");
    const naoExiste = await autenticar("ninguem", "nao-e-essa");

    expect(senhaErrada.ok).toBe(false);
    expect(naoExiste.ok).toBe(false);
    if (senhaErrada.ok || naoExiste.ok) return;
    expect(senhaErrada.erro).toBe(naoExiste.erro);
  });

  it("recusa usuário desativado", async () => {
    await prisma.usuario.update({ where: { username: "gerentepark" }, data: { ativo: false } });
    try {
      expect((await autenticar("gerentepark", "park123")).ok).toBe(false);
    } finally {
      await prisma.usuario.update({ where: { username: "gerentepark" }, data: { ativo: true } });
    }
  });

  it("o admin não fica preso a nenhuma loja", async () => {
    const resultado = await autenticar("admin", "trocarsenha123");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const sessao = await sessaoPeloToken(resultado.token);
    expect(sessao?.papel).toBe("ADMIN");
    expect(sessao?.lojaIdDoUsuario).toBeNull();
  });
});

describe("token de sessão", () => {
  it("o banco guarda só o hash do token, nunca o token", async () => {
    const resultado = await autenticar("gerentepadre", "padre123");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const guardadas = await prisma.sessao.findMany({ select: { id: true } });
    expect(guardadas.some((s) => s.id === resultado.token)).toBe(false);
  });

  it("um token inventado não abre sessão", async () => {
    expect(await sessaoPeloToken("token-que-eu-inventei")).toBeNull();
    expect(await sessaoPeloToken("")).toBeNull();
  });

  it("sair invalida o token na hora", async () => {
    const resultado = await autenticar("gerentepadre", "padre123");
    if (!resultado.ok) throw new Error("login falhou");

    expect(await sessaoPeloToken(resultado.token)).not.toBeNull();
    await encerrarSessao(resultado.token);
    expect(await sessaoPeloToken(resultado.token)).toBeNull();
  });

  it("um token vencido não abre sessão e é descartado", async () => {
    const resultado = await autenticar("gerentepadre", "padre123");
    if (!resultado.ok) throw new Error("login falhou");

    const sessaoAberta = await sessaoPeloToken(resultado.token);
    expect(sessaoAberta).not.toBeNull();

    await prisma.sessao.updateMany({
      where: { usuarioId: sessaoAberta!.usuarioId },
      data: { expiraEm: new Date(Date.now() - 1000) },
    });

    expect(await sessaoPeloToken(resultado.token)).toBeNull();
  });

  it("a limpeza remove as sessões vencidas e mantém as válidas", async () => {
    const valida = await autenticar("gerentebarra", "barra123");
    if (!valida.ok) throw new Error("login falhou");

    const vencida = await autenticar("gerentepark", "park123");
    if (!vencida.ok) throw new Error("login falhou");
    const sessaoVencida = await sessaoPeloToken(vencida.token);
    await prisma.sessao.updateMany({
      where: { usuarioId: sessaoVencida!.usuarioId },
      data: { expiraEm: new Date(Date.now() - 1000) },
    });

    await limparSessoesVencidas();

    expect(await sessaoPeloToken(valida.token)).not.toBeNull();
    expect(await sessaoPeloToken(vencida.token)).toBeNull();
  });
});

describe("normalização de texto do relatório", () => {
  it("tira acento, espaço sobrando e diferença de maiúsculas", () => {
    expect(normalizar("Verônica")).toBe("VERONICA");
    expect(normalizar("  Simão Vitor  ")).toBe("SIMAO VITOR");
    expect(normalizar("ANA  CAROLINA")).toBe("ANA CAROLINA");
  });

  it("resolve o espaço na frente do nome da Barra no relatório", () => {
    // A célula vem literalmente com espaço na frente no arquivo real.
    expect(normalizar(" PORTO A. - RS - BARRA SHOPPING")).toBe(
      normalizar("PORTO A. - RS - BARRA SHOPPING"),
    );
  });

  it("as três chaves de loja do seed batem com o texto do relatório", async () => {
    const doRelatorio = [
      "PORTO A. - RS - PADRE CHAGAS",
      "CANOAS - RS - PARK SHOPPING",
      " PORTO A. - RS - BARRA SHOPPING",
    ];

    for (const texto of doRelatorio) {
      const loja = await prisma.loja.findUnique({ where: { chaveRelatorio: normalizar(texto) } });
      expect(loja, `não reconheci o bloco "${texto}"`).not.toBeNull();
    }
  });
});
