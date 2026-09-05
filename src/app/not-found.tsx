import Link from "next/link";

/**
 * Página não encontrada.
 *
 * Mora na raiz, e não dentro de `(privado)`, por um motivo que não é de
 * enfeite: só a fronteira da raiz devolve HTTP 404. Uma `not-found.tsx`
 * aninhada desenha a mesma tela mas responde 200, e aí "não existe" e "existe,
 * mas não é sua" deixariam de ser indistinguíveis para quem olha a resposta.
 *
 * É também a resposta para quem tenta abrir a vendedora de outra loja: a
 * mensagem é a mesma de "não existe", de propósito — dizer "essa é de outra
 * loja" entregaria quem trabalha lá.
 */
export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-12">
      <div>
        <p className="rotulo">Não encontrado</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta">
          Esta página não existe
        </h1>
        <p className="prosa mt-3 text-tinta-2">
          O endereço pode estar errado, ou o que você procura não está na sua loja.
        </p>
      </div>

      <div>
        <Link
          href="/painel"
          className="rounded-sm bg-tinta px-5 py-3 font-sistema text-sm font-semibold text-creme"
        >
          Voltar ao painel
        </Link>
      </div>
    </main>
  );
}
