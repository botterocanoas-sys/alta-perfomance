/**
 * Popula o banco com o cadastro fixo do programa.
 *
 * Roda com `npm run db:seed` e é idempotente: rodar de novo atualiza o que
 * mudou e não duplica nada. As senhas aqui são as combinadas no brief — a do
 * admin é provisória e deve ser trocada assim que a etapa 2 for para o ar.
 */
import { Indicador, ModoRateio, Papel, PrismaClient, TipoFaixa } from "@prisma/client";

import { gerarHashDeSenha } from "../src/lib/senha";
import { normalizar } from "../src/lib/texto";

/** Mês de referência inicial. O brief trazia agosto; estamos em setembro/2026. */
const MES = new Date(Date.UTC(2026, 8, 1));

const LOJAS = [
  {
    slug: "barra",
    nome: "Barra",
    endereco: "BarraShoppingSul, Porto Alegre",
    chaveRelatorio: "PORTO A. - RS - BARRA SHOPPING",
    metas: { valor: 100000, pares: 340, bolsas: 15 },
  },
  {
    slug: "padre",
    nome: "Padre",
    endereco: "Rua Padre Chagas, Porto Alegre",
    chaveRelatorio: "PORTO A. - RS - PADRE CHAGAS",
    metas: { valor: 55000, pares: 190, bolsas: 5 },
  },
  {
    slug: "park",
    nome: "Park",
    endereco: "ParkShopping Canoas, Canoas",
    chaveRelatorio: "CANOAS - RS - PARK SHOPPING",
    metas: { valor: 70000, pares: 240, bolsas: 8 },
  },
] as const;

/** Metas fixas, idênticas para a loja e para cada vendedora. */
const METAS_FIXAS = { pa: 1.6, conversao: 0.6, crm: 0.2 };

const USUARIOS = [
  { username: "admin", senha: "trocarsenha123", nome: "Administrador", papel: Papel.ADMIN, loja: null },
  { username: "gerentebarra", senha: "barra123", nome: "Gerente Barra", papel: Papel.GERENTE, loja: "barra" },
  { username: "gerentepadre", senha: "padre123", nome: "Clarice", papel: Papel.GERENTE, loja: "padre" },
  { username: "gerentepark", senha: "park123", nome: "Gerente Park", papel: Papel.GERENTE, loja: "park" },
] as const;

/**
 * As pessoas que aparecem no relatório real de 03/09/2026.
 *
 * `contaComoVendedora: false` é a trava manual para linhas que não são
 * vendedoras. O filtro automático do mês é "Meta > 0" no relatório — quem está
 * com meta zero simplesmente não é apurada naquele mês, sem precisar de
 * cadastro nenhum.
 *
 * `usuario` liga a pessoa a um login de gerente. A gerente da Padre vende, mas
 * é remunerada pelo resultado da loja: aparece nos totais e tem apuração
 * individual na tela, com bônus de vendedora zerado.
 */
const PESSOAS: Array<{
  loja: string;
  nome: string;
  contaComoVendedora?: boolean;
  usuario?: string;
  recebeBonusVendedora?: boolean;
}> = [
  // Barra — 3 vendedoras ativas. A quarta será contratada; até lá a meta
  // divide entre as 3 que têm meta no relatório.
  { loja: "barra", nome: "TEREZA" },
  { loja: "barra", nome: "XIMENA" },
  { loja: "barra", nome: "JULIANA" },
  { loja: "barra", nome: "MARILIA" },
  { loja: "barra", nome: "CAMILA" },
  { loja: "barra", nome: "ALVARO", contaComoVendedora: false },

  // Padre — Clarice é a gerente e também vende (meta de R$ 11.000).
  { loja: "padre", nome: "CLARICE", usuario: "gerentepadre", recebeBonusVendedora: false },
  { loja: "padre", nome: "ELISA" },
  { loja: "padre", nome: "ALVARO", contaComoVendedora: false },

  // Park — 4 vendedoras ativas.
  { loja: "park", nome: "IRENE" },
  { loja: "park", nome: "LARISSA" },
  { loja: "park", nome: "BEATRIZ" },
  { loja: "park", nome: "VERONICA" },
  { loja: "park", nome: "ANA CAROLINA" },
  { loja: "park", nome: "SIMAO VITOR" },
  { loja: "park", nome: "ALVARO", contaComoVendedora: false },
];

