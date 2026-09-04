import Link from "next/link";
import { Indicador, SituacaoApuracao, TipoFaixa } from "@prisma/client";

import { lerApuracao, type LinhaDoRanking } from "@/lib/apuracao";
import { formatarDia, formatarMes, mesDe } from "@/lib/data";
import { prisma } from "@/lib/db";
import { ehAdmin, lojaEmFoco } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

export const metadata = { title: "Pontos e bônus · Alta Performance" };

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const pontosBR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const porcento = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

const ROTULO: Record<Indicador, string> = {
  VALOR: "Valor",
  PARES: "Pares",
  BOLSAS: "Bolsas",
  PA: "P.A.",
  CONVERSAO: "Conversão",
  CRM: "CRM",
};

/** Indicadores em fração aparecem com casas; quantidades, arredondadas. */
const EH_RAZAO: Record<Indicador, boolean> = {
  VALOR: false, PARES: false, BOLSAS: false, PA: true, CONVERSAO: true, CRM: true,
};

const COR_DA_FAIXA: Record<TipoFaixa, string> = {
  ZERO: "text-critico",
  MEIO: "text-atencao",
  BASE: "text-tinta",
  ALTO: "text-ritmo",
};

function valorDoIndicador(indicador: Indicador, valor: number | null) {
  if (valor === null) return "—";
  if (indicador === Indicador.VALOR) return reais.format(valor);
  if (EH_RAZAO[indicador]) return numero.format(valor);
  return numero.format(valor);
}

/**
 * O percentual só aparece quando existe medição.
 *
 * Um indicador SEM_MEDICAO não pode virar "0%" na tela: a vendedora veria uma
 * barra zerada num indicador em que ela nem chegou a ter denominador.
 */
function celulaDePercentual(item: LinhaDoRanking["porIndicador"][number]) {
  if (item.situacao === SituacaoApuracao.FORA_DA_APURACAO) {
    return <span className="font-sistema text-xs text-tinta-3">fora</span>;
  }
  if (item.situacao === SituacaoApuracao.SEM_MEDICAO || item.pct === null) {
    return <span className="font-sistema text-xs text-tinta-3">sem medição</span>;
  }
  return (
    <span className={`numeros font-semibold ${item.faixa ? COR_DA_FAIXA[item.faixa] : "text-tinta"}`}>
      {porcento.format(item.pct)}
    </span>
  );
}

