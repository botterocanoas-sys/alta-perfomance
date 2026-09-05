"use client";

import { Indicador } from "@prisma/client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { ROTULO_DO_INDICADOR } from "@/components/indicadores";

import { salvarMetas, type EstadoDasMetas } from "./acoes";

const INICIAL: EstadoDasMetas = { erro: null, feito: null };

export type ValoresDasMetas = {
  valorLoja: string;
  paresLoja: string;
  bolsasLoja: string;
  pa: string;
  conversao: string;
  crm: string;
  modoRateio: "PROPORCIONAL" | "IGUAL";
  valorPontoVendedora: string;
  valorPontoGerente: string;
  totalPontosAlto: string;
  pontos: { indicador: Indicador; base: string; alto: string; ativo: boolean }[];
};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-tinta px-5 py-3 font-sistema text-sm font-semibold tracking-wide text-creme disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar metas e pontuação"}
    </button>
  );
}

function Campo({
  nome,
  rotulo,
  ajuda,
  valor,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  valor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nome} className="rotulo">
        {rotulo}
      </label>
      <input
        id={nome}
        name={nome}
        type="text"
        inputMode="decimal"
        defaultValue={valor}
        required
        className="numeros rounded-sm border border-linha bg-papel px-3 py-2.5 text-base text-tinta"
      />
      {ajuda ? <p className="font-sistema text-xs text-tinta-3">{ajuda}</p> : null}
    </div>
  );
}

