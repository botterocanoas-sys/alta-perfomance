import Link from "next/link";

import {
  pontosBR,
  reais,
  SeloDoRitmo,
  TabelaDeIndicadores,
} from "@/components/indicadores";
import { lerApuracao } from "@/lib/apuracao";
import { diaEmPortoAlegre, formatarDia, formatarMes, mesDe } from "@/lib/data";
import { prisma } from "@/lib/db";
import { ehAdmin, escopoDeLojas, lojaEmFoco } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

export const metadata = { title: "Painel · Alta Performance" };

/**
 * Painel da loja — a home da gerente (seção 8.2 do brief).
 *
 * A ordem da tela é a ordem da conversa: primeiro o estado da importação (os
 * números são de quando?), depois a loja no mês, depois cada vendedora.
 */
export default async function Painel({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const { loja: lojaPedida } = await searchParams;

  // Para a gerente, `lojaPedida` é ignorada: ela sempre vê a própria loja.
  const loja = await lojaEmFoco(sessao, lojaPedida);
  const escopo = await escopoDeLojas(sessao);

  const [apuracao, ultimaImportacao, lojasVisiveis, quantasNaCarteira] = await Promise.all([
    lerApuracao(prisma, loja.id),
    prisma.importacao.findFirst({
      where: { status: "CONFIRMADA" },
      orderBy: [{ dataReferencia: "desc" }, { criadaEm: "desc" }],
      include: { usuario: { select: { nome: true } } },
    }),
    ehAdmin(sessao) ? prisma.loja.findMany({ orderBy: { nome: "asc" } }) : Promise.resolve([loja]),
    prisma.vendedora.count({ where: { ...escopo, lojaId: loja.id, arquivadaEm: null } }),
  ]);

  const hoje = diaEmPortoAlegre();
  const importouHoje = ultimaImportacao?.dataReferencia.getTime() === hoje.getTime();
  const mes = apuracao.data ? mesDe(apuracao.data) : null;

  const noPrograma = apuracao.vendedoras.filter((vendedora) =>
    vendedora.porIndicador.some((item) => item.meta !== null && item.meta > 0),
  );
  const foraDoPrograma = apuracao.vendedoras.filter((v) => !noPrograma.includes(v));

  const bonusProjetado = noPrograma.reduce((soma, v) => soma + v.bonusReais, 0);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="rotulo">Painel da loja</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          {loja.nome}
        </h1>
        <p className="mt-1 text-tinta-2">{loja.endereco}</p>

        {lojasVisiveis.length > 1 ? (
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

      {/* O aviso de importação vem antes de qualquer número: sem ele, a gerente
          pode conversar em cima de dados de anteontem sem perceber. */}
      {!ultimaImportacao ? (
        <section className="border-l-2 border-atencao bg-papel px-4 py-3">
          <p className="font-sistema text-sm font-semibold text-atencao">
            Aguardando a primeira importação do mês.
          </p>
          <p className="mt-1 font-sistema text-sm text-tinta-2">
            Peça ao administrador para subir o relatório de hoje. Sem ele não há resultado do dia
            para comparar.
          </p>
        </section>
      ) : !importouHoje ? (
        <section className="border-l-2 border-atencao bg-papel px-4 py-3">
          <p className="font-sistema text-sm font-semibold text-atencao">
            O relatório de hoje ainda não foi importado.
          </p>
          <p className="mt-1 font-sistema text-sm text-tinta-2">
            Os números abaixo são de{" "}
            <strong>{formatarDia(ultimaImportacao.dataReferencia)}</strong>, a última importação.
          </p>
        </section>
      ) : (
        <section className="border-l-2 border-ritmo bg-papel px-4 py-3">
          <p className="font-sistema text-sm text-tinta-2">
            Números de hoje, <strong>{formatarDia(ultimaImportacao.dataReferencia)}</strong>
            {ultimaImportacao.extraidoEm
              ? `, extraídos às ${ultimaImportacao.extraidoEm.toLocaleTimeString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
            .
          </p>
        </section>
      )}

      {apuracao.data && apuracao.gerente ? (
        <>
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight text-tinta">
                A loja em {mes ? formatarMes(mes) : "seu mês"}
              </h2>
              <p className="font-sistema text-sm text-tinta-3">
                dia {apuracao.diasDecorridos} de {apuracao.diasDoMes}
              </p>
            </div>

            <div className="mt-3 border border-linha bg-papel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4">
                <div className="flex items-center gap-3">
                  <p className="text-lg font-bold text-tinta">
                    <span className="numeros">{pontosBR.format(apuracao.gerente.pontos)}</span> de 40
                    pontos
                  </p>
                  <SeloDoRitmo selo={apuracao.gerente.selo} ritmo={apuracao.gerente.ritmo} />
                </div>
                <p className="text-right">
                  <span className="numeros text-2xl font-bold text-tinta">
                    {reais.format(apuracao.gerente.bonusReais)}
                  </span>
                  <span className="ml-2 font-sistema text-xs text-tinta-3">bônus da gerente</span>
                </p>
              </div>

              <TabelaDeIndicadores itens={apuracao.gerente.porIndicador} />
            </div>

            <p className="mt-2 font-sistema text-xs text-tinta-3">
              <strong className="text-tinta-2">% da meta</strong> é quanto do mês inteiro já foi
              feito. <strong className="text-tinta-2">Ritmo</strong> é isso comparado ao ponto do
              mês em que estamos — no dia 3, 10% da meta é 100% do ritmo.
            </p>
          </section>

          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight text-tinta">Vendedoras</h2>
              <p className="font-sistema text-sm text-tinta-3">
                {reais.format(bonusProjetado)} de bônus projetado no total
              </p>
            </div>

            {noPrograma.length === 0 ? (
              <p className="mt-3 border border-linha bg-papel p-5 text-tinta-2">
                Nenhuma vendedora com meta neste mês. Quem tem meta zero no relatório fica fora do
                programa.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-linha border border-linha bg-papel">
                {noPrograma.map((vendedora, posicao) => (
                  <li key={vendedora.vendedoraId}>
                    <Link
                      href={`/vendedora/${vendedora.vendedoraId}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-creme"
                    >
                      <span className="numeros w-6 text-sm text-tinta-3">{posicao + 1}</span>

                      <span className="min-w-[8rem] flex-1">
                        <span className="block text-tinta">{vendedora.nome}</span>
                        {!vendedora.recebeBonusVendedora ? (
                          <span className="font-sistema text-xs text-tinta-3">
                            bônus pelo resultado da loja
                          </span>
                        ) : null}
                      </span>

                      <SeloDoRitmo selo={vendedora.selo} ritmo={vendedora.ritmo} />

                      <span className="numeros w-20 text-right text-sm text-tinta-2">
                        {pontosBR.format(vendedora.pontos)} pts
                      </span>

                      <span className="numeros w-28 text-right font-semibold text-tinta">
                        {reais.format(vendedora.bonusReais)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-2 font-sistema text-xs text-tinta-3">
              O bônus é <strong className="text-tinta-2">projeção</strong>: a apuração fecha no
              último dia do mês. Clique numa vendedora para abrir a tela da reunião.
            </p>

            {foraDoPrograma.length > 0 ? (
              <p className="mt-3 font-sistema text-xs leading-relaxed text-tinta-3">
                Fora do programa neste mês:{" "}
                {foraDoPrograma.map((v) => v.nome).join(", ")}. Meta zero no relatório — não pontuam
                e não entram nas médias da loja.
              </p>
            ) : null}
          </section>
        </>
      ) : ultimaImportacao ? (
        <section className="border border-linha bg-papel p-6">
          <p className="text-tinta-2">
            Há importação, mas nada apurado para esta loja ainda. Confira se as metas do mês estão
            cadastradas.
          </p>
        </section>
      ) : null}

      <section className="flex flex-wrap gap-3">
        <Link
          href={`/crm?loja=${loja.id}`}
          className="rounded-sm border border-linha bg-papel px-4 py-2.5 font-sistema text-sm font-semibold text-tinta-2"
        >
          Lançar CRM do dia
        </Link>
        <Link
          href={`/vendedoras?loja=${loja.id}`}
          className="rounded-sm border border-linha bg-papel px-4 py-2.5 font-sistema text-sm font-semibold text-tinta-2"
        >
          Gerenciar vendedoras
        </Link>
        <Link
          href={`/metas?loja=${loja.id}`}
          className="rounded-sm border border-linha bg-papel px-4 py-2.5 font-sistema text-sm font-semibold text-tinta-2"
        >
          Metas do mês
        </Link>
        <Link
          href={`/pontos?loja=${loja.id}`}
          className="rounded-sm border border-linha bg-papel px-4 py-2.5 font-sistema text-sm font-semibold text-tinta-2"
        >
          Pontos e bônus, indicador por indicador
        </Link>
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

      <p className="font-sistema text-xs text-tinta-3">
        Carteira desta loja: {quantasNaCarteira}{" "}
        {quantasNaCarteira === 1 ? "pessoa" : "pessoas"}. Quem sai da loja precisa ser arquivada na
        tela de vendedoras, para não continuar entrando nas médias.
      </p>
    </div>
  );
}
