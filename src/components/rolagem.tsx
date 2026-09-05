"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Uma tabela larga demais para a tela rola dentro do próprio bloco — nunca a
 * página — e avisa que rola.
 *
 * O aviso não é enfeite. No celular a gerente vê as três primeiras colunas e
 * nada indica que existam outras; Ritmo e Pontos, que são o que ela procura,
 * são justamente as últimas. O aviso aparece só quando há mesmo coluna
 * escondida à direita, e some assim que ela chega ao fim.
 */
export function Rolagem({
  children,
  className = "",
  classeDaDica = "",
}: {
  children: ReactNode;
  className?: string;
  classeDaDica?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [faltaVer, setFaltaVer] = useState(false);

  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;

    const medir = () => {
      const escondido = elemento.scrollWidth - elemento.clientWidth - elemento.scrollLeft;
      setFaltaVer(escondido > 2);
    };

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    elemento.addEventListener("scroll", medir, { passive: true });

    return () => {
      observador.disconnect();
      elemento.removeEventListener("scroll", medir);
    };
  }, []);

  return (
    <div className={className}>
      <div ref={caixa} className="tabela-rolante">
        {children}
      </div>
      {faltaVer ? (
        <p aria-hidden className={`rotulo border-t border-linha py-1.5 ${classeDaDica}`}>
          arraste para o lado →
        </p>
      ) : null}
    </div>
  );
}