function TabelaDeIndicadores({ itens }: { itens: LinhaDoRanking["porIndicador"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="rotulo border-b border-linha">
            <th className="py-2 pr-3 text-left font-normal">Indicador</th>
            <th className="px-3 py-2 text-right font-normal">Meta do mês</th>
            <th className="px-3 py-2 text-right font-normal">Meta até hoje</th>
            <th className="px-3 py-2 text-right font-normal">Realizado</th>
            <th className="px-3 py-2 text-right font-normal">%</th>
            <th className="px-3 py-2 text-right font-normal">Pontos</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.indicador} className="border-b border-linha last:border-b-0">
              <td className="py-2 pr-3 text-tinta">{ROTULO[item.indicador]}</td>
              <td className="numeros px-3 py-2 text-right text-tinta-3">
                {valorDoIndicador(item.indicador, item.meta)}
              </td>
              <td className="numeros px-3 py-2 text-right text-tinta-3">
                {valorDoIndicador(item.indicador, item.metaProporcional)}
              </td>
              <td className="numeros px-3 py-2 text-right text-tinta">
                {valorDoIndicador(item.indicador, item.acumulado)}
              </td>
              <td className="px-3 py-2 text-right">{celulaDePercentual(item)}</td>
              <td className="numeros px-3 py-2 text-right font-semibold text-tinta">
                {pontosBR.format(item.pontos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Pontos({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const { loja: lojaPedida } = await searchParams;
  const loja = await lojaEmFoco(sessao, lojaPedida);
  const apuracao = await lerApuracao(prisma, loja.id);

  const lojasVisiveis = ehAdmin(sessao)
    ? await prisma.loja.findMany({ orderBy: { nome: "asc" } })
    : [loja];

  const mes = apuracao.data ? mesDe(apuracao.data) : null;
  const fracaoDoMes = apuracao.diasDoMes > 0 ? apuracao.diasDecorridos / apuracao.diasDoMes : 0;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="rotulo">Pontos e bônus</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">{loja.nome}</h1>
        {mes ? (
          <p className="mt-2 text-tinta-2">
            {formatarMes(mes)} · apuração de {formatarDia(apuracao.data!)}
          </p>
        ) : null}

        {lojasVisiveis.length > 1 ? (
          <nav aria-label="Trocar de loja" className="mt-4 flex flex-wrap gap-2">
            {lojasVisiveis.map((outra) => (
              <Link
                key={outra.id}
                href={`/pontos?loja=${outra.id}`}
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

      {!apuracao.data ? (
        <section className="border border-linha bg-papel p-6">
          <p className="text-tinta-2">
            Nada apurado ainda. Assim que o administrador importar o primeiro relatório do mês, os
            pontos aparecem aqui.
          </p>
        </section>
      ) : (
        <>
          <section className="border-l-2 border-atencao bg-papel px-4 py-3">
            <p className="font-sistema text-sm font-semibold text-atencao">
              Isto é projeção, não bônus garantido.
            </p>
            <p className="mt-1 font-sistema text-sm text-tinta-2">
              A apuração é mensal e fecha no último dia. Estamos no dia{" "}
              <strong>{apuracao.diasDecorridos} de {apuracao.diasDoMes}</strong> — {porcento.format(fracaoDoMes)} do
              mês corrido. No começo do mês, um único dia bom joga a projeção acima de 110%.
            </p>
          </section>

          {apuracao.gerente ? (
            <section className="border border-linha bg-papel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="rotulo">Gerente · resultado da loja</p>
                  <p className="mt-1 text-lg font-bold text-tinta">
                    <span className="numeros">{pontosBR.format(apuracao.gerente.pontos)}</span> de 40
                    pontos
                  </p>
                </div>
                <p className="numeros text-2xl font-bold text-tinta">
                  {reais.format(apuracao.gerente.bonusReais)}
                </p>
              </div>
              <div className="mt-4">
                <TabelaDeIndicadores itens={apuracao.gerente.porIndicador} />
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="text-xl font-bold tracking-tight text-tinta">Vendedoras</h2>
            <p className="mt-1 font-sistema text-sm text-tinta-3">
              Ordenadas por pontos. Quem tem meta zero no relatório está fora do programa neste mês.
            </p>

            <div className="mt-3 flex flex-col gap-4">
              {apuracao.vendedoras.map((vendedora) => (
                <div key={vendedora.vendedoraId} className="border border-linha bg-papel p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-tinta">{vendedora.nome}</p>
                      <p className="mt-0.5 font-sistema text-sm text-tinta-3">
                        <span className="numeros">{pontosBR.format(vendedora.pontos)}</span> de 40 pontos
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="numeros text-xl font-bold text-tinta">
                        {reais.format(vendedora.bonusReais)}
                      </p>
                      {!vendedora.recebeBonusVendedora ? (
                        <p className="font-sistema text-xs text-tinta-3">
                          bônus pelo resultado da loja
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4">
                    <TabelaDeIndicadores itens={vendedora.porIndicador} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-1 font-sistema text-xs text-tinta-3">
            <p>
              <strong className="text-tinta-2">Meta até hoje</strong> é a meta do mês reduzida na
              proporção dos dias corridos. Vale para Valor, Pares e Bolsas; P.A., Conversão e CRM
              comparam direto com a meta fixa, porque razão não cresce com o número de dias.
            </p>
            <p>
              <strong className="text-tinta-2">Sem medição</strong> não é 0%: faltou denominador (sem
              boleto para o P.A. e o CRM, sem atendimento para a Conversão). Rende 0 ponto, mas não
              é desempenho ruim — é ausência de dado.
            </p>
            <p>
              Faixas: abaixo de 95% zero · 95% a 99,9% meio ponto · 100% a 110% base · acima de 110%
              alto.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
