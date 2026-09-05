import { expect, test, type Page } from "@playwright/test";

/**
 * Trocar a própria senha. Roda por último de propósito: ele muda a senha da
 * gerente do Park, e os arquivos anteriores dependem das senhas do seed.
 */

async function entrar(page: Page, usuario: string, senha: string) {
  // Limpa o cookie antes: com sessão viva, /entrar redireciona para o painel e
  // o formulário nem aparece.
  await page.context().clearCookies();
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

const NOVA = "calcado numero 37";

test.describe("trocar senha", () => {
  test("recusa quando a senha atual está errada", async ({ page }) => {
    await entrar(page, "gerentepark", "park123");
    await page.waitForURL("**/painel");
    await page.getByRole("link", { name: "Trocar senha" }).click();

    await expect(page).toHaveURL(/\/senha$/);
    await page.getByLabel("Senha atual").fill("chutei");
    await page.getByLabel("Senha nova", { exact: true }).fill(NOVA);
    await page.getByLabel("Repita a senha nova").fill(NOVA);
    await page.getByRole("button", { name: "Trocar senha" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText("não confere");

    // E a senha antiga continua valendo.
    await page.goto("/entrar");
    await entrar(page, "gerentepark", "park123");
    await expect(page).toHaveURL(/\/painel$/);
  });

  test("troca, avisa que as outras sessões caíram, e a senha antiga para de valer", async ({
    page,
    browser,
  }) => {
    // Uma segunda sessão, no "celular", que precisa cair.
    const outroAparelho = await browser.newContext();
    const celular = await outroAparelho.newPage();
    await entrar(celular, "gerentepark", "park123");
    await celular.waitForURL("**/painel");

    await entrar(page, "gerentepark", "park123");
    await page.waitForURL("**/painel");
    await page.goto("/senha");

    await page.getByLabel("Senha atual").fill("park123");
    await page.getByLabel("Senha nova", { exact: true }).fill(NOVA);
    await page.getByLabel("Repita a senha nova").fill(NOVA);
    await page.getByRole("button", { name: "Trocar senha" }).click();

    await expect(page.locator("main").getByRole("status")).toContainText("Senha trocada");

    // Quem trocou continua dentro.
    await page.goto("/painel");
    await expect(page.getByRole("heading", { name: "Park", level: 1 })).toBeVisible();

    // O outro aparelho foi para a tela de login.
    await celular.goto("/painel");
    await expect(celular).toHaveURL(/\/entrar/);
    await outroAparelho.close();

    // A senha antiga não entra mais; a nova entra.
    await entrar(page, "gerentepark", "park123");
    await expect(page.locator("main").getByRole("alert")).toContainText("incorretos");

    await entrar(page, "gerentepark", NOVA);
    await expect(page).toHaveURL(/\/painel$/);
  });

  test("a troca não alcança o login de mais ninguém", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await expect(page).toHaveURL(/\/painel$/);
    await expect(page.getByRole("heading", { name: "Barra", level: 1 })).toBeVisible();
  });
});

test.describe("quando alguém esquece a senha", () => {
  test("a gerente não vê o formulário de definir a senha dos outros", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.waitForURL("**/painel");
    await page.goto("/senha");

    await expect(page.getByRole("heading", { name: "Trocar senha" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alguém esqueceu a senha" })).toHaveCount(0);
    await expect(page.getByLabel("Quem esqueceu a senha")).toHaveCount(0);
  });

  test("o admin define a senha da gerente, e a nova entra", async ({ page }) => {
    await entrar(page, "admin", "trocarsenha123");
    await page.waitForURL("**/painel");
    await page.goto("/senha");

    await expect(page.getByRole("heading", { name: "Alguém esqueceu a senha" })).toBeVisible();
    await page.getByLabel("Quem esqueceu a senha").selectOption({ label: "Gerente Barra (gerentebarra)" });

    const NOVA = "a nova da barra";
    await page.getByLabel("Senha nova para ela", { exact: true }).fill(NOVA);
    await page.getByLabel("Repita a senha nova para ela").fill(NOVA);
    await page.getByRole("button", { name: "Definir senha" }).click();

    await expect(page.locator("main").getByRole("status")).toContainText("Senha de");

    await entrar(page, "gerentebarra", "barra123");
    await expect(page.locator("main").getByRole("alert")).toContainText("incorretos");

    await entrar(page, "gerentebarra", NOVA);
    await page.waitForURL("**/painel");
    await expect(page.getByRole("heading", { name: "Barra", level: 1 })).toBeVisible();
  });
});
