import { redirect } from "next/navigation";

import { sessaoAtual } from "@/lib/sessao-cookie";

import { Cabecalho } from "./cabecalho";

/**
 * Portão de entrada de tudo que exige login.
 *
 * É a primeira barreira, não a única: cada consulta ainda passa por
 * `escopoDeLojas` ou `exigirAcessoALoja`. Um layout que só esconde a tela não
 * protegeria nada se alguém chamasse a ação do servidor diretamente.
 */
export default async function LayoutPrivado({ children }: { children: React.ReactNode }) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/entrar");

  return (
    <div className="min-h-dvh">
      <Cabecalho sessao={sessao} />
      <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
