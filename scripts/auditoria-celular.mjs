/**
 * Auditoria de celular: 390px de largura, toque, pt-BR.
 *
 * Como rodar: suba o app apontando para o banco de teste com dados importados
 * (`npx next start --port 3100`) e depois `node scripts/auditoria-celular.mjs`.
 * Ela falha em voz alta se alguma tela vazar na horizontal ou tiver alvo de
 * toque menor que 44px.
 *
 * Duas passagens em contextos separados de propósito. A captura `fullPage` do
 * Playwright mexe nas métricas do dispositivo e derruba a emulação de toque
 * para o resto da sessão — medir alvo de toque depois dela dá falso positivo.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('scripts/capturas', { recursive: true });

const BASE = 'http://127.0.0.1:3100';
const TELAS = [
  ['painel', '/painel'],
  ['pontos', '/pontos'],
  ['crm', '/crm'],
  ['vendedoras', '/vendedoras'],
  ['metas', '/metas'],
  ['conferencia', '/conferencia'],
];

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function abrir() {
  const ctx = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/entrar`);
  await p.getByLabel('Usuário').fill('gerentebarra');
  await p.getByLabel('Senha').fill('barra123');
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.waitForURL('**/painel');
  return p;
}

async function irParaAReuniao(p) {
  await p.goto(`${BASE}/painel`);
  await p.getByRole('link', { name: /pts/ }).first().click();
  await p.waitForURL('**/vendedora/**');
  await p.waitForLoadState('networkidle');
}

// ---- passagem 1: largura e alvos de toque, sem captura ----
const medidas = await abrir();
if (!(await medidas.evaluate(() => matchMedia('(pointer: coarse)').matches))) {
  throw new Error('A emulação de toque não está valendo; a medição não vale nada.');
}

let problemas = 0;

async function medir(nome) {
  await medidas.waitForLoadState('networkidle');
  const { doc, tela, pequenos } = await medidas.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    tela: window.innerWidth,
    pequenos: [...document.querySelectorAll('a[href], button, summary, input')]
      .map((e) => {
        // Na caixa de marcar o alvo é o rótulo, que a envolve: é nele que o
        // dedo acerta. Medir só a caixinha acusaria um problema que não existe.
        const alvo = e.type === 'checkbox' ? (e.closest('label') ?? e) : e;
        return {
          tag: e.tagName + (e.type === 'checkbox' ? ' (rótulo)' : ''),
          txt: (alvo.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30),
          h: Math.round(alvo.getBoundingClientRect().height),
        };
      })
      .filter((a) => a.h > 0 && a.h < 44),
  }));

  const vaza = doc > tela + 1;
  if (vaza || pequenos.length) problemas += 1;
  console.log(
    `${nome.padEnd(12)} doc=${doc} tela=${tela} ${vaza ? 'VAZA NA HORIZONTAL' : 'ok'}` +
      `  alvos<44px: ${pequenos.length}`,
  );
  pequenos.slice(0, 6).forEach((a) => console.log('   ', a.tag, `${a.h}px`, JSON.stringify(a.txt)));
}

for (const [nome, url] of TELAS) {
  await medidas.goto(BASE + url);
  await medir(nome);
}
await irParaAReuniao(medidas);
await medir('reuniao');

// telas sem sessão: login e a página que não existe
const anonimo = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
const semSessao = await anonimo.newPage();
for (const [nome, url] of [['entrar', '/entrar'], ['nao-encontrado', '/pagina-que-nao-existe']]) {
  const r = await semSessao.goto(BASE + url);
  const doc = await semSessao.evaluate(() => document.documentElement.scrollWidth);
  console.log(`${nome.padEnd(12)} doc=${doc} status=${r.status()}`);
  await semSessao.screenshot({ path: `scripts/capturas/celular-${nome}.png`, fullPage: true });
}
await anonimo.close();

// ---- passagem 2: capturas de tela inteira, em contexto novo ----
const fotos = await abrir();
for (const [nome, url] of TELAS) {
  await fotos.goto(BASE + url);
  await fotos.waitForLoadState('networkidle');
  await fotos.screenshot({ path: `scripts/capturas/celular-${nome}.png`, fullPage: true });
}
await irParaAReuniao(fotos);
await fotos.screenshot({ path: 'scripts/capturas/celular-reuniao.png', fullPage: true });

await navegador.close();
console.log(problemas === 0 ? '\ntudo certo em 390px' : `\n${problemas} tela(s) com problema`);
