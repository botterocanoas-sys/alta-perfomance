"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { confirmar, previsualizar, type EstadoDaImportacao } from "./acoes";
import { Rolagem } from "@/components/rolagem";

const INICIAL: EstadoDaImportacao = { fase: "inicio" };

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function Botao({ children, carregando }: { children: string; carregando: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-tinta px-5 py-3 font-sistema text-sm font-semibold tracking-wide text-creme disabled:opacity-60"
    >
      {pending ? carregando : children}
    </button>
  );
}

function Erros({ estado }: { estado: EstadoDaImportacao }) {
  if (estado.fase !== "inicio" || !estado.erro) return null;

  return (
    <div role="alert" className="border-l-2 border-critico bg-vinho-claro px-4 py-3">
      <p className="font-sistema text-sm font-semibold text-critico">{estado.erro}</p>
      {estado.detalhes && estado.detalhes.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 font-sistema text-sm text-tinta-2">
          {estado.detalhes.map((detalhe) => (
            <li key={detalhe}>{detalhe}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 font-sistema text-xs text-tinta-3">Nada foi gravado.</p>
    </div>
  );
}

export function FormularioDeImportacao({ hoje }: { hoje: string }) {
  const [estadoDaPrevia, verPrevia] = useActionState(previsualizar, INICIAL);
  const [estadoDaGravacao, gravar] = useActionState(confirmar, INICIAL);

  // O arquivo fica no navegador entre a prévia e a confirmação: o servidor lê
  // de novo na hora de gravar, em vez de confiar no que a tela devolveu.
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [data, setData] = useState(hoje);
  const campoDoArquivo = useRef<HTMLInputElement>(null);

  if (estadoDaGravacao.fase === "gravado") {
    const { resumo } = estadoDaGravacao;
    return (
      <div className="flex flex-col gap-5">
        <div className="border-l-2 border-ritmo bg-papel px-4 py-4">
          <p className="font-sistema text-sm font-semibold text-ritmo">Importação gravada.</p>
          <p className="mt-2 text-tinta-2">
            {resumo.linhas} linhas do relatório de {dia.format(resumo.data)}
            {resumo.vendedorasCriadas > 0
              ? `, ${resumo.vendedorasCriadas} ${resumo.vendedorasCriadas === 1 ? "vendedora nova cadastrada" : "vendedoras novas cadastradas"}`
              : ""}
            . {resumo.dias} {resumo.dias === 1 ? "dia recalculado" : "dias recalculados"} no mês.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/conferencia"
            className="rounded-sm bg-tinta px-5 py-3 font-sistema text-sm font-semibold text-creme"
          >
            Conferir os números
          </Link>
          <Link
            href="/importar"
            className="rounded-sm border border-linha px-5 py-3 font-sistema text-sm font-semibold text-tinta-2"
          >
            Importar outro arquivo
          </Link>
        </div>
      </div>
    );
  }

  if (estadoDaPrevia.fase === "previa") {
    const { previa } = estadoDaPrevia;
    const podeGravar = previa.erros.length === 0;

    return (
      <form action={gravar} className="flex flex-col gap-6">
        {/* O arquivo e a data seguem escondidos para a ação de gravar. */}
        <input
          type="file"
          name="arquivo"
          hidden
          ref={(campo) => {
            if (!campo || !arquivo) return;
            const lista = new DataTransfer();
            lista.items.add(arquivo);
            campo.files = lista.files;
          }}
        />
        <input type="hidden" name="data" value={data} />

        <div>
          <p className="rotulo">Prévia — nada foi gravado ainda</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-tinta">
            {previa.arquivoNome}
          </h2>
          <p className="mt-1 font-sistema text-sm text-tinta-3">
            Aba {previa.aba} · cabeçalho na linha {previa.linhaDoCabecalho} · resultado do dia{" "}
            {dia.format(previa.dataReferencia)}
            {previa.extraidoEm
              ? ` · extraído às ${previa.extraidoEm.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </p>
        </div>

        {previa.erros.length > 0 ? (
          <div role="alert" className="border-l-2 border-critico bg-vinho-claro px-4 py-3">
            <p className="font-sistema text-sm font-semibold text-critico">
              Não dá para gravar este arquivo.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 font-sistema text-sm text-tinta-2">
              {previa.erros.map((erro) => (
                <li key={erro}>{erro}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {previa.avisos.length > 0 ? (
          <div className="border-l-2 border-atencao bg-papel px-4 py-3">
            <p className="font-sistema text-sm font-semibold text-atencao">
              Vale conferir, mas não impede a importação
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 font-sistema text-sm text-tinta-2">
              {previa.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {previa.lojas.map((loja) => (
            <div key={loja.lojaId} className="border border-linha bg-papel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-bold text-tinta">{loja.lojaNome}</h3>
                <p className="font-sistema text-sm text-tinta-3">
                  {loja.linhas} linhas · {loja.ativas} no programa · {loja.inativas} com meta zero
                </p>
              </div>

              {loja.metaDaLoja ? (
                <p className="mt-2 font-sistema text-sm text-tinta-2">
                  Meta no relatório: <span className="numeros">{reais.format(loja.metaDaLoja.noRelatorio)}</span>
                  {loja.metaDaLoja.cadastrada !== null ? (
                    <>
                      {" · cadastrada: "}
                      <span className="numeros">{reais.format(loja.metaDaLoja.cadastrada)}</span>
                    </>
                  ) : null}
                </p>
              ) : null}

              {loja.conferencias.length > 0 ? (
                <Rolagem className="mt-3">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="rotulo">
                        <th className="pb-2 text-left font-normal">Conferência</th>
                        <th className="pb-2 text-right font-normal">Somado</th>
                        <th className="pb-2 text-right font-normal">Subtotal</th>
                        <th className="pb-2 text-right font-normal">&nbsp;</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loja.conferencias.map((conferencia) => (
                        <tr key={conferencia.campo} className="border-t border-linha">
                          <td className="py-1.5 text-tinta-2">{conferencia.campo}</td>
                          <td className="numeros py-1.5 text-right text-tinta">{conferencia.somado}</td>
                          <td className="numeros py-1.5 text-right text-tinta">{conferencia.noSubtotal}</td>
                          <td
                            className={`py-1.5 text-right font-sistema text-xs ${conferencia.bate ? "text-ritmo" : "text-critico"}`}
                          >
                            {conferencia.bate ? "bate" : "não bate"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Rolagem>
              ) : (
                <p className="mt-2 font-sistema text-sm text-tinta-3">
                  Este bloco não tem linha Subtotal — sem conferência da soma.
                </p>
              )}
            </div>
          ))}
        </div>

        {previa.nomesNovos.length > 0 ? (
          <fieldset className="border border-linha bg-papel p-5">
            <legend className="rotulo px-1">
              {previa.nomesNovos.length} {previa.nomesNovos.length === 1 ? "nome novo" : "nomes novos"}
            </legend>
            <p className="mb-3 text-tinta-2">
              Estes nomes não batem com ninguém já cadastrado. Marque quem deve ser criada — quem
              ficar desmarcada impede a gravação, para você conferir antes.
            </p>
            <ul className="flex flex-col gap-2">
              {previa.nomesNovos.map((novo) => (
                <li key={novo.chave}>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      name="nomeNovo"
                      value={novo.chave}
                      defaultChecked
                      className="mt-1"
                    />
                    <span>
                      <span className="text-tinta">{novo.nome}</span>
                      <span className="ml-2 font-sistema text-xs text-tinta-3">
                        {novo.lojaNome} · linha {novo.linhaOriginal} ·{" "}
                        {novo.ativaNoMes
                          ? `meta de ${reais.format(novo.metaValor)}`
                          : "meta zero, fora do programa neste mês"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}

        <Erros estado={estadoDaGravacao} />

        <div className="flex flex-wrap items-center gap-3">
          {podeGravar ? <Botao carregando="Gravando…">Confirmar e gravar</Botao> : null}
          <Link
            href="/importar"
            className="rounded-sm border border-linha px-5 py-3 font-sistema text-sm font-semibold text-tinta-2"
          >
            Escolher outro arquivo
          </Link>
        </div>
      </form>
    );
  }

  return (
    <form action={verPrevia} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="arquivo" className="rotulo">
          Arquivo do relatório (.xlsx)
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".xlsx"
          required
          ref={campoDoArquivo}
          onChange={(evento) => setArquivo(evento.target.files?.[0] ?? null)}
          className="rounded-sm border border-linha bg-papel px-3 py-3 font-sistema text-sm text-tinta"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="data" className="rotulo">
          Este arquivo é o resultado de que dia?
        </label>
        <input
          id="data"
          name="data"
          type="date"
          value={data}
          onChange={(evento) => setData(evento.target.value)}
          required
          className="w-full max-w-[200px] rounded-sm border border-linha bg-papel px-3 py-3 text-base text-tinta"
        />
        <p className="font-sistema text-xs text-tinta-3">
          Vem preenchido com hoje. Mude se estiver subindo um relatório atrasado — é esta data que
          define o dia e o mês da apuração.
        </p>
      </div>

      <Erros estado={estadoDaPrevia} />

      <div>
        <Botao carregando="Lendo o arquivo…">Ler e conferir</Botao>
      </div>
    </form>
  );
}
