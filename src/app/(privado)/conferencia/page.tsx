import Link from "next/link";

import { prisma } from "@/lib/db";
import { formatarDia } from "@/lib/data";
import { ehAdmin, lojaEmFoco } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

export const metadata = { title: "Conferência · Alta Performance" };

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const porcento = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** Vazio nunca vira zero: sem denominador, a coluna diz que não houve. */
function razao(valor: { toNumber(): number } | null, comoPorcentagem = false) {
  if (valor === null) return <span className="text-tinta-3">—</span>;
  const bruto = valor.toNumber();
  return <span className="numeros">{comoPorcentagem ? porcento.format(bruto) : numero.format(bruto)}</span>;
}

function quantidade(valor: number) {
  const classe = valor < 0 ? "numeros text-critico" : "numeros text-tinta";
  return <span className={classe}>{numero.format(valor)}</span>;
}

/**
 * Conferência do dia — a tela da etapa 3.
 *
 * Não é bonita de propósito: ela existe para o franqueado comparar, linha a
 * linha, o acumulado que o relatório trouxe com o resultado do dia que o app
 * calculou por diferença.
 */
export default async function Conferencia({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; data?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const { loja: lojaPedida, data: dataPedida } = await searchParams;
  const loja = await lojaEmFoco(sessao, lojaPedida);

  const diasComResultado = await prisma.resultadoDiario.findMany({
    where: { vendedora: { lojaId: loja.id } },
    distinct: ["data"],
    select: { data: true },
    orderBy: { data: "desc" },
    take: 30,
  });

  const dataEscolhida =
    dataPedida && /^\d{4}-\d{2}-\d{2}$/.test(dataPedida)
      ? new Date(`${dataPedida}T00:00:00.000Z`)
      : (diasComResultado[0]?.data ?? null);

  const lojasVisiveis = ehAdmin(sessao)
    ? await prisma.loja.findMany({ orderBy: { nome: "asc" } })
    : [loja];

  const linhas = dataEscolhida
    ? await prisma.resultadoDiario.findMany({
        where: { data: dataEscolhida, vendedora: { lojaId: loja.id } },
        include: {
          vendedora: { select: { nome: true, contaComoVendedora: true } },
          importacao: { select: { arquivoNome: true, dataReferencia: true } },
        },
        orderBy: { vendedora: { nome: "asc" } },
      })
    : [];

  const acumulados = dataEscolhida
    ? await prisma.acumuladoImportado.findMany({
        where: {
          lojaId: loja.id,
          importacao: { dataReferencia: dataEscolhida, status: "CONFIRMADA" },
        },
        orderBy: { importacao: { criadaEm: "desc" } },
        include: { vendedora: { select: { nome: true } } },
      })
    : [];

  // A importação oficial do dia é a mais recente; a consulta já vem nessa ordem.
  const acumuladoPorVendedora = new Map<string, (typeof acumulados)[number]>();
  for (const linha of acumulados) {
    if (!acumuladoPorVendedora.has(linha.vendedoraId)) {
      acumuladoPorVendedora.set(linha.vendedoraId, linha);
    }
  }

  const noPrograma = linhas.filter((linha) => {
    const acumulado = acumuladoPorVendedora.get(linha.vendedoraId);
    return linha.vendedora.contaComoVendedora && (acumulado?.metaValor.toNumber() ?? 0) > 0;
  });
  const foraDoPrograma = linhas.filter((linha) => !noPrograma.includes(linha));

  const arquivo = linhas[0]?.importacao;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="rotulo">Conferência do dia</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">{loja.nome}</h1>
        <p className="mt-2 max-w-prose text-tinta-2">
          O relatório traz o acumulado do mês. O resultado do dia sai da diferença para a importação
          oficial do dia anterior — é isto que a tabela abaixo mostra lado a lado.
        </p>

        {lojasVisiveis.length > 1 ? (
          <nav aria-label="Trocar de loja" className="mt-4 flex flex-wrap gap-2">
            {lojasVisiveis.map((outra) => (
              <Link
                key={outra.id}
                href={`/conferencia?loja=${outra.id}`}
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

      {diasComResultado.length === 0 ? (
        <section className="border border-linha bg-papel p-6">
          <p className="text-tinta-2">
            Aguardando a primeira importação do mês. Assim que o administrador subir o relatório, o
            resultado de cada dia aparece aqui.
          </p>
        </section>
      ) : (
        <>
          <section>
            <p className="rotulo mb-2">Dia</p>
            <nav aria-label="Escolher o dia" className="flex flex-wrap gap-2">
              {diasComResultado.map(({ data }) => {
                const iso = data.toISOString().slice(0, 10);
                const atual = data.getTime() === dataEscolhida?.getTime();
                return (
                  <Link
                    key={iso}
                    href={`/conferencia?loja=${loja.id}&data=${iso}`}
                    aria-current={atual ? "page" : undefined}
                    className={
                      atual
                        ? "numeros rounded-sm border border-tinta bg-tinta px-3 py-1.5 text-xs font-semibold text-creme"
                        : "numeros rounded-sm border border-linha bg-papel px-3 py-1.5 text-xs font-semibold text-tinta-2"
                    }
                  >
                    {formatarDia(data)}
                  </Link>
                );
              })}
            </nav>
            {arquivo ? (
              <p className="mt-3 font-sistema text-xs text-tinta-3">
                Origem: {arquivo.arquivoNome}
              </p>
            ) : null}
          </section>

          <section>
            <h2 className="text-xl font-bold tracking-tight text-tinta">
              No programa neste mês
              <span className="ml-2 font-sistema text-sm font-normal text-tinta-3">
                meta maior que zero no relatório
              </span>
            </h2>

            {noPrograma.length === 0 ? (
              <p className="mt-3 border border-linha bg-papel p-5 text-tinta-2">
                Nenhuma vendedora com meta neste dia.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto border border-linha bg-papel">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="rotulo border-b border-tinta-3">
                      <th className="px-4 py-2 text-left font-normal">Vendedora</th>
                      <th className="px-3 py-2 text-right font-normal">Acum. valor</th>
                      <th className="px-3 py-2 text-right font-normal">Valor do dia</th>
                      <th className="px-3 py-2 text-right font-normal">Pares</th>
                      <th className="px-3 py-2 text-right font-normal">Bolsas</th>
                      <th className="px-3 py-2 text-right font-normal">Peças</th>
                      <th className="px-3 py-2 text-right font-normal">Boletos</th>
                      <th className="px-3 py-2 text-right font-normal">Oport.</th>
                      <th className="px-3 py-2 text-right font-normal">P.A.</th>
                      <th className="px-3 py-2 text-right font-normal">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noPrograma.map((linha) => {
                      const acumulado = acumuladoPorVendedora.get(linha.vendedoraId);
                      return (
                        <tr key={linha.id} className="border-b border-linha last:border-b-0">
                          <td className="px-4 py-2.5 text-tinta">
                            {linha.vendedora.nome}
                            {linha.importacaoBaseId === null ? (
                              <span className="ml-2 font-sistema text-[11px] text-tinta-3">
                                1ª do mês
                              </span>
                            ) : null}
                          </td>
                          <td className="numeros px-3 py-2.5 text-right text-tinta-3">
                            {acumulado ? reais.format(acumulado.valor.toNumber()) : "—"}
                          </td>
                          <td
                            className={`numeros px-3 py-2.5 text-right font-semibold ${linha.valor.toNumber() < 0 ? "text-critico" : "text-tinta"}`}
                          >
                            {reais.format(linha.valor.toNumber())}
                          </td>
                          <td className="px-3 py-2.5 text-right">{quantidade(linha.calcados)}</td>
                          <td className="px-3 py-2.5 text-right">{quantidade(linha.bolsas)}</td>
                          <td className="px-3 py-2.5 text-right">{quantidade(linha.totalPecas)}</td>
                          <td className="px-3 py-2.5 text-right">{quantidade(linha.boletos)}</td>
                          <td className="px-3 py-2.5 text-right">{quantidade(linha.oportunidades)}</td>
                          <td className="px-3 py-2.5 text-right">{razao(linha.pa)}</td>
                          <td className="px-3 py-2.5 text-right">{razao(linha.conversao, true)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-1 font-sistema text-xs text-tinta-3">
              <p>
                <span className="text-critico">Valores em vermelho</span> são quedas no dia — uma
                devolução ou um cancelamento derruba o acumulado. Não é erro: a apuração é mensal e
                sempre feita sobre o acumulado.
              </p>
              <p>
                <span className="text-tinta-3">—</span> quer dizer sem resultado: não houve boleto
                (P.A.) ou não houve atendimento (Conversão) naquele dia. Nunca é zero.
              </p>
              <p>P.A. = peças do dia ÷ boletos do dia. Conversão = boletos do dia ÷ oportunidades do dia.</p>
            </div>
          </section>

          {foraDoPrograma.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold tracking-tight text-tinta">
                Fora do programa neste mês
              </h2>
              <p className="mt-1 font-sistema text-sm text-tinta-3">
                Meta zero no relatório, ou marcadas como &ldquo;não conta como vendedora&rdquo;. O
                histórico é guardado, mas elas não pontuam, não entram nas médias da loja nem no
                rateio de Pares e Bolsas.
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-sistema text-sm text-tinta-2">
                {foraDoPrograma.map((linha) => (
                  <li key={linha.id}>{linha.vendedora.nome}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