/**
 * Pontos por indicador. A soma dos "alto" tem de dar exatamente 40 — é a regra
 * do programa, e a tela de configuração bloqueia o salvamento se não fechar.
 *
 * `rateia` e `proporcional` são falsos nas razões (P.A., Conversão, CRM):
 * elas valem a mesma porcentagem para a loja e para a vendedora, e não crescem
 * com o número de dias corridos.
 */
const REGRAS = [
  { indicador: Indicador.VALOR, base: 10, alto: 15, rateia: true, proporcional: true },
  { indicador: Indicador.PARES, base: 4, alto: 7, rateia: true, proporcional: true },
  { indicador: Indicador.BOLSAS, base: 4, alto: 7, rateia: true, proporcional: true },
  { indicador: Indicador.PA, base: 3, alto: 5, rateia: false, proporcional: false },
  { indicador: Indicador.CONVERSAO, base: 2, alto: 3, rateia: false, proporcional: false },
  { indicador: Indicador.CRM, base: 2, alto: 3, rateia: false, proporcional: false },
] as const;

/**
 * As faixas, com o limite entrando sempre na faixa de baixo no topo:
 * 110% cravado paga a base; só acima de 110% paga o alto.
 * `pctMax` nulo significa "sem teto".
 */
const FAIXAS = [
  // ZERO [0, 0.95)
  { ordem: 1, pctMin: 0, minIncl: true, pctMax: 0.95, maxIncl: false, tipo: TipoFaixa.ZERO, pontosFixos: 0 },
  // MEIO [0.95, 1.00)
  { ordem: 2, pctMin: 0.95, minIncl: true, pctMax: 1.0, maxIncl: false, tipo: TipoFaixa.MEIO, pontosFixos: 0.5 },
  // BASE [1.00, 1.10] — 110% cravado paga a base
  { ordem: 3, pctMin: 1.0, minIncl: true, pctMax: 1.1, maxIncl: true, tipo: TipoFaixa.BASE, pontosFixos: null },
  // ALTO (1.10, sem teto)
  { ordem: 4, pctMin: 1.1, minIncl: false, pctMax: null, maxIncl: false, tipo: TipoFaixa.ALTO, pontosFixos: null },
] as const;

/**
 * Aplica o cadastro. Exportada para que os testes possam restaurar o estado
 * depois de mexer nas tabelas — o seed é idempotente de propósito.
 */
