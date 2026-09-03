import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env")) process.loadEnvFile(".env");

const bancoDeTeste = process.env.DATABASE_URL_TEST;
if (!bancoDeTeste) throw new Error("DATABASE_URL_TEST não está definida.");

const PORTA = 3100;

// Em máquinas onde o Chromium já vem instalado fora do Playwright (é o caso do
// ambiente de desenvolvimento remoto), aponta direto para ele em vez de baixar
// outro. Onde o caminho não existe, o Playwright usa o navegador dele.
const CHROMIUM_DO_SISTEMA = "/opt/pw-browsers/chromium";
const navegador = existsSync(CHROMIUM_DO_SISTEMA)
  ? { launchOptions: { executablePath: CHROMIUM_DO_SISTEMA } }
  : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,

  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    trace: "retain-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...navegador } }],

  // Sobe o app já compilado, apontado para o banco de teste — nunca para o de
  // desenvolvimento.
  webServer: {
    command: `npm run build && npx next start --port ${PORTA}`,
    url: `http://127.0.0.1:${PORTA}/entrar`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, DATABASE_URL: bancoDeTeste, NODE_ENV: "production" },
  },
});
