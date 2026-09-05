import { Indicador, ModoRateio } from "@prisma/client";
import Link from "next/link";

import { diaEmPortoAlegre, formatarMes, mesDe } from "@/lib/data";
import { prisma } from "@/lib/db";
import { ehAdmin, lojaEmFoco } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

import { FormularioDeMetas, type ValoresDasMetas } from "./formulario";

export const metadata = { title: "Metas do mês · Alta Performance" };

/** Números vão para o campo de texto no formato que a gerente digita. */
const paraCampo = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

const PADRAO = {
  valorLoja: 0,
  paresLoja: 0,
  bolsasLoja: 0,
  pa: 1.6,
  conversao: 0.6,
  crm: 0.2,
  valorPontoVendedora: 15,
  valorPontoGerente: 25,
  totalPontosAlto: 40,
};

/** A distribuição do brief, usada quando o mês ainda não tem regras. */
const PONTOS_PADRAO: Record<Indicador, { base: number; alto: number }> = {
  VALOR: { base: 10, alto: 15 },
  PARES: { base: 4, alto: 7 },
  BOLSAS: { base: 4, alto: 7 },
  PA: { base: 3, alto: 5 },
  CONVERSAO: { base: 2, alto: 3 },
  CRM: { base: 2, alto: 3 },
};

export default async function Metas({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; mes?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const { loja: lojaPedida, mes: mesPedido } = await searchParams;
  const loja = await lojaEmFoco(sessao, lojaPedida);

  const hoje = diaEmPortoAlegre();
  const mes =
    mesPedido && /^\d{4}-\d{2}$/.test(mesPedido)
      ? mesDe(new Date(`${mesPedido}-01T00:00:00.000Z`))
      : mesDe(hoje);
  const mesIso = mes.toISOString().slice(0, 7);

  const [meta, config, regras, lojasVisiveis] = await Promise.all([
    prisma.metaMensal.findUnique({
      where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia: mes } },
    }),
    prisma.configMes.findUnique({
      where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia: mes } },
    }),
    prisma.regraPontuacao.findMany({ where: { lojaId: loja.id, mesReferencia: mes } }),
    ehAdmin(sessao) ? prisma.loja.findMany({ orderBy: { nome: "asc" } }) : Promise.resolve([loja]),
  ]);

  const porIndicador = new Map(regras.map((regra) => [regra.indicador, regra]));

  const valores: ValoresDasMetas = {
    valorLoja: paraCampo(meta?.valorLoja.toNumber() ?? PADRAO.valorLoja),
    paresLoja: paraCampo(meta?.paresLoja.toNumber() ?? PADRAO.paresLoja),
    bolsasLoja: paraCampo(meta?.bolsasLoja.toNumber() ?? PADRAO.bolsasLoja),
    pa: paraCampo(meta?.pa.toNumber() ?? PADRAO.pa),
    conversao: paraCampo(meta?.conversao.toNumber() ?? PADRAO.conversao),
    crm: paraCampo(meta?.crm.toNumber() ?? PADRAO.crm),
    modoRateio: (meta?.modoRateio ?? ModoRateio.PROPORCIONAL) as "PROPORCIONAL" | "IGUAL",
    valorPontoVendedora: paraCampo(
      config?.valorPontoVendedora.toNumber() ?? PADRAO.valorPontoVendedora,
    ),
    valorPontoGerente: paraCampo(config?.valorPontoGerente.toNumber() ?? PADRAO.valorPontoGerente),
    totalPontosAlto: paraCampo(config?.totalPontosAlto.toNumber() ?? PADRAO.totalPontosAlto),
    pontos: Object.values(Indicador).map((indicador) => {
      const regra = porIndicador.get(indicador);
      return {
        indicador,
        base: paraCampo(regra?.pontosBase.toNumber() ?? PONTOS_PADRAO[indicador].base),
        alto: paraCampo(regra?.pontosAlto.toNumber() ?? PONTOS_PADRAO[indicador].alto),
        ativo: regra?.ativo ?? true,
      };
    }),
  };

  /** Os últimos meses e o próximo, para cadastrar antecipado ou corrigir. */
  const meses = [-2, -1, 0, 1].map((deslocamento) => {
    const outro = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + deslocamento, 1));
    return { data: outro, iso: outro.toISOString().slice(0, 7) };
  });

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="rotulo">Metas do mês</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          {loja.nome}
        </h1>
        <p className="mt-2 text-tinta-2">{formatarMes(mes)}</p>

        {lojasVisiveis.length > 1 ? (
          <nav aria-label="Trocar de loja" className="mt-4 flex flex-wrap gap-2">
            {lojasVisiveis.map((outra) => (
              <Link
                key={outra.id}
                href={`/metas?loja=${outra.id}&mes=${mesIso}`}
                aria-current={outra.id === loja.id ? "page" : undefined}
                className={
                  outra.id === loja.id
                    ? "rounded-sm border border-tinta bg-tinta px-3 py-1.5 font-sistema text-xs font-semibold text-creme"
                    : "rounded-sm border border-linha bg-papel px-3 py-1.5 font-sistema text-xs font-semibold text-tinta-2"
                }
              >
                {outra.nome}
              </Link>
            ))}
          </nav>
        ) : null}

        <nav aria-label="Escolher o mês" className="mt-3 flex flex-wrap gap-2">
          {meses.map(({ data, iso }) => (
            <Link
              key={iso}
              href={`/metas?loja=${loja.id}&mes=${iso}`}
              aria-current={iso === mesIso ? "page" : undefined}
              className={
                iso === mesIso
                  ? "rounded-sm border border-tinta bg-tinta px-3 py-1.5 font-sistema text-xs font-semibold text-creme"
                  : "rounded-sm border border-linha bg-papel px-3 py-1.5 font-sistema text-xs font-semibold text-tinta-2"
              }
            >
              {formatarMes(data)}
            </Link>
          ))}
        </nav>
      </section>

      {!meta ? (
        <section className="border-l-2 border-atencao bg-papel px-4 py-3">
          <p className="font-sistema text-sm font-semibold text-atencao">
            Este mês ainda não tem metas cadastradas.
          </p>
          <p className="mt-1 font-sistema text-sm text-tinta-2">
            Os campos abaixo vêm com os valores do programa como sugestão. Enquanto não salvar,
            ninguém desta loja é apurada neste mês.
          </p>
        </section>
      ) : null}

      <section className="border border-linha bg-papel p-5 sm:p-6">
        <FormularioDeMetas lojaId={loja.id} mes={mesIso} valores={valores} />
      </section>

      <section className="border-l-2 border-vinho bg-vinho-claro px-4 py-3">
        <p className="font-sistema text-sm text-tinta-2">
          Salvar recalcula o mês inteiro desta loja. A meta de <strong>Valor de cada vendedora</strong>{" "}
          não vem daqui: ela é lida da coluna &ldquo;Meta&rdquo; do relatório. O valor de Valor
          acima é o da loja, usado para apurar a gerente e para conferir a soma na importação.
        </p>
      </section>
    </div>
  );
}
