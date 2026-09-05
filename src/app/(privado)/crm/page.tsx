import Link from "next/link";

import { diaEmPortoAlegre, formatarDia } from "@/lib/data";
import { prisma } from "@/lib/db";
import { ehAdmin, lojaEmFoco } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

import { FormularioDeCrm, type LinhaDoCrm } from "./formulario";

export const metadata = { title: "Lançar CRM · Alta Performance" };

/**
 * Lançar CRM do dia (seção 8.5 do brief).
 *
 * A gerente digita a QUANTIDADE de vendas influenciadas pelo CRM; o app calcula
 * a proporção sobre os boletos. Por isso a tela mostra as vendas do dia ao lado
 * de cada campo: é o denominador, e ver os dois juntos evita lançar 8 num dia
 * de 3 vendas sem perceber.
 */
export default async function LancarCrm({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; data?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const { loja: lojaPedida, data: dataPedida } = await searchParams;
  const loja = await lojaEmFoco(sessao, lojaPedida);

  const hoje = diaEmPortoAlegre();
  const data =
    dataPedida && /^\d{4}-\d{2}-\d{2}$/.test(dataPedida)
      ? new Date(`${dataPedida}T00:00:00.000Z`)
      : hoje;
  const iso = data.toISOString().slice(0, 10);

  const [vendedoras, lancamentos, resultados, lojasVisiveis] = await Promise.all([
    prisma.vendedora.findMany({
      where: { lojaId: loja.id, arquivadaEm: null, contaComoVendedora: true },
      orderBy: { nome: "asc" },
    }),
    prisma.crmDiario.findMany({ where: { data, vendedora: { lojaId: loja.id } } }),
    prisma.resultadoDiario.findMany({ where: { data, vendedora: { lojaId: loja.id } } }),
    ehAdmin(sessao) ? prisma.loja.findMany({ orderBy: { nome: "asc" } }) : Promise.resolve([loja]),
  ]);

  const lancadoPor = new Map(lancamentos.map((l) => [l.vendedoraId, l.vendasInfluenciadas]));
  const boletosPor = new Map(resultados.map((r) => [r.vendedoraId, r.boletos]));

  const linhas: LinhaDoCrm[] = vendedoras.map((vendedora) => ({
    vendedoraId: vendedora.id,
    nome: vendedora.nome,
    boletosDoDia: boletosPor.get(vendedora.id) ?? null,
    lancado: lancadoPor.get(vendedora.id) ?? null,
  }));

  /** Os últimos dias, para a gerente lançar atrasado sem digitar data. */
  const ultimosDias = Array.from({ length: 7 }, (_, indice) => {
    const dia = new Date(hoje.getTime() - indice * 86_400_000);
    return { dia, iso: dia.toISOString().slice(0, 10) };
  });

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="rotulo">Lançar CRM</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          {loja.nome}
        </h1>
        <p className="mt-2 max-w-prose text-tinta-2">
          Quantas vendas do dia foram influenciadas pelo CRM. Digite a quantidade — o app divide
          pelas vendas do dia e compara com a meta de 20%.
        </p>

        {lojasVisiveis.length > 1 ? (
          <nav aria-label="Trocar de loja" className="mt-4 flex flex-wrap gap-2">
            {lojasVisiveis.map((outra) => (
              <Link
                key={outra.id}
                href={`/crm?loja=${outra.id}&data=${iso}`}
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
      </section>

      <section>
        <p className="rotulo mb-2">Dia do lançamento</p>
        <nav aria-label="Escolher o dia" className="flex flex-wrap gap-2">
          {ultimosDias.map(({ dia, iso: diaIso }) => {
            const atual = diaIso === iso;
            const ehHoje = dia.getTime() === hoje.getTime();
            return (
              <Link
                key={diaIso}
                href={`/crm?loja=${loja.id}&data=${diaIso}`}
                aria-current={atual ? "page" : undefined}
                className={
                  atual
                    ? "numeros rounded-sm border border-tinta bg-tinta px-3 py-1.5 text-xs font-semibold text-creme"
                    : "numeros rounded-sm border border-linha bg-papel px-3 py-1.5 text-xs font-semibold text-tinta-2"
                }
              >
                {ehHoje ? "hoje" : formatarDia(dia).slice(0, 5)}
              </Link>
            );
          })}
        </nav>
        <p className="mt-2 font-sistema text-xs text-tinta-3">
          Lançando para {formatarDia(data)}
          {data.getTime() !== hoje.getTime() ? " — um dia atrasado" : ""}. Salvar recalcula o mês
          inteiro.
        </p>
      </section>

      {linhas.length === 0 ? (
        <section className="border border-linha bg-papel p-6">
          <p className="text-tinta-2">
            Nenhuma vendedora na carteira desta loja. Elas aparecem depois da primeira importação
            do relatório.
          </p>
        </section>
      ) : (
        <section>
          <FormularioDeCrm lojaId={loja.id} data={iso} linhas={linhas} />
        </section>
      )}

      <section className="border-l-2 border-vinho bg-vinho-claro px-4 py-3">
        <p className="font-sistema text-sm text-tinta-2">
          Enquanto ninguém lançar, o CRM conta como <strong>0%</strong> — que é medição de verdade,
          não ausência: a vendedora teve vendas e nenhuma veio do CRM. São 3 pontos parados até o
          primeiro lançamento do mês.
        </p>
      </section>
    </div>
  );
}
