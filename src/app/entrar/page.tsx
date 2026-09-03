import { redirect } from "next/navigation";

import { sessaoAtual } from "@/lib/sessao-cookie";

import { FormularioDeLogin } from "./formulario";

export const metadata = { title: "Entrar · Alta Performance" };

export default async function PaginaDeLogin() {
  // Quem já está logado não precisa ver a tela de login de novo.
  if (await sessaoAtual()) redirect("/painel");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-10">
        <p className="rotulo mb-3">Bottero · Rio Grande do Sul</p>
        <h1 className="text-4xl leading-tight font-bold tracking-tight text-tinta">
          Alta Performance
        </h1>
        <p className="mt-3 text-tinta-2">
          Acompanhamento diário das metas e do bônus das vendedoras.
        </p>
      </div>

      <div className="border border-linha bg-papel p-6 shadow-sm">
        <FormularioDeLogin />
      </div>

      <p className="mt-6 font-sistema text-xs leading-relaxed text-tinta-3">
        Ferramenta interna das lojas Barra, Padre e Park. Cada gerente enxerga
        apenas a própria loja.
      </p>
    </main>
  );
}
