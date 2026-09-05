"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Quando algo quebra de verdade.
 *
 * Nada de "erro inesperado" e um código hexadecimal: a tela diz o que
 * aconteceu, o que já foi feito (nada) e o que fazer agora. O detalhe técnico
 * vai para o console, não para a gerente.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha na tela:", error);
  }, [error]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="rotulo">Algo deu errado</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta">
          Não consegui montar esta tela
        </h1>
        <p className="prosa mt-3 text-tinta-2">
          Nenhum dado foi alterado. Tente de novo — se continuar, é provável que o problema esteja
          no banco de dados, e vale avisar quem cuida do app.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-sm bg-tinta px-5 py-3 font-sistema text-sm font-semibold text-creme"
        >
          Tentar de novo
        </button>
        <Link
          href="/painel"
          className="rounded-sm border border-linha bg-papel px-5 py-3 font-sistema text-sm font-semibold text-tinta-2"
        >
          Voltar ao painel
        </Link>
      </div>

      {error.digest ? (
        <p className="font-sistema text-xs text-tinta-3">
          Código para quem for investigar: <span className="numeros">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
