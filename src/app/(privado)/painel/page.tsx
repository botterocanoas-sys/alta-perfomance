import Link from "next/link";

import { prisma } from "@/lib/db";
import { ehAdmin, escopoDeLojas, lojaEmFoco } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

export const metadata = { title: "Painel · Alta Performance" };

/**
 * Painel da loja — versão da etapa 2.
 *
 * Aqui ele serve para provar o isolamento: mostra a loja em foco e a carteira
 * dela, e nada mais. O resumo do mês, o ranking e os selos entram na etapa 5,
 * depois que a importação e o motor de pontos estiverem prontos.
 */
export default async function Painel({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return null; // O layout já redirecionou; isto é só para o TypeScript.

  const { loja: lojaPedida } = await searchParams;

  // Para a gerente, `lojaPedida` é ignorada: ela sempre vê a própria loja,
  // mesmo que troque o endereço na barra do navegador.
  const loja = await lojaEmFoco(sessao, lojaPedida);

  // Toda consulta com lojaId passa pelo escopo da sessão.
  const escopo = await escopoDeLojas(sessao);

  const [vendedoras, lojasVisiveis, ultimaImportacao] = await Promise.all([
    prisma.vendedora.findMany({
      where: { ...escopo, lojaId: loja.id, arquivadaEm: null },
      orderBy: [{ contaComoVendedora: "desc" }, { nome: "asc" }],
    }),
    ehAdmin(sessao)
      ? prisma.loja.findMany({ orderBy: { nome: "asc" } })
      : Promise.resolve([loja]),
    prisma.importacao.findFirst({
      where: { status: "CONFIRMADA" },
      orderBy: [{ dataReferencia: "desc" }, { criadaEm: "desc" }],
    }),
  ]);

  const naCarteira = vendedoras.filter((v) => v.contaComoVendedora);
  const foraDaCarteira = vendedoras.filter((v) => !v.contaComoVendedora);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="rotulo">Loja</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          {loja.nome}
        </h1>
        <p className="mt-1 text-tinta-2">{loja.endereco}</p>

        {ehAdmin(sessao) && lojasVisiveis.length > 1 ? (
          <nav aria-label="Trocar de loja" className="mt-4 flex flex-wrap gap-2">
            {lojasVisiveis.map((outra) => (
              <Link
                key={outra.id}
                href={`/painel?loja=${outra.id}`}
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
        <p className="rotulo">Última importação</p>
        {ultimaImportacao ? (
          <p className="mt-2 text-tinta">
            {ultimaImportacao.dataReferencia.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
            <span className="ml-2 font-sistema text-sm text-tinta-3">
              {ultimaImportacao.arquivoNome}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-tinta-2">
            Aguardando a primeira importação do mês. Peça ao administrador para
            subir o relatório de hoje — sem ele não há resultado do dia para
            comparar.
          </p>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight text-tinta">Carteira</h2>
          <p className="font-sistema text-sm text-tinta-3">
            {naCarteira.length}{" "}
            {naCarteira.length === 1 ? "vendedora cadastrada" : "vendedoras cadastradas"}
          </p>
        </div>

        {naCarteira.length === 0 ? (
          <p className="mt-3 border border-linha bg-papel p-5 text-tinta-2">
            Nenhuma vendedora cadastrada nesta loja ainda. Elas são criadas na
            primeira importação do relatório.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-linha border border-linha bg-papel">
            {naCarteira.map((vendedora) => (
              <li key={vendedora.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-tinta">{vendedora.nome}</span>
                {!vendedora.recebeBonusVendedora ? (
                  <span className="font-sistema text-xs text-tinta-3">
                    bônus pelo resultado da loja
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {foraDaCarteira.length > 0 ? (
          <p className="mt-3 font-sistema text-xs leading-relaxed text-tinta-3">
            Fora da carteira: {foraDaCarteira.map((v) => v.nome).join(", ")}. Aparecem
            no relatório mas não são apuradas, não entram nas médias da loja nem
            no rateio de Pares e Bolsas.
          </p>
        ) : null}
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href={`/conferencia?loja=${loja.id}`}
          className="rounded-sm border border-linha bg-papel px-4 py-2.5 font-sistema text-sm font-semibold text-tinta-2"
        >
          Conferir os números do dia
        </Link>
        {ehAdmin(sessao) ? (
          <Link
            href="/importar"
            className="rounded-sm bg-tinta px-4 py-2.5 font-sistema text-sm font-semibold text-creme"
          >
            Importar relatório
          </Link>
        ) : null}
      </section>

      <section className="border-l-2 border-vinho bg-vinho-claro px-4 py-3">
        <p className="font-sistema text-sm text-tinta-2">
          Etapa 3 de 10. O resumo do mês, o ranking e a tela da reunião entram
          depois que o motor de pontos estiver pronto.
        </p>
      </section>
    </div>
  );
}
