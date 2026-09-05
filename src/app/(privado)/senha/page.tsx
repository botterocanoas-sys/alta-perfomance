import { prisma } from "@/lib/db";
import { ehAdmin } from "@/lib/escopo";
import { MINIMO_DA_SENHA } from "@/lib/sessao";
import { sessaoAtual } from "@/lib/sessao-cookie";

import { FormularioDeRedefinicao, FormularioDeSenha } from "./formulario";

export const metadata = { title: "Trocar senha · Alta Performance" };

/**
 * Trocar a própria senha.
 *
 * Cada um troca a sua, e só a sua: a ação lê o usuário da sessão e nunca de um
 * campo do formulário. Não existe "trocar a senha de outra pessoa" nesta tela —
 * com quatro logins, isso se resolve conversando, e não abrindo uma porta.
 */
export default async function Senha() {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  // Só o admin recebe a lista, e mesmo assim a ação confere o papel de novo.
  const outros = ehAdmin(sessao)
    ? await prisma.usuario.findMany({
        where: { ativo: true, id: { not: sessao.usuarioId } },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, username: true },
      })
    : [];

  return (
    <div className="flex max-w-2xl flex-col gap-7">
      <section>
        <p className="rotulo">Sua conta</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          Trocar senha
        </h1>
        <p className="prosa mt-3 text-tinta-2">
          Você está logada como <strong className="text-tinta">{sessao.username}</strong>. A senha
          nova vale só para este login.
        </p>
      </section>

      <section className="border border-linha bg-papel p-5">
        <FormularioDeSenha minimo={MINIMO_DA_SENHA} />
      </section>

      {outros.length > 0 ? (
        <section>
          <h2 className="text-xl font-bold tracking-tight text-tinta">
            Alguém esqueceu a senha
          </h2>
          <p className="prosa mt-2 text-tinta-2">
            Você é o administrador, então pode definir uma senha nova para outra pessoa. Todas as
            sessões dela caem na hora — inclusive no celular. Combine a senha pessoalmente e peça
            para ela trocar assim que entrar.
          </p>

          <div className="mt-3 border border-linha bg-papel p-5">
            <FormularioDeRedefinicao pessoas={outros} minimo={MINIMO_DA_SENHA} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
