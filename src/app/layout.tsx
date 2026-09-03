import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Alta Performance Bottero",
  description: "Acompanhamento diário do programa de incentivo das lojas Bottero.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // A gerente usa isso no celular, no chão de loja.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
