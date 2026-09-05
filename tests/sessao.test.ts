import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { gerarHashDeSenha, senhaConfere } from "@/lib/senha";
import {
  autenticar,
  definirSenhaDeOutro,
  encerrarSessao,
  limparSessoesVencidas,
  MINIMO_DA_SENHA,
  sessaoPeloToken,
  trocarSenha,
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

describe("trocar a própria senha", () => {
  /** Entra e devolve o token, para os testes desta seção. */
  async function entrar(usuario: string, senha: string) {
    const login = await autenticar(usuario, senha);
    if (!login.ok) throw new Error(`não consegui entrar como ${usuario}: ${login.erro}`);
    return login.token;
  }

  /**
   * A gerente do Park é a cobaia desta seção: nenhum outro teste depende da
   * senha dela, e cada caso devolve a original no fim.
   */
  const USUARIO = "gerentepark";
  const ORIGINAL = "park123";

  async function comSenha(senha: string) {
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { username: USUARIO } });
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash: await gerarHashDeSenha(senha) },
    });
    return usuario.id;
  }

  it("recusa quando a senha atual não confere", async () => {
    const usuarioId = await comSenha(ORIGINAL);
    const token = await entrar(USUARIO, ORIGINAL);

    const r = await trocarSenha({
      usuarioId,
      senhaAtual: "chutei",
      senhaNova: "uma senha bem longa",
      repeticao: "uma senha bem longa",
      tokenAtual: token,
    });

    expect(r).toEqual({ ok: false, erro: "A senha atual não confere." });
    // E a senha antiga continua valendo: nada foi trocado pela metade.
    expect((await autenticar(USUARIO, ORIGINAL)).ok).toBe(true);
  });

  it("recusa senha nova curta, repetição diferente e senha igual à antiga", async () => {
    const usuarioId = await comSenha(ORIGINAL);
    const token = await entrar(USUARIO, ORIGINAL);
    const base = { usuarioId, senhaAtual: ORIGINAL, tokenAtual: token };

    const curta = "a".repeat(MINIMO_DA_SENHA - 1);
    expect(
      await trocarSenha({ ...base, senhaNova: curta, repeticao: curta }),
    ).toEqual({ ok: false, erro: `A senha nova precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.` });

    expect(
      await trocarSenha({ ...base, senhaNova: "senha nova boa", repeticao: "senha nova boaa" }),
    ).toEqual({ ok: false, erro: "As duas senhas novas não são iguais." });

    // "igual à antiga" só pode ser testado com uma senha que passe no tamanho:
    // a ordem das checagens é essa mesma, e é a ordem certa.
    const LONGA = "a mesma senha de sempre";
    await comSenha(LONGA);
    expect(
      await trocarSenha({ ...base, senhaAtual: LONGA, senhaNova: LONGA, repeticao: LONGA }),
    ).toEqual({ ok: false, erro: "A senha nova é igual à antiga." });
    await comSenha(ORIGINAL);
  });

  it("troca a senha e derruba as outras sessões, menos a de quem trocou", async () => {
    const usuarioId = await comSenha(ORIGINAL);
    const noCelular = await entrar(USUARIO, ORIGINAL);
    const noComputador = await entrar(USUARIO, ORIGINAL);

    const NOVA = "meu par predileto";
    expect(
      await trocarSenha({
        usuarioId,
        senhaAtual: ORIGINAL,
        senhaNova: NOVA,
        repeticao: NOVA,
        tokenAtual: noComputador,
      }),
    ).toEqual({ ok: true });

    // A senha antiga morreu e a nova vale.
    expect((await autenticar(USUARIO, ORIGINAL)).ok).toBe(false);
    expect((await autenticar(USUARIO, NOVA)).ok).toBe(true);

    // Quem trocou continua dentro; a outra sessão caiu.
    expect(await sessaoPeloToken(noComputador)).not.toBeNull();
    expect(await sessaoPeloToken(noCelular)).toBeNull();

    await comSenha(ORIGINAL);
  });

  it("não mexe na senha de mais ninguém", async () => {
    const usuarioId = await comSenha(ORIGINAL);
    const token = await entrar(USUARIO, ORIGINAL);

    const NOVA = "outra senha longa";
    await trocarSenha({ usuarioId, senhaAtual: ORIGINAL, senhaNova: NOVA, repeticao: NOVA, tokenAtual: token });

    for (const [outro, senha] of [
      ["gerentebarra", "barra123"],
      ["gerentepadre", "padre123"],
      ["admin", "trocarsenha123"],
    ] as const) {
      expect((await autenticar(outro, senha)).ok, `${outro} deveria continuar entrando`).toBe(true);
    }

    await comSenha(ORIGINAL);
  });
});

