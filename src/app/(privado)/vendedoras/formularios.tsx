"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  alterarVendedora,
  criarVendedora,
  type EstadoDasVendedoras,
} from "./acoes";

const INICIAL: EstadoDasVendedoras = { erro: null, feito: null };

export type VendedoraNaTela = {
  id: string;
  nome: string;
  contaComoVendedora: boolean;
  recebeBonusVendedora: boolean;
  arquivada: boolean;
  /** Meta do relatório no mês corrente, para explicar quem está no programa. */
  metaDoMes: number | null;
};

function Botao({ children, carregando }: { children: string; carregando: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-tinta px-4 py-2.5 font-sistema text-sm font-semibold text-creme disabled:opacity-60"
    >
      {pending ? carregando : children}
    </button>
  );
}

function Aviso({ estado }: { estado: EstadoDasVendedoras }) {
  if (estado.erro) {
    return (
      <p role="alert" className="border-l-2 border-critico bg-vinho-claro px-3 py-2 font-sistema text-sm text-critico">
        {estado.erro}
      </p>
    );
  }
  if (estado.feito) {
    return (
      <p role="status" className="border-l-2 border-ritmo bg-papel px-3 py-2 font-sistema text-sm text-ritmo">
        {estado.feito} Os pontos do mês foram recalculados.
      </p>
    );
  }
  return null;
}

export function FormularioDeCadastro({ lojaId }: { lojaId: string }) {
  const [estado, acao] = useActionState(criarVendedora, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="lojaId" value={lojaId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
          <label htmlFor="nome" className="rotulo">
            Nome da vendedora
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            className="rounded-sm border border-linha bg-papel px-3 py-2.5 text-base text-tinta"
          />
        </div>
        <Botao carregando="Cadastrando…">Cadastrar</Botao>
      </div>

      <p className="font-sistema text-xs text-tinta-3">
        Normalmente não é preciso: elas nascem sozinhas na primeira importação em que aparecem no
        relatório. Cadastre à mão só quem ainda não apareceu.
      </p>

      <Aviso estado={estado} />
    </form>
  );
}

/**
 * A carteira inteira num componente só, com um aviso único acima das listas.
 *
 * O aviso já morou dentro da linha, e era um erro: arquivar tira a pessoa da
 * lista de ativas, a linha desmonta e a confirmação vai junto — a gerente
 * clicava, a pessoa sumia e nada dizia que tinha dado certo. Aqui em cima ele
 * sobrevive à lista se remontar.
 */
export function Carteira({
  ativas,
  arquivadas,
}: {
  ativas: VendedoraNaTela[];
  arquivadas: VendedoraNaTela[];
}) {
  const [estado, acao] = useActionState(alterarVendedora, INICIAL);

  return (
    <>
      <section>
        <h2 className="text-xl font-bold tracking-tight text-tinta">
          Na carteira
          <span className="ml-2 font-sistema text-sm font-normal text-tinta-3">
            {ativas.length} {ativas.length === 1 ? "pessoa" : "pessoas"}
          </span>
        </h2>

        <div className="mt-3 empty:mt-0">
          <Aviso estado={estado} />
        </div>

        {ativas.length === 0 ? (
          <p className="mt-3 border border-linha bg-papel p-5 text-tinta-2">
            Nenhuma vendedora ainda. Elas nascem sozinhas na primeira importação do relatório.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-linha border border-linha bg-papel">
            {ativas.map((vendedora) => (
              <LinhaDaVendedora key={vendedora.id} vendedora={vendedora} acao={acao} />
            ))}
          </ul>
        )}
      </section>

      {arquivadas.length > 0 ? (
        <section>
          <details className="border border-linha bg-papel">
            <summary className="cursor-pointer px-5 py-3 font-sistema text-sm font-semibold text-tinta-2">
              Arquivadas ({arquivadas.length})
            </summary>
            <ul className="divide-y divide-linha border-t border-linha">
              {arquivadas.map((vendedora) => (
                <LinhaDaVendedora key={vendedora.id} vendedora={vendedora} acao={acao} />
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </>
  );
}

function LinhaDaVendedora({
  vendedora,
  acao,
}: {
  vendedora: VendedoraNaTela;
  acao: (formData: FormData) => void;
}) {
  const [editandoNome, setEditandoNome] = useState(false);

  const noPrograma = (vendedora.metaDoMes ?? 0) > 0 && vendedora.contaComoVendedora;

  return (
    <li className="px-5 py-4">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="vendedoraId" value={vendedora.id} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {editandoNome ? (
            <input
              name="nome"
              defaultValue={vendedora.nome}
              aria-label={`Novo nome de ${vendedora.nome}`}
              className="min-w-[10rem] flex-1 rounded-sm border border-linha bg-papel px-3 py-2 text-base text-tinta"
            />
          ) : (
            <span className="min-w-[10rem] flex-1">
              <span className={vendedora.arquivada ? "text-tinta-3 line-through" : "text-tinta"}>
                {vendedora.nome}
              </span>
              <span className="ml-3 font-sistema text-xs text-tinta-3">
                {vendedora.arquivada
                  ? "arquivada"
                  : noPrograma
                    ? "no programa neste mês"
                    : vendedora.contaComoVendedora
                      ? "sem meta no relatório deste mês"
                      : "fora da carteira"}
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setEditandoNome((antes) => !antes)}
            className="rounded-sm border border-linha px-3 py-2 font-sistema text-xs font-semibold text-tinta-2"
          >
            {editandoNome ? "Cancelar" : "Editar nome"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-linha pt-3">
          <label className="flex items-center gap-2 font-sistema text-sm text-tinta-2">
            <input
              type="checkbox"
              name="contaComoVendedora"
              value="sim"
              defaultChecked={vendedora.contaComoVendedora}
            />
            conta como vendedora
          </label>

          <label className="flex items-center gap-2 font-sistema text-sm text-tinta-2">
            <input
              type="checkbox"
              name="recebeBonusVendedora"
              value="sim"
              defaultChecked={vendedora.recebeBonusVendedora}
            />
            recebe bônus individual
          </label>

          <label className="flex items-center gap-2 font-sistema text-sm text-tinta-2">
            <input type="checkbox" name="arquivada" value="sim" defaultChecked={vendedora.arquivada} />
            arquivada
          </label>

          <div className="ml-auto">
            <Botao carregando="Salvando…">Salvar</Botao>
          </div>
        </div>

        {/* Os checkboxes desmarcados não são enviados; estes campos garantem o
            "não" chegar ao servidor. */}
        <input type="hidden" name="contaComoVendedora" value="nao" />
        <input type="hidden" name="recebeBonusVendedora" value="nao" />
        <input type="hidden" name="arquivada" value="nao" />
      </form>
    </li>
  );
}
