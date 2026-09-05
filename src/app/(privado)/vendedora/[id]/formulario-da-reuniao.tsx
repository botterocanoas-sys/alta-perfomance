"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { Reuniao } from "@/lib/reuniao";

import { salvarReuniao, type EstadoDaReuniao } from "./acoes";

const INICIAL: EstadoDaReuniao = { erro: null, salvoEm: null };

const CAMPOS = [
  {
    nome: "pauta",
    rotulo: "Pauta",
    ajuda: "O que você quer tratar hoje com ela.",
  },
  {
    nome: "acordos",
    rotulo: "Acordos",
    ajuda: "O que ficou combinado. É isto que você vai cobrar na próxima.",
  },
  {
    nome: "observacoes",
    rotulo: "Observações",
    ajuda: "O que você percebeu e não cabe nos números.",
  },
  {
    nome: "proximosPassos",
    rotulo: "Próximos passos",
    ajuda: "O que ela faz até amanhã.",
  },
] as const;

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-tinta px-5 py-3 font-sistema text-sm font-semibold tracking-wide text-creme disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar registro"}
    </button>
  );
}

export function FormularioDaReuniao({
  vendedoraId,
  data,
  reuniaoDeHoje,
}: {
  vendedoraId: string;
  /** Dia da reunião, no formato aaaa-mm-dd. */
  data: string;
  reuniaoDeHoje: Reuniao | null;
}) {
  const [estado, acao] = useActionState(salvarReuniao, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="vendedoraId" value={vendedoraId} />
      <input type="hidden" name="data" value={data} />

      {CAMPOS.map((campo) => (
        <div key={campo.nome} className="flex flex-col gap-1.5">
          <label htmlFor={campo.nome} className="rotulo">
            {campo.rotulo}
          </label>
          <textarea
            id={campo.nome}
            name={campo.nome}
            rows={3}
            defaultValue={reuniaoDeHoje?.[campo.nome] ?? ""}
            className="rounded-sm border border-linha bg-papel px-3 py-2.5 text-base leading-relaxed text-tinta"
          />
          <p className="font-sistema text-xs text-tinta-3">{campo.ajuda}</p>
        </div>
      ))}

      {estado.erro ? (
        <p role="alert" className="border-l-2 border-critico bg-vinho-claro px-3 py-2 font-sistema text-sm text-critico">
          {estado.erro}
        </p>
      ) : null}

      {estado.salvoEm ? (
        <p role="status" className="border-l-2 border-ritmo bg-papel px-3 py-2 font-sistema text-sm text-ritmo">
          Registro salvo às {estado.salvoEm}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Botao />
        {reuniaoDeHoje ? (
          <span className="font-sistema text-xs text-tinta-3">
            Já existe registro de hoje. Salvar de novo atualiza o mesmo.
          </span>
        ) : null}
      </div>
    </form>
  );
}
