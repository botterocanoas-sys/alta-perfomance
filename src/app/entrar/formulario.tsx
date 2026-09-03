"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { entrar, type EstadoDoLogin } from "./acoes";

const INICIAL: EstadoDoLogin = { erro: null };

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-sm bg-tinta px-4 py-3 font-sistema text-sm font-semibold tracking-wide text-creme transition-opacity disabled:opacity-60"
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function FormularioDeLogin() {
  const [estado, acao] = useActionState(entrar, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="rotulo">
          Usuário
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="rounded-sm border border-linha bg-papel px-3 py-3 text-base text-tinta"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha" className="rotulo">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-sm border border-linha bg-papel px-3 py-3 text-base text-tinta"
        />
      </div>

      {estado.erro ? (
        <p
          role="alert"
          className="border-l-2 border-critico bg-vinho-claro px-3 py-2 font-sistema text-sm text-critico"
        >
          {estado.erro}
        </p>
      ) : null}

      <BotaoEntrar />
    </form>
  );
}
