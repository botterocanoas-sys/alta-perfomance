import Link from "next/link";
import { notFound } from "next/navigation";

import {
  pontosBR,
  reais,
  SeloDoRitmo,
  TabelaDeIndicadores,
} from "@/components/indicadores";
import { lerApuracao } from "@/lib/apuracao";
import { formatarDia, formatarMes, mesDe } from "@/lib/data";
import { prisma } from "@/lib/db";
import { AcessoNegado, exigirAcessoAVendedora } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

/**
 * Página individual da vendedora — versão da etapa 5.
 *
 * Existe agora para o ranking do painel não levar a lugar nenhum. O veredito
 * do dia, os insights, o gráfico de 7 dias e o registro da reunião são a
 * etapa 6.
 */
export default async function PaginaDaVendedora({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const { id } = await params;

  // O id vem da URL: sem esta checagem, trocá-lo abriria a vendedora de outra
  // loja. A mensagem é a mesma de "não existe", de propósito.
  let vendedora;
  try {
    vendedora = await exigirAcessoAVendedora(sessao, id);
  } catch (erro) {
    if (erro instanceof AcessoNegado) notFound();
    throw erro;
  }

  const apuracao = await lerApuracao(prisma, vendedora.lojaId);
  const linha = apuracao.vendedoras.find((item) => item.vendedoraId === vendedora.id);
  const mes = apuracao.data ? mesDe(apuracao.data) : null;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <Link
          href={`/painel?loja=${vendedora.lojaId}`}
          className="font-sistema text-sm text-tinta-2 underline underline-offset-4"
        >
          ← {vendedora.loja.nome}
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          {vendedora.nome}
        </h1>
        {mes && apuracao.data ? (
          <p className="mt-1 text-tinta-2">
            {formatarMes(mes)} · números de {formatarDia(apuracao.data)} · dia{" "}
            {apuracao.diasDecorridos} de {apuracao.diasDoMes}
          </p>
        ) : null}
      </section>

      {!linha ? (
        <section className="border border-linha bg-papel p-6">
          <p className="text-tinta-2">
            Ainda não há apuração para esta vendedora neste mês. Ela aparece aqui depois da
            primeira importação em que tiver meta no relatório.
          </p>
        </section>
      ) : (
        <>
          <section className="border border-linha bg-papel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-lg font-bold text-tinta">
                  <span className="numeros">{pontosBR.format(linha.pontos)}</span> de 40 pontos
                </p>
                <SeloDoRitmo selo={linha.selo} ritmo={linha.ritmo} />
              </div>
              <div className="text-right">
                <p className="numeros text-2xl font-bold text-tinta">
                  {reais.format(linha.bonusReais)}
                </p>
                <p className="font-sistema text-xs text-tinta-3">
                  {linha.recebeBonusVendedora
                    ? "bônus projetado no mês"
                    : "bônus pelo resultado da loja"}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <TabelaDeIndicadores itens={linha.porIndicador} />
            </div>
          </section>

          <section className="border-l-2 border-atencao bg-papel px-4 py-3">
            <p className="font-sistema text-sm text-tinta-2">
              <strong className="text-atencao">Projeção, não bônus garantido.</strong> A apuração
              fecha no último dia do mês, e no começo um único dia bom joga o ritmo acima de 110%.
            </p>
          </section>
        </>
      )}

      <section className="border-l-2 border-vinho bg-vinho-claro px-4 py-3">
        <p className="font-sistema text-sm text-tinta-2">
          Etapa 5 de 10. O veredito do dia em uma frase, os insights, o gráfico dos últimos 7 dias
          e o registro da reunião entram na etapa 6.
        </p>
      </section>
    </div>
  );
}
