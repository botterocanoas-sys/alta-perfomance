import { Papel } from "@prisma/client";

import type { SessaoAtiva } from "@/lib/sessao";

import { sair } from "./acoes";

export function Cabecalho({ sessao }: { sessao: SessaoAtiva }) {
  return (
    <header className="border-b border-linha bg-creme">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div>
          <p className="rotulo">Alta Performance</p>
          <p className="text-lg font-bold tracking-tight text-tinta">
            {sessao.nome}
            <span className="ml-2 font-sistema text-xs font-normal text-tinta-3">
              {sessao.papel === Papel.ADMIN ? "administrador" : "gerente"}
            </span>
          </p>
        </div>

        <form action={sair}>
          <button
            type="submit"
            className="rounded-sm border border-linha px-3 py-2 font-sistema text-xs font-semibold tracking-wide text-tinta-2"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
