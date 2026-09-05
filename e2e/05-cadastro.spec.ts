import { expect, test, type Page } from "@playwright/test";

/**
 * CRM, gerenciar vendedoras e metas do mês. Depende da importação de
 * `01-importacao`.
 */

async function entrar(page: Page, usuario: string, senha: string) {
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/painel");
}

test.describe("lançar CRM", () => {
  test("o painel leva à tela, que mostra as vendas do dia ao lado do campo", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.getByRole("link", { name: "Lançar CRM do dia" }).click();

    await expect(page).toHaveURL(/\/crm/);
    await expect(page.getByRole("heading", { name: "Barra", level: 1 })).toBeVisible();

    // O denominador precisa estar à vista: a gerente digita quantidade, e o app
    // divide pelas vendas.
    await expect(page.getByText(/vendas no dia|venda no dia|sem resultado no dia/).first()).toBeVisible();
    await expect(page.getByText(/o app divide pelas vendas do dia/)).toBeVisible();
  });

  test("o campo só aceita quantidade inteira", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.goto("/crm");

    // CRM é quantidade de vendas influenciadas, nunca a proporção. O campo
    // impede fração no navegador; o servidor recusa de novo, para quem mandar
    // o formulário sem passar pela tela.
    const primeiro = page.locator('input[name^="crm:"]').first();
    await expect(primeiro).toHaveAttribute("type", "number");
    await expect(primeiro).toHaveAttribute("step", "1");
    await expect(primeiro).toHaveAttribute("min", "0");
  });

  test("salva e diz que os pontos foram recalculados", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.goto("/crm?data=2026-09-03");

    const primeiro = page.locator('input[name^="crm:"]').first();
    await primeiro.fill("2");
    await page.getByRole("button", { name: "Salvar lançamentos" }).click();

    await expect(page.getByRole("status")).toContainText("recalculados");

    // Voltando à tela, o valor lançado continua lá.
    await page.reload();
    await expect(page.locator('input[name^="crm:"]').first()).toHaveValue("2");
  });

  test("a gerente não alcança a loja de outra pelo endereço", async ({ page, browser }) => {
    const aba = await browser.newContext();
    const paginaDoAdmin = await aba.newPage();
    await entrar(paginaDoAdmin, "admin", "trocarsenha123");
    const href = await paginaDoAdmin
      .getByRole("navigation", { name: "Trocar de loja" })
      .getByRole("link", { name: "Padre" })
      .getAttribute("href");
    await aba.close();

    const idDaPadre = new URL(href!, "http://x").searchParams.get("loja")!;

    await entrar(page, "gerentebarra", "barra123");
    await page.goto(`/crm?loja=${idDaPadre}`);

    // O parâmetro é ignorado: ela continua na Barra.
    await expect(page.getByRole("heading", { name: "Barra", level: 1 })).toBeVisible();
  });
});

test.describe("gerenciar vendedoras", () => {
  test("explica o que cada chave faz antes de deixar mexer", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.getByRole("link", { name: "Gerenciar vendedoras" }).click();

    await expect(page).toHaveURL(/\/vendedoras/);
    await expect(page.getByRole("heading", { name: "O que cada chave faz" })).toBeVisible();
    await expect(page.getByText(/tira a linha da carteira/)).toBeVisible();
    await expect(page.getByText(/zera o bônus em reais/)).toBeVisible();
  });

  test("desmarcar 'recebe bônus individual' salva e recalcula", async ({ page }) => {
    await entrar(page, "gerentepadre", "padre123");
    await page.goto("/vendedoras");

    const primeira = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Salvar" }) }).first();
    await primeira.getByLabel("recebe bônus individual").uncheck();
    await primeira.getByRole("button", { name: "Salvar" }).click();

    await expect(primeira.getByRole("status")).toContainText("recalculados");

    await page.reload();
    const depois = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Salvar" }) }).first();
    await expect(depois.getByLabel("recebe bônus individual")).not.toBeChecked();
  });

  test("recusa cadastrar nome repetido", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.goto("/vendedoras");

    await page.getByLabel("Nome da vendedora").fill("Tereza");
    await page.getByRole("button", { name: "Cadastrar" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText("Já existe uma TEREZA");
  });
});

test.describe("metas do mês", () => {
  test("bloqueia salvar quando a soma dos pontos não fecha", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.getByRole("link", { name: "Metas do mês" }).click();

    await expect(page).toHaveURL(/\/metas/);
    await expect(page.getByText(/Fecha\./)).toBeVisible();

    // Estraga o Valor: 15 vira 20, e a soma passa de 40.
    await page.getByLabel("Pontos alto de Valor").fill("20");
    await expect(page.getByText(/Não fecha/)).toBeVisible();

    await page.getByRole("button", { name: "Salvar metas e pontuação" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("precisa fechar em 40");
  });

  test("salva quando fecha, e recalcula o mês", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.goto("/metas");

    // Tira 1 ponto do Valor e põe em Pares: a soma continua 40.
    await page.getByLabel("Pontos alto de Valor").fill("14");
    await page.getByLabel("Pontos alto de Pares").fill("8");
    await expect(page.getByText(/Fecha\./)).toBeVisible();

    await page.getByRole("button", { name: "Salvar metas e pontuação" }).click();
    await expect(page.locator("form").getByRole("status").last()).toContainText("recalculados");
  });

  test("recusa meta zerada", async ({ page }) => {
    await entrar(page, "gerentepark", "park123");
    await page.goto("/metas");

    await page.getByLabel("Bolsas").first().fill("0");
    await page.getByRole("button", { name: "Salvar metas e pontuação" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText("precisa ser maior que zero");
  });
});
