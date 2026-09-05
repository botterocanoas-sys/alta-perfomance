"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { alterarMinhaSenha, redefinirSenhaDeOutro, type EstadoDaSenha } from "./acoes";

const INICIAL: EstadoDaSenha = { erro: null, feito: false };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-tinta px-5 py-3 font-sistema text-sm font-semibold tracking-wide text-creme disabled:opacity-60"
    >
      {pending ? "Trocando…" : "Trocar senha"}
    </button>
  );
}

/**
 * O `id` leva o prefixo do formulário porque os dois formulários desta página
 * têm campos de mesmo nome. Com id repetido o `for` do rótulo aponta sempre
 * para o primeiro, e clicar no rótulo de baixo põe o cursor no campo de cima.
 */
function Campo({
  nome,
  rotulo,
  ajuda,
  prefixo,
}: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  prefixo: string;
}) {
  const id = `${prefixo}-${nome}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <input
        id={id}
        name={nome}
        type="password"
        required
        autoComplete={nome === "senhaAtual" ? "current-password" : "new-password"}
        className="max-w-sm rounded-sm border border-linha bg-papel px-3 py-2.5 text-base text-tinta"
      />
      {ajuda ? <p className="font-sistema text-xs text-tinta-3">{ajuda}</p> : null}
    </div>
  );
}

export function FormularioDeSenha({ minimo }: { minimo: number }) {
  const [estado, acao] = useActionState(alterarMinhaSenha, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-5">
      <Campo prefixo="minha" nome="senhaAtual" rotulo="Senha atual" />
      <Campo
        prefixo="minha"
        nome="senhaNova"
        rotulo="Senha nova"
        ajuda={`No mínimo ${minimo} caracteres. Uma frase curta que só você saiba serve bem.`}
      />
      <Campo prefixo="minha" nome="repeticao" rotulo="Repita a senha nova" />

      {estado.erro ? (
        <p
          role="alert"
          className="max-w-sm border-l-2 border-critico bg-vinho-claro px-3 py-2 font-sistema text-sm text-critico"
        >
          {estado.erro}
        </p>
      ) : null}

      {estado.feito ? (
        <p
          role="status"
          className="max-w-sm border-l-2 border-ritmo bg-papel px-3 py-2 font-sistema text-sm text-ritmo"
        >
          Senha trocada. Se você estava logada em outro celular ou computador, aquela sessão caiu —
          é preciso entrar de novo lá com a senha nova.
        </p>
      ) : null}

      <div>
        <Botao />
      </div>
    </form>
  );
}

/**
 * Só o admin vê isto. Serve para o caso de uma gerente esquecer a senha: sem
 * esta tela, a única saída seria abrir o banco de dados.
 */
export function FormularioDeRedefinicao({
  pessoas,
  minimo,
}: {
  pessoas: { id: string; nome: string; username: string }[];
  minimo: number;
}) {
  const [estado, acao] = useActionState(redefinirSenhaDeOutro, { erro: null, feito: null });
  const [alvo, setAlvo] = useState(pessoas[0]?.id ?? "");

  const escolhida = pessoas.find((pessoa) => pessoa.id === alvo);

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="alvoNome" value={escolhida?.nome ?? ""} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="alvoUsuarioId" className="rotulo">
          Quem esqueceu a senha
        </label>
        <select
          id="alvoUsuarioId"
          name="alvoUsuarioId"
          value={alvo}
          onChange={(evento) => setAlvo(evento.target.value)}
          className="max-w-sm rounded-sm border border-linha bg-papel px-3 py-2.5 text-base text-tinta"
        >
          {pessoas.map((pessoa) => (
            <option key={pessoa.id} value={pessoa.id}>
              {pessoa.nome} ({pessoa.username})
            </option>
          ))}
        </select>
      </div>

      <Campo
        prefixo="dela"
        nome="senhaNova"
        rotulo="Senha nova para ela"
        ajuda={`No mínimo ${minimo} caracteres. Combine pessoalmente e peça para ela trocar depois.`}
      />
      <Campo prefixo="dela" nome="repeticao" rotulo="Repita a senha nova para ela" />

      {estado.erro ? (
        <p
          role="alert"
          className="max-w-sm border-l-2 border-critico bg-vinho-claro px-3 py-2 font-sistema text-sm text-critico"
        >
          {estado.erro}
        </p>
      ) : null}

      {estado.feito ? (
        <p
          role="status"
          className="max-w-sm border-l-2 border-ritmo bg-papel px-3 py-2 font-sistema text-sm text-ritmo"
        >
          {estado.feito} Todas as sessões dela caíram.
        </p>
      ) : null}

      <div>
        <BotaoDeRedefinir />
      </div>
    </form>
  );
}

function BotaoDeRedefinir() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-tinta px-5 py-3 font-sistema text-sm font-semibold tracking-wide text-creme disabled:opacity-60"
    >
      {pending ? "Definindo…" : "Definir senha"}
    </button>
  );
}
