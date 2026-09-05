import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança.
 *
 * São a resposta a três ataques que não dependem de bug nenhum no app:
 *
 *  - `X-Frame-Options: DENY` impede que o app seja aberto dentro de um quadro
 *    de outro site, onde um botão invisível por cima faria a gerente clicar em
 *    "arquivar" achando que clicava em outra coisa;
 *  - `Referrer-Policy` evita que o endereço da página — que carrega o id da
 *    vendedora — vá parar no log de qualquer site externo;
 *  - `X-Content-Type-Options: nosniff` faz o navegador respeitar o tipo que o
 *    servidor declarou, em vez de adivinhar;
 *  - `Permissions-Policy` desliga câmera, microfone e localização, que este app
 *    nunca usa.
 *
 * O app não é público: `robots` já vai como `noindex` no `layout.tsx`, e
 * `X-Robots-Tag` repete isso no cabeçalho, para quem lê só o cabeçalho.
 */
const CABECALHOS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // HSTS: depois da primeira visita, o navegador nunca mais tenta http.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // O parser do relatório roda no servidor e usa a biblioteca xlsx.
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [{ source: "/:caminho*", headers: CABECALHOS }];
  },
};

export default nextConfig;
