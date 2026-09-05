"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { salvarCrm, type EstadoDoCrm } from "./acoes";

const INICIAL: EstadoDoCrm = { erro: null, salvos: null };

export type LinhaDoCrm = {
  vendedoraId: string;
  nome: string;
  /** Vendas do dia, para a gerente conferir o denominador na hora. */
  boletosDoDia: number | null;
  lancado: number | null;
};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-tinta px-5 py-3 font-sistema text-sm font-semibold tracking-wide text-creme disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar lançamentos"}
    </button>
  );
}

export function FormularioDeCrm({
  lojaId,
  data,
  linhas,
}: {
  lojaId: string;
  data: string;
  linhas: LinhaDoCrm[];
}) {
  const [estado, acao] = useActionState(salvarCrm, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="lojaId" value={lojaId} />
      <input type="hidden" name="data" value={data} />

      <ul className="divide-y divide-linha border border-linha bg-papel">
        {linhas.map((linha) => (
          <li key={linha.vendedoraId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <label htmlFor={`crm:${linha.vendedoraId}`} className="min-w-[8rem] flex-1 text-tinta">
              {linha.nome}
            </label>

            <span className="font-sistema text-xs text-tinta-3">
              {linha.boletosDoDia === null
                ? "sem resultado no dia"
                : `${linha.boletosDoDia} ${linha.boletosDoDia === 1 ? "venda" : "vendas"} no dia`}
            </span>

            <input
              id={`crm:${linha.vendedoraId}`}
              name={`crm:${linha.vendedoraId}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              defaultValue={linha.lancado ?? ""}
              placeholder="0"
              className="numeros w-24 rounded-sm border border-linha bg-creme px-3 py-2.5 text-right text-base text-tinta"
            />
          </li>
        ))}
      </ul>

      {estado.erro ? (
        <p role="alert" className="border-l-2 border-critico bg-vinho-claro px-3 py-2 font-sistema text-sm text-critico">
          {estado.erro}
        </p>
      ) : null}

      {estado.salvos !== null ? (
        <p role="status" className="border-l-2 border-ritmo bg-papel px-3 py-2 font-sistema text-sm text-ritmo">
          {estado.salvos} {estado.salvos === 1 ? "lançamento salvo" : "lançamentos salvos"}. Os
          pontos do mês foram recalculados.
        </p>
      ) : null}

      <div>
        <Botao />
      </div>
    </form>
  );
}
