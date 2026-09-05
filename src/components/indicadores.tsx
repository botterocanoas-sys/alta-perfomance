import { Indicador, SituacaoApuracao, TipoFaixa } from "@prisma/client";

import type { LinhaDoRanking } from "@/lib/apuracao";
import { Rolagem } from "@/components/rolagem";
import type { Ritmo, Selo } from "@/lib/pontuacao";

export const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export const pontosBR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const porcento = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

export const ROTULO_DO_INDICADOR: Record<Indicador, string> = {
  VALOR: "Valor",
  PARES: "Pares",
  BOLSAS: "Bolsas",
  PA: "P.A.",
  CONVERSAO: "Conversão",
  CRM: "CRM",
};

const COR_DA_FAIXA: Record<TipoFaixa, string> = {
  ZERO: "text-critico",
  MEIO: "text-atencao",
  BASE: "text-tinta",
  ALTO: "text-ritmo",
};

const SELOS: Record<Selo, { texto: string; classe: string }> = {
  NO_RITMO: { texto: "no ritmo", classe: "border-ritmo text-ritmo" },
  ATENCAO: { texto: "atenção", classe: "border-atencao text-atencao" },
  CRITICO: { texto: "crítico", classe: "border-critico text-critico" },
  PARCIAL: { texto: "medição parcial", classe: "border-tinta-3 text-tinta-2" },
};

/**
 * O selo, o percentual e — sempre — a cobertura da medição.
 *
 * A cobertura não é detalhe: o ritmo é uma média ponderada de quem foi medido,
 * então o denominador varia de pessoa para pessoa. Exibir "104%" sem dizer
 * "sobre 22 de 40 pontos" põe no mesmo lugar dois números que não se comparam.
 */
export function SeloDoRitmo({ selo, ritmo }: { selo: Selo | null; ritmo: Ritmo }) {
  const cobertura =
    ritmo.pesoTotal > 0 ? `${pontosBR.format(ritmo.pesoMedido)} de ${pontosBR.format(ritmo.pesoTotal)} pontos medidos` : null;

  if (!selo) {
    return (
      <span
        title={cobertura ?? undefined}
        className="rounded-full border border-linha px-2.5 py-0.5 font-sistema text-[11px] text-tinta-3"
      >
        sem dados
      </span>
    );
  }

  const { texto, classe } = SELOS[selo];
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span
        title={cobertura ?? undefined}
        className={`rounded-full border px-2.5 py-0.5 font-sistema text-[11px] font-semibold ${classe}`}
      >
        {texto}
        {ritmo.valor !== null ? (
          <span className="numeros ml-1.5 font-normal">{porcento.format(ritmo.valor)}</span>
        ) : null}
      </span>
      {cobertura ? (
        <span className="font-sistema text-[11px] text-tinta-3">{cobertura}</span>
      ) : null}
    </span>
  );
}

/** Valores de razão levam casas decimais; Valor vira dinheiro; o resto, inteiro. */
export function formatarIndicador(indicador: Indicador, valor: number | null) {
  if (valor === null) return "—";
  if (indicador === Indicador.VALOR) return reais.format(valor);
  return numero.format(valor);
}

/**
 * O percentual só aparece quando há medição.
 *
 * `SEM_MEDICAO` nunca pode virar "0%": a vendedora veria uma barra zerada num
 * indicador em que ela nem chegou a ter denominador.
 */
export function Percentual({ item }: { item: LinhaDoRanking["porIndicador"][number] }) {
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

/**
 * A faixa de resumo pedida na seção 8.2: por indicador, meta, realizado, quanto
 * disso já foi feito da meta do mês, e o ritmo.
 *
 * As duas colunas de percentual respondem perguntas diferentes: "quanto do mês
 * já foi" e "isso está no ritmo?". No dia 3, 10% da meta cumprida é 100% do
 * ritmo.
 */
export function TabelaDeIndicadores({
  itens,
  comMetaDoMes = true,
}: {
  itens: LinhaDoRanking["porIndicador"];
  comMetaDoMes?: boolean;
}) {
  return (
    <Rolagem>
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="rotulo border-b border-linha">
            <th className="col-fixa py-2 pr-3 text-left font-normal">Indicador</th>
            <th className="px-3 py-2 text-right font-normal">Meta do mês</th>
            <th className="px-3 py-2 text-right font-normal">Realizado</th>
            {comMetaDoMes ? (
              <th className="px-3 py-2 text-right font-normal">% da meta</th>
            ) : null}
            <th className="px-3 py-2 text-right font-normal">Ritmo</th>
            <th className="px-3 py-2 text-right font-normal">Pontos</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => {
            const doMes =
              item.meta && item.meta > 0 && item.acumulado !== null
                ? item.acumulado / item.meta
                : null;

            return (
              <tr key={item.indicador} className="border-b border-linha last:border-b-0">
                <td className="col-fixa py-2 pr-3 text-tinta">
                  {ROTULO_DO_INDICADOR[item.indicador]}
                </td>
                <td className="numeros px-3 py-2 text-right text-tinta-3">
                  {formatarIndicador(item.indicador, item.meta)}
                </td>
                <td className="numeros px-3 py-2 text-right text-tinta">
                  {formatarIndicador(item.indicador, item.acumulado)}
                </td>
                {comMetaDoMes ? (
                  <td className="numeros px-3 py-2 text-right text-tinta-3">
                    {doMes === null ? "—" : porcento.format(doMes)}
                  </td>
                ) : null}
                <td className="px-3 py-2 text-right">
                  <Percentual item={item} />
                </td>
                <td className="numeros px-3 py-2 text-right font-semibold text-tinta">
                  {pontosBR.format(item.pontos)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Rolagem>
  );
}
