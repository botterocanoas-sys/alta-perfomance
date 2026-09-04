import { expect, test, type Page } from "@playwright/test";

const EXEMPLO = "tests/fixtures/relatorio-exemplo-18h39.xlsx";

async function entrar(page: Page, usuario: string, senha: string) {
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/painel");
}

test.describe("quem pode importar", () => {
  test("a gerente não tem o botão nem alcança a página", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");

    await expect(page.getByRole("link", { name: "Importar relatório" })).toHaveCount(0);

    // Digitar o endereço na mão também não passa: a regra é do servidor.
    await page.goto("/importar");
    await expect(page).toHaveURL(/\/painel$/);
  });

  test("o admin chega pela página e pelo botão do painel", async ({ page }) => {
    await entrar(page, "admin", "trocarsenha123");
    await page.getByRole("link", { name: "Importar relatório" }).click();

    await expect(page).toHaveURL(/\/importar$/);
    await expect(page.getByRole("heading", { name: "Importar relatório" })).toBeVisible();
  });
});

test.describe("prévia antes de gravar", () => {
  test("mostra as três lojas, a conferência e os nomes novos sem gravar nada", async ({ page }) => {
    await entrar(page, "admin", "trocarsenha123");
    await page.goto("/importar");

    await page.getByLabel("Arquivo do relatório (.xlsx)").setInputFiles(EXEMPLO);
    await page.getByLabel("Este arquivo é o resultado de que dia?").fill("2026-09-03");
    await page.getByRole("button", { name: "Ler e conferir" }).click();

    await expect(page.getByText("Prévia — nada foi gravado ainda")).toBeVisible();

    for (const loja of ["Barra", "Padre", "Park"]) {
      await expect(page.getByRole("heading", { name: loja, exact: true })).toBeVisible();
    }

    // A conferência contra a linha Subtotal aparece e fecha nas três lojas.
    // `exact` importa: sem ele, "não bate" casaria com "não batem" do texto
    // sobre os nomes novos.
    await expect(page.getByText("não bate", { exact: true })).toHaveCount(0);
    await expect(page.getByText("bate", { exact: true }).first()).toBeVisible();

    // Nada foi gravado ainda: o painel continua sem importação.
    const outraAba = await page.context().newPage();
    await outraAba.goto("/painel");
    await expect(outraAba.getByText("Aguardando a primeira importação")).toBeVisible();
    await outraAba.close();
  });

  test("recusa um arquivo que não é o relatório, com erro claro", async ({ page }) => {
    await entrar(page, "admin", "trocarsenha123");
    await page.goto("/importar");

    await page.getByLabel("Arquivo do relatório (.xlsx)").setInputFiles({
      name: "qualquer-coisa.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("isto não é uma planilha"),
    });
    await page.getByRole("button", { name: "Ler e conferir" }).click();

    // Escopado ao conteúdo: o Next mantém um anunciador de rota que também
    // tem role="alert".
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Não encontrei o cabeçalho da tabela",
    );
    await expect(page.getByText("Nada foi gravado")).toBeVisible();
  });
});

test.describe("gravar e conferir", () => {
  test("confirma a importação e os números aparecem na conferência", async ({ page }) => {
    await entrar(page, "admin", "trocarsenha123");
    await page.goto("/importar");

    await page.getByLabel("Arquivo do relatório (.xlsx)").setInputFiles(EXEMPLO);
    await page.getByLabel("Este arquivo é o resultado de que dia?").fill("2026-09-03");
    await page.getByRole("button", { name: "Ler e conferir" }).click();

    await expect(page.getByText("nomes novos")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar e gravar" }).click();

    await expect(page.getByText("Importação gravada.")).toBeVisible();
    await page.getByRole("link", { name: "Conferir os números" }).click();

    await expect(page).toHaveURL(/\/conferencia/);

    // O admin cai na primeira loja em ordem alfabética: Barra.
    await expect(page.getByRole("heading", { name: "Barra", level: 1 })).toBeVisible();
    await expect(page.getByText("TEREZA")).toBeVisible();

    // Primeira importação do mês: o resultado do dia é o próprio acumulado.
    await expect(page.getByText("1ª do mês").first()).toBeVisible();

    const linhaDaTereza = page.getByRole("row", { name: /TEREZA/ });
    await expect(linhaDaTereza).toContainText("2.014,24");
    await expect(linhaDaTereza).toContainText("1,14"); // P.A. = 8 peças ÷ 7 boletos
    await expect(linhaDaTereza).toContainText("70"); // conversão de 7 em 10

    // Quem tem meta zero fica fora do programa, não some do histórico.
    await expect(page.getByText("Fora do programa neste mês")).toBeVisible();
  });

  test("a gerente vê a conferência só da própria loja", async ({ page }) => {
    await entrar(page, "gerentepadre", "padre123");
    await page.goto("/conferencia");

    await expect(page.getByRole("heading", { name: "Padre", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Trocar de loja" })).toHaveCount(0);
    expect(await page.content()).not.toContain("TEREZA"); // Barra
  });

  test("o mesmo arquivo não entra duas vezes", async ({ page }) => {
    await entrar(page, "admin", "trocarsenha123");
    await page.goto("/importar");

    await page.getByLabel("Arquivo do relatório (.xlsx)").setInputFiles(EXEMPLO);
    await page.getByLabel("Este arquivo é o resultado de que dia?").fill("2026-09-04");
    await page.getByRole("button", { name: "Ler e conferir" }).click();

    await expect(page.getByText("Não dá para gravar este arquivo.")).toBeVisible();
    await expect(page.getByText("já foi importado")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar e gravar" })).toHaveCount(0);
  });
});

test.describe("pontos e bônus", () => {
  test("mostra a projeção com os dias corridos, e nunca 0% onde não houve medição", async ({
    page,
  }) => {
    await entrar(page, "admin", "trocarsenha123");
    await page.goto("/pontos");

    // A tela precisa dizer que é projeção, e o quanto do mês já correu.
    await expect(page.getByText("Isto é projeção, não bônus garantido.")).toBeVisible();
    await expect(page.getByText("3 de 30")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Vendedoras" })).toBeVisible();
    await expect(page.getByText("de 40", { exact: false }).first()).toBeVisible();

    // VERÔNICA atendeu e não vendeu: P.A. e CRM sem medição, Conversão em 0%.
    await page.goto("/pontos?loja=" + (await idDaLoja(page, "Park")));
    await expect(page.getByText("sem medição").first()).toBeVisible();
  });

  test("a gerente vê os pontos só da própria loja", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.goto("/pontos");

    await expect(page.getByRole("heading", { name: "Barra", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Trocar de loja" })).toHaveCount(0);
    await expect(page.getByText("Gerente · resultado da loja")).toBeVisible();
  });
});

/** Descobre o id de uma loja pelo seletor do admin. */
async function idDaLoja(page: Page, nome: string): Promise<string> {
  const href = await page
    .getByRole("navigation", { name: "Trocar de loja" })
    .getByRole("link", { name: nome })
    .getAttribute("href");
  return new URL(href!, "http://x").searchParams.get("loja")!;
}