describe("o admin define a senha de quem esqueceu", () => {
  async function idDe(username: string) {
    return (await prisma.usuario.findUniqueOrThrow({ where: { username } })).id;
  }

  async function comSenha(username: string, senha: string) {
    await prisma.usuario.update({
      where: { username },
      data: { senhaHash: await gerarHashDeSenha(senha) },
    });
  }

  it("gerente não define a senha de ninguém, nem a de outra gerente", async () => {
    const gerente = await idDe("gerentebarra");
    const outra = await idDe("gerentepadre");

    const r = await definirSenhaDeOutro({
      adminId: gerente,
      alvoUsuarioId: outra,
      senhaNova: "senha nova longa",
      repeticao: "senha nova longa",
    });

    expect(r).toEqual({
      ok: false,
      erro: "Só o administrador pode definir a senha de outra pessoa.",
    });
    // E a senha da outra continua a mesma.
    expect((await autenticar("gerentepadre", "padre123")).ok).toBe(true);
  });

  it("o admin não usa este caminho para a própria senha", async () => {
    const admin = await idDe("admin");
    const r = await definirSenhaDeOutro({
      adminId: admin,
      alvoUsuarioId: admin,
      senhaNova: "senha nova longa",
      repeticao: "senha nova longa",
    });

    expect(r).toEqual({
      ok: false,
      erro: "Para trocar a sua própria senha, use o formulário acima.",
    });
    expect((await autenticar("admin", "trocarsenha123")).ok).toBe(true);
  });

  it("define a senha e derruba TODAS as sessões de quem recebeu", async () => {
    await comSenha("gerentepark", "park123");
    const admin = await idDe("admin");
    const alvo = await idDe("gerentepark");

    const noCelular = await autenticar("gerentepark", "park123");
    const noComputador = await autenticar("gerentepark", "park123");
    if (!noCelular.ok || !noComputador.ok) throw new Error("não consegui abrir as sessões");

    const NOVA = "combinamos pessoalmente";
    expect(
      await definirSenhaDeOutro({
        adminId: admin,
        alvoUsuarioId: alvo,
        senhaNova: NOVA,
        repeticao: NOVA,
      }),
    ).toEqual({ ok: true });

    // Quem não sabia a senha antiga não continua dentro em aparelho nenhum.
    expect(await sessaoPeloToken(noCelular.token)).toBeNull();
    expect(await sessaoPeloToken(noComputador.token)).toBeNull();

    expect((await autenticar("gerentepark", "park123")).ok).toBe(false);
    expect((await autenticar("gerentepark", NOVA)).ok).toBe(true);

    await comSenha("gerentepark", "park123");
  });

  it("recusa senha curta e repetição diferente", async () => {
    const admin = await idDe("admin");
    const alvo = await idDe("gerentepark");

    expect(
      await definirSenhaDeOutro({ adminId: admin, alvoUsuarioId: alvo, senhaNova: "curta", repeticao: "curta" }),
    ).toEqual({
      ok: false,
      erro: `A senha nova precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.`,
    });

    expect(
      await definirSenhaDeOutro({
        adminId: admin,
        alvoUsuarioId: alvo,
        senhaNova: "uma senha longa",
        repeticao: "outra senha longa",
      }),
    ).toEqual({ ok: false, erro: "As duas senhas novas não são iguais." });

    expect((await autenticar("gerentepark", "park123")).ok).toBe(true);
  });
});
