import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// O Next lê o .env sozinho; o Vitest não. Sem isto, DATABASE_URL_TEST não
// chegaria aos testes.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Os testes de navegador são do Playwright (`npm run test:e2e`), não do Vitest.
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/preparar-banco.ts"],
    setupFiles: ["./tests/ambiente.ts"],
    // As suítes compartilham um único banco de teste; rodar em paralelo faria
    // uma apagar os dados da outra no meio do caminho.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
