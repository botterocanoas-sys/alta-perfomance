import type { Metadata, Viewport } from "next";
import { Archivo, Fraunces, IBM_Plex_Mono } from "next/font/google";

import "./globals.css";

/**
 * Três vozes, como pede a seção 10 do brief: serifada com peso nos títulos,
 * uma sans legível para o corpo e a interface, e uma monoespaçada para os
 * números — que é onde a leitura precisa alinhar coluna com coluna.
 *
 * As fontes são baixadas no build e servidas pelo próprio app: nada de
 * requisição para o Google no celular da gerente, no meio da loja.
 */
const titulos = Fraunces({
  subsets: ["latin"],
  // Variável: o navegador interpola o peso, e o app carrega um arquivo só.
  weight: "variable",
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--fonte-titulos",
  display: "swap",
});

const corpo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fonte-corpo",
  display: "swap",
});

const numeros = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fonte-numeros",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Alta Performance Bottero",
    template: "%s · Alta Performance",
  },
  description: "Acompanhamento diário do programa de incentivo das lojas Bottero.",
  // Ferramenta interna: não deve aparecer em busca nenhuma.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // A gerente usa isso no celular, no chão de loja: precisa poder dar zoom.
  maximumScale: 5,
  themeColor: "#efe9dd",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${titulos.variable} ${corpo.variable} ${numeros.variable}`}
    >
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
