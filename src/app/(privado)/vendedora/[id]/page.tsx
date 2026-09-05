import Link from "next/link";
import { notFound } from "next/navigation";
import { Indicador, SituacaoApuracao } from "@prisma/client";

import {
  formatarIndicador,
  Percentual,
  pontosBR,
  porcento,
  reais,
  ROTULO_DO_INDICADOR,
  SeloDoRitmo,
} from "@/components/indicadores";
import { diaEmPortoAlegre, formatarDia, formatarMes, mesDe } from "@/lib/data";
import { AcessoNegado, exigirAcessoAVendedora } from "@/lib/escopo";
import { lerDadosDaReuniao } from "@/lib/reuniao";
import { sessaoAtual } from "@/lib/sessao-cookie";

import { TOM, type Tom } from "@/lib/insights";

import { FormularioDaReuniao } from "./formulario-da-reuniao";
import { Rolagem } from "@/components/rolagem";

/** A cor da borda diz o tom da frase sem precisar de rótulo. */
const CORES_DO_TOM: Record<Tom, string> = {
  [TOM.PRIORIDADE]: "border-critico",
  [TOM.RECUPERAVEL]: "border-atencao",
  [TOM.RECONHECIMENTO]: "border-ritmo",
  [TOM.HIPOTESE]: "border-vinho",
  [TOM.COMPARACAO]: "border-tinta-3",
  [TOM.DEGRAU]: "border-tinta",
};

/**
 * A tela da reunião (seção 8.3 do brief) — a mais importante do app.
 *
 * A ordem é a ordem da conversa: o veredito em uma frase, o que atacar hoje, o
 * que aconteceu nos últimos dias, e o que ficou combinado da última vez.
 */
