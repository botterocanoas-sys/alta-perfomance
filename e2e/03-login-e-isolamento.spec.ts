import { expect, test } from "@playwright/test";

/**
 * O mesmo isolamento dos testes de unidade, agora pelo navegador: é assim que a
 * gerente usa o app, e é aqui que apareceria uma brecha que só existe na
 * camada HTTP — uma página que esquecesse de checar a sessão, por exemplo.
 */

/**
 * Os arquivos desta pasta compartilham um banco só e rodam em ordem
 * alfabética, por isso o prefixo numérico: `01-importacao` grava o relatório
 * de exemplo, e daí em diante o painel tem o que mostrar. Estes nomes são os
 * do arquivo de exemplo, uma vendedora por loja.
 */
const NO_RANKING = { barra: "TEREZA", padre: "ELISA", park: "IRENE" };

async function entrar(page: import("@playwright/test").Page, usuario: string, senha: string) {
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/painel");
}

test.describe("porta de entrada", () => {
  test("sem sessão, qualquer endereço cai no login", async ({ page }) => {
    await page.goto("/painel");
    await expect(page).toHaveURL(/\/entrar$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("senha errada não entra e explica o erro", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Usuário").fill("gerentebarra");
    await page.getByLabel("Senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();

    // Escopado ao formulário: o Next mantém um anunciador de rota que também
    // tem role="alert", e um seletor solto pegaria os dois.
    await expect(page.locator("main").getByRole("alert")).toContainText("Usuário ou senha incorretos");
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("o cookie de sessão é httpOnly e não viaja para outro site", async ({ page, context }) => {
    await entrar(page, "gerentebarra", "barra123");

    const cookie = (await context.cookies()).find((c) => c.name === "alta_sessao");
    expect(cookie, "o cookie de sessão não foi criado").toBeDefined();
    expect(cookie!.httpOnly, "o cookie precisa ser httpOnly").toBe(true);
    expect(cookie!.sameSite).toBe("Lax");

    // Fora do alcance de qualquer JavaScript da página.
    expect(await page.evaluate(() => document.cookie)).not.toContain("alta_sessao");
  });
});

test.describe("isolamento por loja no navegador", () => {
  test("a gerente da Barra vê a Barra e a carteira dela", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");

    await expect(page.getByRole("heading", { name: "Barra", level: 1 })).toBeVisible();
    await expect(page.getByText(NO_RANKING.barra)).toBeVisible();
  });

  test("a gerente da Barra não vê ninguém de Padre nem de Park", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");

    const pagina = await page.content();
    for (const nome of [NO_RANKING.padre, NO_RANKING.park]) {
      expect(pagina, `a página vazou o nome ${nome}`).not.toContain(nome);
    }
    expect(pagina).not.toContain("Padre Chagas");
    expect(pagina).not.toContain("ParkShopping");
  });

  test("trocar a loja no endereço não muda o que a gerente vê", async ({ page, browser }) => {
    // Descobre o id REAL da Barra entrando como admin numa aba separada. Um id
    // inventado seria um teste fraco: o interessante é usar um id que existe.
    const abaDoAdmin = await browser.newContext();
    const paginaDoAdmin = await abaDoAdmin.newPage();
    await entrar(paginaDoAdmin, "admin", "trocarsenha123");
    const href = await paginaDoAdmin
      .getByRole("navigation", { name: "Trocar de loja" })
      .getByRole("link", { name: "Barra" })
      .getAttribute("href");
    await abaDoAdmin.close();

    const idDaBarra = new URL(href!, "http://x").searchParams.get("loja");
    expect(idDaBarra, "não consegui descobrir o id da Barra").toBeTruthy();

    await entrar(page, "gerentepark", "park123");
    await expect(page.getByRole("heading", { name: "Park", level: 1 })).toBeVisible();

    // A gerente da Park pede a Barra pelo id real. O parâmetro é ignorado.
    await page.goto(`/painel?loja=${idDaBarra}`);
    await expect(page.getByRole("heading", { name: "Park", level: 1 })).toBeVisible();
    await expect(page.getByText(NO_RANKING.park)).toBeVisible();
    expect(await page.content()).not.toContain(NO_RANKING.barra);

    // Um id inventado dá no mesmo.
    await page.goto("/painel?loja=00000000-0000-0000-0000-000000000000");
    await expect(page.getByRole("heading", { name: "Park", level: 1 })).toBeVisible();
  });

  test("a gerente não recebe o seletor de lojas", async ({ page }) => {
    await entrar(page, "gerentepadre", "padre123");
    await expect(page.getByRole("navigation", { name: "Trocar de loja" })).toHaveCount(0);
  });

  test("o admin troca de loja e vê as três", async ({ page }) => {
    await entrar(page, "admin", "trocarsenha123");

    const seletor = page.getByRole("navigation", { name: "Trocar de loja" });
    await expect(seletor).toBeVisible();

    await seletor.getByRole("link", { name: "Padre" }).click();
    await expect(page.getByRole("heading", { name: "Padre", level: 1 })).toBeVisible();
    await expect(page.getByText(NO_RANKING.padre)).toBeVisible();

    await seletor.getByRole("link", { name: "Park" }).click();
    await expect(page.getByRole("heading", { name: "Park", level: 1 })).toBeVisible();
    await expect(page.getByText(NO_RANKING.park)).toBeVisible();
  });
});

test.describe("sair", () => {
  test("encerra a sessão e o botão de voltar não reabre o painel", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");

    await page.getByRole("button", { name: "Sair" }).click();
    await page.waitForURL("**/entrar");

    await page.goto("/painel");
    await expect(page).toHaveURL(/\/entrar$/);
  });
});
