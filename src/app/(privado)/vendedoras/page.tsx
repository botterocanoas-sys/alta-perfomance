import Link from "next/link";

import { diaEmPortoAlegre, formatarMes, mesDe } from "@/lib/data";
import { prisma } from "@/lib/db";
import { ehAdmin, lojaEmFoco } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

import { Carteira, FormularioDeCadastro, type VendedoraNaTela } from "./formularios";

export const metadata = { title: "Gerenciar vendedoras · Alta Performance" };

/**
 * Gerenciar vendedoras (seção 8.6 do brief).
 *
 * Três chaves, e a tela explica o que cada uma faz, porque elas se parecem e
 * fazem coisas diferentes:
 *
 *  - "conta como vendedora" tira a linha da carteira, das médias da loja e do
 *    rateio das metas. É a trava para o que não é vendedora;
 *  - "recebe bônus individual" mantém a apuração e zera o dinheiro. É a gerente
 *    que também vende, remunerada pelo resultado da loja;
 *  - "arquivada" é quem saiu da loja: o histórico fica, ela some das telas.
 */
export default async function Vendedoras({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const { loja: lojaPedida } = await searchParams;
  const loja = await lojaEmFoco(sessao, lojaPedida);
  const mes = mesDe(diaEmPortoAlegre());

  const [vendedoras, metasDoMes, lojasVisiveis] = await Promise.all([
    prisma.vendedora.findMany({ where: { lojaId: loja.id }, orderBy: [{ arquivadaEm: "asc" }, { nome: "asc" }] }),
    prisma.resultadoDiario.findMany({
      where: { vendedora: { lojaId: loja.id }, data: { gte: mes } },
      orderBy: { data: "desc" },
      select: { vendedoraId: true, metaValorMes: true },
    }),
    ehAdmin(sessao) ? prisma.loja.findMany({ orderBy: { nome: "asc" } }) : Promise.resolve([loja]),
  ]);

  // A meta mais recente de cada uma no mês corrente.
  const metaPor = new Map<string, number>();
  for (const linha of metasDoMes) {
    if (!metaPor.has(linha.vendedoraId)) metaPor.set(linha.vendedoraId, linha.metaValorMes.toNumber());
  }

  const naTela: VendedoraNaTela[] = vendedoras.map((vendedora) => ({
    id: vendedora.id,
    nome: vendedora.nome,
    contaComoVendedora: vendedora.contaComoVendedora,
    recebeBonusVendedora: vendedora.recebeBonusVendedora,
    arquivada: vendedora.arquivadaEm !== null,
    metaDoMes: metaPor.get(vendedora.id) ?? null,
  }));

  const ativas = naTela.filter((v) => !v.arquivada);
  const arquivadas = naTela.filter((v) => v.arquivada);

  return (
    <div className="flex flex-col gap-7">
      <section>
        <p className="rotulo">Gerenciar vendedoras</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          {loja.nome}
        </h1>
        <p className="mt-2 text-tinta-2">{formatarMes(mes)}</p>

        {lojasVisiveis.length > 1 ? (
          <nav aria-label="Trocar de loja" className="mt-4 flex flex-wrap gap-2">
            {lojasVisiveis.map((outra) => (
              <Link
                key={outra.id}
                href={`/vendedoras?loja=${outra.id}`}
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

      <section className="border border-linha bg-papel p-5">
        <h2 className="mb-3 text-lg font-bold tracking-tight text-tinta">O que cada chave faz</h2>
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="font-semibold text-tinta">conta como vendedora</dt>
            <dd className="text-tinta-2">
              Desmarcar tira a linha da carteira, das médias da loja e da divisão das metas de Pares
              e Bolsas. É a trava para linhas do relatório que não são vendedoras.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-tinta">recebe bônus individual</dt>
            <dd className="text-tinta-2">
              Desmarcar mantém a apuração dela na tela — os números servem para a conversa — e zera
              o bônus em reais. É a gerente que também vende, remunerada pelo resultado da loja.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-tinta">arquivada</dt>
            <dd className="text-tinta-2">
              Quem saiu da loja. O histórico continua guardado; ela some das telas do dia a dia.
            </dd>
          </div>
        </dl>
      </section>

      <Carteira ativas={ativas} arquivadas={arquivadas} />

      <section className="border border-linha bg-papel p-5">
        <h2 className="mb-3 text-lg font-bold tracking-tight text-tinta">Cadastrar à mão</h2>
        <FormularioDeCadastro lojaId={loja.id} />
      </section>
    </div>
  );
}