export default async function PaginaDaVendedora({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const { id } = await params;

  // O id vem da URL: sem esta checagem, trocá-lo abriria a vendedora de outra
  // loja. A resposta é a mesma de "não existe", de propósito.
  let vendedora;
  try {
    vendedora = await exigirAcessoAVendedora(sessao, id);
  } catch (erro) {
    // Vendedora de outra loja responde igualzinho a vendedora que não existe:
    // mesma tela e mesmo 404. Por isso esta rota não tem `loading.tsx` — o
    // esqueleto faria o Next despachar 200 antes de chegar aqui, e o status
    // deixaria de dizer a mesma coisa nos dois casos.
    if (erro instanceof AcessoNegado) notFound();
    throw erro;
  }

  const dados = await lerDadosDaReuniao(vendedora.id, vendedora.lojaId);
  const { linha } = dados;
  const mes = dados.data ? mesDe(dados.data) : null;
  const hoje = diaEmPortoAlegre().toISOString().slice(0, 10);

  const maiorPontuacaoNoGrafico = Math.max(1, ...dados.grafico.map((ponto) => ponto.pontos));

  return (
    <div className="flex flex-col gap-8">
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
        {mes && dados.data ? (
          <p className="mt-1 text-tinta-2">
            {formatarMes(mes)} · números de {formatarDia(dados.data)} · dia {dados.diasDecorridos} de{" "}
            {dados.diasDoMes}
          </p>
        ) : null}
      </section>

      {!linha || !dados.data ? (
        <section className="border border-linha bg-papel p-6">
          <p className="text-tinta-2">
            Ainda não há apuração para esta vendedora neste mês. Ela aparece aqui depois da primeira
            importação em que tiver meta no relatório.
          </p>
        </section>
      ) : (
        <>
          {/* a) o veredito do dia em uma frase */}
          <section className="border-l-2 border-tinta bg-papel px-5 py-4">
            <p className="text-lg leading-relaxed text-tinta">
              Hoje está com{" "}
              <strong className="numeros">{pontosBR.format(linha.pontos)} pontos</strong>
              {dados.variacao !== null ? (
                <>
                  ,{" "}
                  <strong
                    className={`numeros ${dados.variacao > 0 ? "text-ritmo" : dados.variacao < 0 ? "text-critico" : "text-tinta-2"}`}
                  >
                    {dados.variacao > 0 ? "+" : ""}
                    {pontosBR.format(dados.variacao)}
                  </strong>{" "}
                  em relação a ontem
                </>
              ) : null}{" "}
              — <strong className="numeros">{reais.format(linha.bonusReais)}</strong> de bônus
              projetado no mês.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <SeloDoRitmo selo={linha.selo} ritmo={linha.ritmo} />
              {!linha.recebeBonusVendedora ? (
                <span className="font-sistema text-xs text-tinta-3">
                  remunerada pelo resultado da loja
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-sistema text-xs text-tinta-3">
              Projeção. A apuração fecha no último dia do mês — no começo, um único dia bom joga o
              ritmo acima de 110%.
            </p>
          </section>

          {/* b) os insights, em frases curtas */}
          {dados.insights.length > 0 ? (
            <section>
              <h2 className="text-xl font-bold tracking-tight text-tinta">Para a conversa</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {dados.insights.map((insight) => (
                  <li
                    key={insight.chave}
                    className={`border-l-2 bg-papel px-4 py-3 leading-relaxed text-tinta-2 ${CORES_DO_TOM[insight.tom]}`}
                  >
                    {insight.texto}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-sistema text-xs text-tinta-3">
                Cada frase sai de uma distância entre meta, realizado e ritmo. Onde aparece
                &ldquo;pode ser que&rdquo;, é hipótese para checar na conversa — quem sabe é você,
                que estava lá.
              </p>
            </section>
          ) : null}

          {/* c) o KPI para atacar hoje */}
          {dados.atacarHoje ? (
            <section className="border-2 border-tinta bg-papel p-5">
              <p className="rotulo">Atacar hoje</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-tinta">
                {ROTULO_DO_INDICADOR[dados.atacarHoje.indicador]}
              </h2>
              <p className="mt-2 text-lg leading-relaxed text-tinta">
                {dados.atacarHoje.falta.unidade === "reais" ? (
                  <>
                    Faltam <strong className="numeros">{reais.format(dados.atacarHoje.falta.quantidade)}</strong>
                  </>
                ) : (
                  <>
                    {dados.atacarHoje.falta.quantidade === 1 ? "Falta" : "Faltam"}{" "}
                    <strong className="numeros">{dados.atacarHoje.falta.quantidade}</strong>{" "}
                    {dados.atacarHoje.falta.unidade}
                  </>
                )}{" "}
                para passar de{" "}
                <strong className="numeros">{porcento.format(dados.atacarHoje.pctAlvo)}</strong> —
                vale{" "}
                <strong className="numeros text-ritmo">
                  +{pontosBR.format(dados.atacarHoje.ganhoEmPontos)} pontos
                </strong>
                {dados.atacarHoje.ganhoEmReais > 0 ? (
                  <>
                    {" = "}
                    <strong className="numeros text-ritmo">
                      +{reais.format(dados.atacarHoje.ganhoEmReais)}
                    </strong>
                  </>
                ) : null}
                .
              </p>

              {/* A explicação que evita a tela parecer contraditória. */}
              {dados.piorIndicador && dados.piorIndicador !== dados.atacarHoje.indicador ? (
                <p className="mt-3 border-t border-linha pt-3 font-sistema text-sm leading-relaxed text-tinta-2">
                  O indicador mais fraco dela hoje é{" "}
                  <strong>{ROTULO_DO_INDICADOR[dados.piorIndicador]}</strong>, não este. A
                  recomendação é por <strong>retorno</strong>: aqui o esforço é curto e vira ponto
                  hoje. O ritmo diz onde ela está; isto diz onde mexer agora.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* d) o gráfico dos últimos dias com dado */}
          {dados.grafico.length > 0 ? (
            <section>
              <h2 className="text-xl font-bold tracking-tight text-tinta">Últimos dias</h2>
              <p className="mt-1 font-sistema text-sm text-tinta-3">
                Pontos projetados a cada dia, e o que ela vendeu naquele dia.
              </p>

              <Rolagem className="mt-3 border border-linha bg-papel p-5">
                <div className="flex min-w-[340px] items-end justify-between gap-2" role="img"
                  aria-label={`Pontos por dia: ${dados.grafico
                    .map((p) => `${formatarDia(p.data)}, ${pontosBR.format(p.pontos)} pontos`)
                    .join("; ")}`}
                >
                  {dados.grafico.map((ponto) => (
                    <div key={ponto.data.toISOString()} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="numeros text-xs font-semibold text-tinta">
                        {pontosBR.format(ponto.pontos)}
                      </span>
                      <div
                        className="w-full rounded-sm bg-tinta"
                        style={{
                          height: `${Math.max(4, (ponto.pontos / maiorPontuacaoNoGrafico) * 96)}px`,
                        }}
                      />
                      <span className="numeros text-[11px] text-tinta-3">
                        {formatarDia(ponto.data).slice(0, 5)}
                      </span>
                      <span
                        className={`numeros text-[11px] ${ponto.valorDoDia < 0 ? "text-critico" : "text-tinta-3"}`}
                      >
                        {reais.format(ponto.valorDoDia)}
                      </span>
                    </div>
                  ))}
                </div>
              </Rolagem>
            </section>
          ) : null}

          {/* e) a tabela dos seis indicadores, com a seta da semana */}
          <section>
            <h2 className="text-xl font-bold tracking-tight text-tinta">Os seis indicadores</h2>

            <Rolagem className="mt-3 border border-linha bg-papel" classeDaDica="px-4">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="rotulo border-b border-tinta-3">
                    <th className="col-fixa px-4 py-2 text-left font-normal">Indicador</th>
                    <th className="px-3 py-2 text-right font-normal">Meta do mês</th>
                    <th className="px-3 py-2 text-right font-normal">Realizado</th>
                    <th className="px-3 py-2 text-right font-normal">Ritmo</th>
                    <th className="px-3 py-2 text-center font-normal">vs. semana</th>
                    <th className="px-3 py-2 text-right font-normal">Média da loja</th>
                    <th className="px-3 py-2 text-right font-normal">Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {linha.porIndicador.map((item) => {
                    const seta = dados.comparacao.find((c) => c.indicador === item.indicador);
                    const daLoja = dados.mediaDaLoja.get(item.indicador);

                    return (
                      <tr key={item.indicador} className="border-b border-linha last:border-b-0">
                        <td className="col-fixa px-4 py-2.5 text-tinta">
                          {ROTULO_DO_INDICADOR[item.indicador]}
                        </td>
                        <td className="numeros px-3 py-2.5 text-right text-tinta-3">
                          {formatarIndicador(item.indicador, item.meta)}
                        </td>
                        <td className="numeros px-3 py-2.5 text-right text-tinta">
                          {formatarIndicador(item.indicador, item.acumulado)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Percentual item={item} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {seta?.direcao === 1 ? (
                            <span className="text-ritmo" title="melhorou desde a semana passada">
                              ▲
                            </span>
                          ) : seta?.direcao === -1 ? (
                            <span className="text-critico" title="piorou desde a semana passada">
                              ▼
                            </span>
                          ) : seta?.direcao === 0 ? (
                            <span className="text-tinta-3" title="igual à semana passada">
                              =
                            </span>
                          ) : (
                            <span className="font-sistema text-[11px] text-tinta-3">
                              sem base
                            </span>
                          )}
                        </td>
                        <td className="numeros px-3 py-2.5 text-right text-tinta-3">
                          {daLoja === undefined ? "—" : porcento.format(daLoja)}
                        </td>
                        <td className="numeros px-3 py-2.5 text-right font-semibold text-tinta">
                          {pontosBR.format(item.pontos)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Rolagem>

            <p className="mt-2 font-sistema text-xs text-tinta-3">
              A seta compara com o ritmo de sete dias atrás. &ldquo;Sem base&rdquo; é quando não
              havia apuração naquele dia, ou não houve medição em um dos dois.
            </p>
          </section>

          {/* f) consistência do mês */}
          <section>
            <h2 className="text-xl font-bold tracking-tight text-tinta">Consistência no mês</h2>
            <p className="mt-1 font-sistema text-sm text-tinta-3">
              Em quantos dias o resultado <em>daquele dia</em> ficou em cada faixa. Diferente do
              ritmo, que olha o acumulado.
            </p>

            <Rolagem className="mt-3 border border-linha bg-papel" classeDaDica="px-4">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="rotulo border-b border-tinta-3">
                    <th className="col-fixa px-4 py-2 text-left font-normal">Indicador</th>
                    <th className="px-3 py-2 text-right font-normal">Acima de 110%</th>
                    <th className="px-3 py-2 text-right font-normal">100% a 110%</th>
                    <th className="px-3 py-2 text-right font-normal">Abaixo de 95%</th>
                    <th className="px-3 py-2 text-right font-normal">Dias com dado</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.consistencia.map((item) => (
                    <tr key={item.indicador} className="border-b border-linha last:border-b-0">
                      <td className="col-fixa px-4 py-2.5 text-tinta">
                        {ROTULO_DO_INDICADOR[item.indicador]}
                      </td>
                      <td className="numeros px-3 py-2.5 text-right text-ritmo">{item.acimaDe110}</td>
                      <td className="numeros px-3 py-2.5 text-right text-tinta">
                        {item.entre100e110}
                      </td>
                      <td className="numeros px-3 py-2.5 text-right text-critico">
                        {item.abaixoDe95}
                      </td>
                      <td className="numeros px-3 py-2.5 text-right text-tinta-3">
                        {item.diasComDado}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Rolagem>
          </section>
        </>
      )}

      {/* g) o registro da reunião, com o acordo anterior em destaque */}
      <section>
        <h2 className="text-xl font-bold tracking-tight text-tinta">Registro da reunião</h2>

        {dados.ultimaReuniao && dados.ultimaReuniao.acordos ? (
          <div className="mt-3 border-l-2 border-vinho bg-vinho-claro px-4 py-3">
            <p className="rotulo">
              Combinado em {formatarDia(dados.ultimaReuniao.data)} — cobre antes de combinar outro
            </p>
            <p className="mt-2 leading-relaxed whitespace-pre-line text-tinta">
              {dados.ultimaReuniao.acordos}
            </p>
            {dados.ultimaReuniao.proximosPassos ? (
              <p className="mt-2 font-sistema text-sm text-tinta-2">
                Próximos passos combinados: {dados.ultimaReuniao.proximosPassos}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 border border-linha bg-papel px-4 py-3 text-tinta-2">
            Primeira reunião registrada com ela. A partir da próxima, o que foi combinado hoje
            aparece aqui em destaque.
          </p>
        )}

        <div className="mt-4 border border-linha bg-papel p-5">
          <FormularioDaReuniao
            vendedoraId={vendedora.id}
            data={hoje}
            reuniaoDeHoje={dados.reuniaoDeHoje}
          />
        </div>
      </section>

      {/* h) o histórico, colapsado */}
      {dados.historico.length > 0 ? (
        <section>
          <details className="border border-linha bg-papel">
            <summary className="cursor-pointer px-5 py-3 font-sistema text-sm font-semibold text-tinta-2">
              Reuniões anteriores ({dados.historico.length})
            </summary>
            <ul className="divide-y divide-linha border-t border-linha">
              {dados.historico.map((reuniao) => (
                <li key={reuniao.id} className="px-5 py-4">
                  <p className="rotulo">
                    {formatarDia(reuniao.data)} · {reuniao.registradoPor}
                  </p>
                  <dl className="mt-2 flex flex-col gap-2 text-sm">
                    {(
                      [
                        ["Pauta", reuniao.pauta],
                        ["Acordos", reuniao.acordos],
                        ["Observações", reuniao.observacoes],
                        ["Próximos passos", reuniao.proximosPassos],
                      ] as const
                    )
                      .filter(([, texto]) => texto.trim() !== "")
                      .map(([rotulo, texto]) => (
                        <div key={rotulo}>
                          <dt className="font-sistema text-xs text-tinta-3">{rotulo}</dt>
                          <dd className="whitespace-pre-line text-tinta-2">{texto}</dd>
                        </div>
                      ))}
                  </dl>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

    </div>
  );
}
