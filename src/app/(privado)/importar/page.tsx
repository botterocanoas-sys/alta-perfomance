import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { diaEmPortoAlegre, formatarDia } from "@/lib/data";
import { ehAdmin } from "@/lib/escopo";
import { sessaoAtual } from "@/lib/sessao-cookie";

import { FormularioDeImportacao } from "./formulario";

export const metadata = { title: "Importar relatório · Alta Performance" };

export default async function Importar() {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  // A regra vale no servidor: esconder o link no painel não protege a rota.
  if (!ehAdmin(sessao)) redirect("/painel");

  const hoje = diaEmPortoAlegre();

  const importacoes = await prisma.importacao.findMany({
    orderBy: [{ dataReferencia: "desc" }, { criadaEm: "desc" }],
    take: 10,
    include: {
      usuario: { select: { nome: true } },
      _count: { select: { linhas: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="rotulo">Administrador</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          Importar relatório
        </h1>
        <p className="mt-2 max-w-prose text-tinta-2">
          O arquivo é lido e conferido antes de qualquer gravação. Você vê o que vai entrar — quantas
          lojas, quantas vendedoras, quais nomes são novos — e só então confirma.
        </p>
      </section>

      <section className="border border-linha bg-papel p-5 sm:p-6">
        <FormularioDeImportacao hoje={hoje.toISOString().slice(0, 10)} />
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-tinta">Importações anteriores</h2>

        {importacoes.length === 0 ? (
          <p className="mt-3 border border-linha bg-papel p-5 text-tinta-2">
            Nenhuma importação ainda. Suba o relatório de hoje para o app começar a calcular.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-linha border border-linha bg-papel">
            {importacoes.map((importacao) => (
              <li key={importacao.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                <span className="numeros text-tinta">{formatarDia(importacao.dataReferencia)}</span>
                <span className="font-sistema text-sm text-tinta-2">{importacao.arquivoNome}</span>
                <span className="ml-auto font-sistema text-xs text-tinta-3">
                  {importacao._count.linhas} linhas · {importacao.usuario.nome}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