export function FormularioDeMetas({
  lojaId,
  mes,
  valores,
}: {
  lojaId: string;
  /** aaaa-mm */
  mes: string;
  valores: ValoresDasMetas;
}) {
  const [estado, acao] = useActionState(salvarMetas, INICIAL);

  // A soma é conferida enquanto a pessoa digita, para o erro aparecer antes do
  // envio — e é conferida de novo no servidor, que é quem manda.
  const [pontos, setPontos] = useState(valores.pontos);
  const [total, setTotal] = useState(valores.totalPontosAlto);

  const soma = pontos
    .filter((linha) => linha.ativo)
    .reduce((acumulado, linha) => acumulado + (Number(linha.alto.replace(",", ".")) || 0), 0);
  const alvo = Number(total.replace(",", ".")) || 0;
  const fecha = Math.abs(soma - alvo) < 1e-9;

  const atualizar = (indicador: Indicador, campo: "base" | "alto" | "ativo", valor: string | boolean) =>
    setPontos((antes) =>
      antes.map((linha) => (linha.indicador === indicador ? { ...linha, [campo]: valor } : linha)),
    );

  return (
    <form action={acao} className="flex flex-col gap-8">
      <input type="hidden" name="lojaId" value={lojaId} />
      <input type="hidden" name="mes" value={mes} />

      <section>
        <h2 className="text-xl font-bold tracking-tight text-tinta">Metas da loja no mês</h2>
        <p className="mt-1 font-sistema text-sm text-tinta-3">
          Valor, Pares e Bolsas são da loja e viram meta individual pelo rateio. P.A., Conversão e
          CRM são fixas e valem igual para a loja e para cada vendedora.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Campo nome="valorLoja" rotulo="Valor (R$)" valor={valores.valorLoja} />
          <Campo nome="paresLoja" rotulo="Pares" valor={valores.paresLoja} />
          <Campo nome="bolsasLoja" rotulo="Bolsas" valor={valores.bolsasLoja} />
          <Campo nome="pa" rotulo="P.A." ajuda="peças por atendimento" valor={valores.pa} />
          <Campo nome="conversao" rotulo="Conversão" ajuda="0,60 é 60%" valor={valores.conversao} />
          <Campo nome="crm" rotulo="CRM" ajuda="0,20 é 20% das vendas" valor={valores.crm} />
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="modoRateio" className="rotulo">
            Como repartir Pares e Bolsas
          </label>
          <select
            id="modoRateio"
            name="modoRateio"
            defaultValue={valores.modoRateio}
            className="max-w-sm rounded-sm border border-linha bg-papel px-3 py-2.5 text-base text-tinta"
          >
            <option value="PROPORCIONAL">Pelo peso da meta de Valor de cada uma</option>
            <option value="IGUAL">Em partes iguais</option>
          </select>
          <p className="font-sistema text-xs text-tinta-3">
            No proporcional, quem tem meta de Valor maior recebe meta de Pares maior. Onde as metas
            de Valor já são iguais, os dois modos dão no mesmo.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-tinta">Quanto vale o ponto</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Campo nome="valorPontoVendedora" rotulo="Vendedora (R$)" valor={valores.valorPontoVendedora} />
          <Campo nome="valorPontoGerente" rotulo="Gerente (R$)" valor={valores.valorPontoGerente} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="totalPontosAlto" className="rotulo">
              Total de pontos do mês
            </label>
            <input
              id="totalPontosAlto"
              name="totalPontosAlto"
              type="text"
              inputMode="decimal"
              value={total}
              onChange={(evento) => setTotal(evento.target.value)}
              required
              className="numeros rounded-sm border border-linha bg-papel px-3 py-2.5 text-base text-tinta"
            />
            <p className="font-sistema text-xs text-tinta-3">
              A soma dos pontos &ldquo;alto&rdquo; precisa fechar aqui.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-tinta">Pontos por indicador</h2>
        <p className="mt-1 font-sistema text-sm text-tinta-3">
          A distribuição pode mudar todo mês conforme a estratégia; o total, não.
        </p>

        <div className="mt-3 overflow-x-auto border border-linha bg-papel">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="rotulo border-b border-tinta-3">
                <th className="px-4 py-2 text-left font-normal">Indicador</th>
                <th className="px-3 py-2 text-right font-normal">Base (100% a 110%)</th>
                <th className="px-3 py-2 text-right font-normal">Alto (acima de 110%)</th>
                <th className="px-3 py-2 text-center font-normal">No programa</th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((linha) => (
                <tr key={linha.indicador} className="border-b border-linha last:border-b-0">
                  <td className="px-4 py-2.5 text-tinta">{ROTULO_DO_INDICADOR[linha.indicador]}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      name={`base:${linha.indicador}`}
                      aria-label={`Pontos base de ${ROTULO_DO_INDICADOR[linha.indicador]}`}
                      type="text"
                      inputMode="decimal"
                      value={linha.base}
                      onChange={(evento) => atualizar(linha.indicador, "base", evento.target.value)}
                      className="numeros w-20 rounded-sm border border-linha bg-creme px-2 py-1.5 text-right text-tinta"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      name={`alto:${linha.indicador}`}
                      aria-label={`Pontos alto de ${ROTULO_DO_INDICADOR[linha.indicador]}`}
                      type="text"
                      inputMode="decimal"
                      value={linha.alto}
                      onChange={(evento) => atualizar(linha.indicador, "alto", evento.target.value)}
                      className="numeros w-20 rounded-sm border border-linha bg-creme px-2 py-1.5 text-right text-tinta"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      name={`ativo:${linha.indicador}`}
                      value="sim"
                      aria-label={`${ROTULO_DO_INDICADOR[linha.indicador]} no programa`}
                      checked={linha.ativo}
                      onChange={(evento) =>
                        atualizar(linha.indicador, "ativo", evento.target.checked)
                      }
                    />
                    <input type="hidden" name={`ativo:${linha.indicador}`} value="nao" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p
          role="status"
          className={`mt-3 border-l-2 px-3 py-2 font-sistema text-sm ${
            fecha ? "border-ritmo bg-papel text-ritmo" : "border-critico bg-vinho-claro text-critico"
          }`}
        >
          Soma dos pontos &ldquo;alto&rdquo; dos indicadores no programa:{" "}
          <strong className="numeros">{soma.toLocaleString("pt-BR")}</strong> de{" "}
          <strong className="numeros">{alvo.toLocaleString("pt-BR")}</strong>.
          {fecha ? " Fecha." : " Não fecha — ajuste antes de salvar."}
        </p>
      </section>

      {estado.erro ? (
        <p role="alert" className="border-l-2 border-critico bg-vinho-claro px-3 py-2 font-sistema text-sm text-critico">
          {estado.erro}
        </p>
      ) : null}

      {estado.feito ? (
        <p role="status" className="border-l-2 border-ritmo bg-papel px-3 py-2 font-sistema text-sm text-ritmo">
          {estado.feito} Os pontos do mês foram recalculados.
        </p>
      ) : null}

      <div>
        <Botao />
      </div>
    </form>
  );
}
