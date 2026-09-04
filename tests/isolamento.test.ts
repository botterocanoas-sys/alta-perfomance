import { describe, expect, it, beforeAll } from "vitest";

import { prisma } from "@/lib/db";
import {
  AcessoNegado,
  escopoDeLojas,
  exigirAcessoALoja,
  exigirAcessoAVendedora,
  exigirAdmin,
  lojaEmFoco,
  lojasPermitidas,
} from "@/lib/escopo";
import { autenticar, sessaoPeloToken, type SessaoAtiva } from "@/lib/sessao";

/**
 * ISOLAMENTO POR LOJA — exigência da seção 11 do brief.
 *
 * "Logado como gerente da Barra, nenhuma query pode retornar dado de Padre ou
 * Park." Estes testes tratam isso como falha de segurança, não como detalhe de
 * interface: eles chamam as funções de escopo diretamente, do jeito que as
 * páginas chamam.
 */

const SENHAS: Record<string, string> = {
  gerentebarra: "barra123",
  gerentepadre: "padre123",
  gerentepark: "park123",
  admin: "trocarsenha123",
};

async function entrarComo(username: string): Promise<SessaoAtiva> {
  const resultado = await autenticar(username, SENHAS[username]);
  if (!resultado.ok) throw new Error(`Não consegui autenticar ${username}: ${resultado.erro}`);

  const sessao = await sessaoPeloToken(resultado.token);
  if (!sessao) throw new Error(`Sessão de ${username} não abriu.`);
  return sessao;
}

let barraId: string;
let padreId: string;
let parkId: string;

/**
 * O seed não cria vendedoras — elas nascem na importação. Estes testes criam as
 * próprias, com nomes que só existem aqui, para não depender da ordem em que os
 * arquivos de teste rodam nem do conteúdo do arquivo de exemplo.
 */
const MARCADORES = { barra: "ROSANGELA", padre: "SOLANGE", park: "TATIANE" } as const;

beforeAll(async () => {
  const lojas = await prisma.loja.findMany();
  barraId = lojas.find((l) => l.slug === "barra")!.id;
  padreId = lojas.find((l) => l.slug === "padre")!.id;
  parkId = lojas.find((l) => l.slug === "park")!.id;

  for (const [slug, nome] of Object.entries(MARCADORES)) {
    const lojaId = lojas.find((l) => l.slug === slug)!.id;
    await prisma.vendedora.upsert({
      where: { lojaId_nome: { lojaId, nome } },
      update: {},
      create: { lojaId, nome },
    });
  }
});

describe("o que cada sessão enxerga", () => {
  it("a gerente da Barra só enxerga a Barra", async () => {
    const sessao = await entrarComo("gerentebarra");
    expect(await lojasPermitidas(sessao)).toEqual([barraId]);
  });

  it("a gerente da Padre só enxerga a Padre", async () => {
    const sessao = await entrarComo("gerentepadre");
    expect(await lojasPermitidas(sessao)).toEqual([padreId]);
  });

  it("a gerente da Park só enxerga a Park", async () => {
    const sessao = await entrarComo("gerentepark");
    expect(await lojasPermitidas(sessao)).toEqual([parkId]);
  });

  it("o admin enxerga as três lojas", async () => {
    const sessao = await entrarComo("admin");
    const permitidas = await lojasPermitidas(sessao);
    expect(permitidas).toHaveLength(3);
    expect(permitidas).toEqual(expect.arrayContaining([barraId, padreId, parkId]));
  });
});