export async function semear(prisma: PrismaClient) {
  const somaDosAltos = REGRAS.reduce((total, regra) => total + regra.alto, 0);
  if (somaDosAltos !== 40) {
    throw new Error(
      `A soma dos pontos "alto" precisa fechar em 40, e deu ${somaDosAltos}. Corrija a tabela REGRAS.`,
    );
  }

  const idPorSlug = new Map<string, string>();

  for (const dados of LOJAS) {
    const loja = await prisma.loja.upsert({
      where: { slug: dados.slug },
      update: {
        nome: dados.nome,
        endereco: dados.endereco,
        chaveRelatorio: normalizar(dados.chaveRelatorio),
      },
      create: {
        slug: dados.slug,
        nome: dados.nome,
        endereco: dados.endereco,
        chaveRelatorio: normalizar(dados.chaveRelatorio),
      },
    });
    idPorSlug.set(dados.slug, loja.id);

    await prisma.metaMensal.upsert({
      where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia: MES } },
      update: {},
      create: {
        lojaId: loja.id,
        mesReferencia: MES,
        valorLoja: dados.metas.valor,
        paresLoja: dados.metas.pares,
        bolsasLoja: dados.metas.bolsas,
        pa: METAS_FIXAS.pa,
        conversao: METAS_FIXAS.conversao,
        crm: METAS_FIXAS.crm,
        modoRateio: ModoRateio.PROPORCIONAL,
      },
    });

    await prisma.configMes.upsert({
      where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia: MES } },
      update: {},
      create: {
        lojaId: loja.id,
        mesReferencia: MES,
        valorPontoVendedora: 15,
        valorPontoGerente: 25,
        totalPontosAlto: 40,
      },
    });

    for (const regra of REGRAS) {
      await prisma.regraPontuacao.upsert({
        where: {
          lojaId_mesReferencia_indicador: {
            lojaId: loja.id,
            mesReferencia: MES,
            indicador: regra.indicador,
          },
        },
        update: {},
        create: {
          lojaId: loja.id,
          mesReferencia: MES,
          indicador: regra.indicador,
          pontosBase: regra.base,
          pontosAlto: regra.alto,
          rateiaPorVendedora: regra.rateia,
          proporcionalAosDias: regra.proporcional,
          ativo: true,
        },
      });
    }

    for (const faixa of FAIXAS) {
      await prisma.faixaPontuacao.upsert({
        where: {
          lojaId_mesReferencia_ordem: { lojaId: loja.id, mesReferencia: MES, ordem: faixa.ordem },
        },
        update: {},
        create: {
          lojaId: loja.id,
          mesReferencia: MES,
          ordem: faixa.ordem,
          pctMin: faixa.pctMin,
          pctMinInclusivo: faixa.minIncl,
          pctMax: faixa.pctMax,
          pctMaxInclusivo: faixa.maxIncl,
          tipo: faixa.tipo,
          pontosFixos: faixa.pontosFixos,
        },
      });
    }
  }

  const idPorUsername = new Map<string, string>();

  for (const dados of USUARIOS) {
    const senhaHash = await gerarHashDeSenha(dados.senha);
    const lojaId = dados.loja ? (idPorSlug.get(dados.loja) ?? null) : null;

    const usuario = await prisma.usuario.upsert({
      where: { username: dados.username },
      update: { nome: dados.nome, papel: dados.papel, lojaId, ativo: true },
      create: {
        username: dados.username,
        senhaHash,
        nome: dados.nome,
        papel: dados.papel,
        lojaId,
      },
    });
    idPorUsername.set(dados.username, usuario.id);
  }

  for (const pessoa of PESSOAS) {
    const lojaId = idPorSlug.get(pessoa.loja);
    if (!lojaId) throw new Error(`Loja desconhecida no seed: ${pessoa.loja}`);

    const nome = normalizar(pessoa.nome);
    const usuarioId = pessoa.usuario ? (idPorUsername.get(pessoa.usuario) ?? null) : null;

    const vendedora = await prisma.vendedora.upsert({
      where: { lojaId_nome: { lojaId, nome } },
      update: {
        contaComoVendedora: pessoa.contaComoVendedora ?? true,
        recebeBonusVendedora: pessoa.recebeBonusVendedora ?? true,
        usuarioId,
      },
      create: {
        lojaId,
        nome,
        contaComoVendedora: pessoa.contaComoVendedora ?? true,
        recebeBonusVendedora: pessoa.recebeBonusVendedora ?? true,
        usuarioId,
        ativaDesde: MES,
      },
    });

    // O apelido é como o nome aparece escrito no relatório. Começa igual ao
    // nome cadastrado; a tela de importação acrescenta variações.
    await prisma.vendedoraAlias.upsert({
      where: { lojaId_nomeNoRelatorio: { lojaId, nomeNoRelatorio: nome } },
      update: { vendedoraId: vendedora.id },
      create: { vendedoraId: vendedora.id, lojaId, nomeNoRelatorio: nome },
    });
  }

  const totais = {
    lojas: await prisma.loja.count(),
    usuarios: await prisma.usuario.count(),
    vendedoras: await prisma.vendedora.count(),
    contamComoVendedora: await prisma.vendedora.count({ where: { contaComoVendedora: true } }),
  };

  return totais;
}

/** Execução pela linha de comando: `npm run db:seed`. */
async function main() {
  const prisma = new PrismaClient();
  try {
    const totais = await semear(prisma);
    console.log("Seed concluído:", totais);
    console.log('Lembrete: troque a senha do usuário "admin" antes de publicar.');
  } finally {
    await prisma.$disconnect();
  }
}

// Só roda sozinho quando este arquivo é o ponto de entrada; importar não dispara.
if (process.argv[1]?.endsWith("seed.ts")) {
  main().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