describe("tentativas de alcançar outra loja", () => {
  it("a gerente da Barra é barrada ao pedir a Padre pelo id", async () => {
    const sessao = await entrarComo("gerentebarra");
    await expect(exigirAcessoALoja(sessao, padreId)).rejects.toBeInstanceOf(AcessoNegado);
  });

  it("a gerente da Barra é barrada ao pedir a Park pelo id", async () => {
    const sessao = await entrarComo("gerentebarra");
    await expect(exigirAcessoALoja(sessao, parkId)).rejects.toBeInstanceOf(AcessoNegado);
  });

  it("trocar a loja no endereço não muda o que a gerente vê", async () => {
    const sessao = await entrarComo("gerentebarra");

    // É o que aconteceria com /painel?loja=<id da Padre>. O parâmetro é
    // ignorado, não obedecido.
    const loja = await lojaEmFoco(sessao, padreId);
    expect(loja.id).toBe(barraId);
    expect(loja.slug).toBe("barra");
  });

  it("o admin pode escolher qual loja está vendo", async () => {
    const sessao = await entrarComo("admin");
    expect((await lojaEmFoco(sessao, padreId)).slug).toBe("padre");
    expect((await lojaEmFoco(sessao, parkId)).slug).toBe("park");
  });

  it("um id de loja inventado é recusado, mesmo para o admin", async () => {
    const sessao = await entrarComo("admin");
    await expect(
      exigirAcessoALoja(sessao, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(AcessoNegado);
  });
});

describe("acesso a uma vendedora pelo id", () => {
  it("a gerente da Barra não alcança uma vendedora da Padre", async () => {
    const sessao = await entrarComo("gerentebarra");
    const daPadre = await prisma.vendedora.findFirstOrThrow({
      where: { lojaId: padreId, nome: MARCADORES.padre },
    });

    await expect(exigirAcessoAVendedora(sessao, daPadre.id)).rejects.toBeInstanceOf(AcessoNegado);
  });

  it("a gerente da Barra alcança as próprias vendedoras", async () => {
    const sessao = await entrarComo("gerentebarra");
    const daBarra = await prisma.vendedora.findFirstOrThrow({
      where: { lojaId: barraId, nome: MARCADORES.barra },
    });

    const encontrada = await exigirAcessoAVendedora(sessao, daBarra.id);
    expect(encontrada.id).toBe(daBarra.id);
    expect(encontrada.loja.slug).toBe("barra");
  });

  it("uma vendedora de outra loja responde igual a uma que não existe", async () => {
    const sessao = await entrarComo("gerentebarra");
    const daPadre = await prisma.vendedora.findFirstOrThrow({
      where: { lojaId: padreId, nome: MARCADORES.padre },
    });

    // As duas mensagens têm de ser idênticas: se a de "outra loja" fosse
    // diferente, daria para descobrir quem trabalha nas outras lojas testando
    // ids até uma delas responder algo diferente.
    const mensagemDoErro = async (vendedoraId: string) => {
      try {
        await exigirAcessoAVendedora(sessao, vendedoraId);
        throw new Error("deveria ter sido recusado");
      } catch (erro) {
        expect(erro).toBeInstanceOf(AcessoNegado);
        return (erro as Error).message;
      }
    };

    expect(await mensagemDoErro(daPadre.id)).toBe(
      await mensagemDoErro("00000000-0000-0000-0000-000000000000"),
    );
  });
});

describe("varredura: nenhuma consulta com escopo devolve dado de outra loja", () => {
  it("a gerente da Barra não vê registro nenhum de Padre ou Park", async () => {
    const sessao = await entrarComo("gerentebarra");
    const escopo = await escopoDeLojas(sessao);
    const proibidos = [padreId, parkId];

    // Todas as tabelas que carregam lojaId. Se uma tabela nova entrar no
    // modelo e esquecerem de listar aqui, é para este teste ficar desatualizado
    // de propósito — a lista é a checagem.
    const consultas = {
      vendedora: () => prisma.vendedora.findMany({ where: escopo, select: { lojaId: true } }),
      vendedoraAlias: () =>
        prisma.vendedoraAlias.findMany({ where: escopo, select: { lojaId: true } }),
      metaMensal: () => prisma.metaMensal.findMany({ where: escopo, select: { lojaId: true } }),
      configMes: () => prisma.configMes.findMany({ where: escopo, select: { lojaId: true } }),
      regraPontuacao: () =>
        prisma.regraPontuacao.findMany({ where: escopo, select: { lojaId: true } }),
      faixaPontuacao: () =>
        prisma.faixaPontuacao.findMany({ where: escopo, select: { lojaId: true } }),
      acumuladoImportado: () =>
        prisma.acumuladoImportado.findMany({ where: escopo, select: { lojaId: true } }),
      apuracaoLojaDia: () =>
        prisma.apuracaoLojaDia.findMany({ where: escopo, select: { lojaId: true } }),
    };

    for (const [tabela, consultar] of Object.entries(consultas)) {
      const linhas = await consultar();
      const vazadas = linhas.filter((linha) => proibidos.includes(linha.lojaId));
      expect(vazadas, `a tabela ${tabela} vazou dado de outra loja`).toHaveLength(0);
    }
  });

  it("a carteira da gerente da Barra tem só as pessoas da Barra", async () => {
    const sessao = await entrarComo("gerentebarra");
    const escopo = await escopoDeLojas(sessao);

    const vendedoras = await prisma.vendedora.findMany({ where: escopo });
    const nomes = vendedoras.map((v) => v.nome);

    expect(nomes).toContain(MARCADORES.barra);
    expect(nomes).not.toContain(MARCADORES.padre);
    expect(nomes).not.toContain(MARCADORES.park);
    expect(vendedoras.every((v) => v.lojaId === barraId)).toBe(true);
  });

  it("uma gerente sem loja ligada não vê nada, em vez de ver tudo", async () => {
    const sessao = await entrarComo("gerentebarra");
    const orfa: SessaoAtiva = { ...sessao, lojaIdDoUsuario: null };

    expect(await lojasPermitidas(orfa)).toEqual([]);

    const vendedoras = await prisma.vendedora.findMany({ where: await escopoDeLojas(orfa) });
    expect(vendedoras).toHaveLength(0);
  });
});

describe("importar o relatório é só do admin", () => {
  it("recusa qualquer gerente", async () => {
    for (const username of ["gerentebarra", "gerentepadre", "gerentepark"]) {
      const sessao = await entrarComo(username);
      expect(() => exigirAdmin(sessao)).toThrow(AcessoNegado);
    }
  });

  it("libera o admin", async () => {
    const sessao = await entrarComo("admin");
    expect(() => exigirAdmin(sessao)).not.toThrow();
  });
});
