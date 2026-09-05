import { expect, test, type Page } from "@playwright/test";

/**
 * Os arquivos desta pasta compartilham um banco só e rodam em ordem
 * alfabética — daí o prefixo numérico. `01-importacao` grava o relatório de
 * exemplo; deste ponto em diante o painel tem o que mostrar.
 */

async function entrar(page: Page, usuario: string, senha: string) {
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/painel");
}

test.describe("painel da loja", () => {
  test("avisa que o relatório de hoje ainda não foi importado", async ({ page }) => {
    // O exemplo foi importado com data de 03/09/2026, que não é hoje.
    await entrar(page, "gerentebarra", "barra123");

    await expect(page.getByText("O relatório de hoje ainda não foi importado.")).toBeVisible();
    await expect(page.getByText("03/09/2026")).toBeVisible();
  });

  test("mostra a loja no mês com as duas leituras de percentual", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");

    await expect(page.getByRole("heading", { name: /A loja em/ })).toBeVisible();
    await expect(page.getByText("dia 3 de 30")).toBeVisible();

    // As duas colunas respondem perguntas diferentes e precisam coexistir.
    await expect(page.getByRole("columnheader", { name: "% da meta" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Ritmo" })).toBeVisible();

    await expect(page.getByText("de 40", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("bônus da gerente")).toBeVisible();
  });

  test("o ranking traz selo, pontos e bônus, e leva à página da vendedora", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");

    const ranking = page.getByRole("heading", { name: "Vendedoras" });
    await expect(ranking).toBeVisible();

    const primeira = page.getByRole("link", { name: /pts/ }).first();
    await expect(primeira).toBeVisible();

    const nome = (await primeira.textContent()) ?? "";
    await primeira.click();

    await expect(page).toHaveURL(/\/vendedora\//);
    // O nome da vendedora clicada aparece como título da página dela.
    const titulo = await page.getByRole("heading", { level: 1 }).textContent();
    expect(nome).toContain(titulo?.trim() ?? "");
  });

  test("deixa explícito que o bônus é projeção", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await expect(page.getByText("de bônus projetado no total")).toBeVisible();
    await expect(page.getByText(/O bônus é.*projeção/)).toBeVisible();
  });

  test("quem tem meta zero fica fora do programa, sem sumir", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await expect(page.getByText("Fora do programa neste mês:")).toBeVisible();
  });
});

test.describe("página da vendedora", () => {
  test("a gerente não alcança vendedora de outra loja pelo id", async ({ page, browser }) => {
    // Como admin, abre uma vendedora da Padre e anota o nome e o endereço dela.
    const abaDoAdmin = await browser.newContext();
    const paginaDoAdmin = await abaDoAdmin.newPage();
    await entrar(paginaDoAdmin, "admin", "trocarsenha123");
    await paginaDoAdmin
      .getByRole("navigation", { name: "Trocar de loja" })
      .getByRole("link", { name: "Padre" })
      .click();
    // Sem esperar a troca terminar, o link clicado ainda seria o da Barra.
    await expect(paginaDoAdmin.getByRole("heading", { name: "Padre", level: 1 })).toBeVisible();

    await paginaDoAdmin.getByRole("link", { name: /pts/ }).first().click();
    await paginaDoAdmin.waitForURL("**/vendedora/**");

    const nomeNaPadre = (
      (await paginaDoAdmin.getByRole("heading", { level: 1 }).textContent()) ?? ""
    ).trim();
    const enderecoDela = new URL(paginaDoAdmin.url()).pathname;
    await abaDoAdmin.close();

    expect(nomeNaPadre.length).toBeGreaterThan(0);

    // Agora a gerente da Barra tenta o mesmo endereço.
    await entrar(page, "gerentebarra", "barra123");
    const resposta = await page.goto(enderecoDela);

    // Mesma resposta de uma vendedora que não existe — e, acima de tudo, sem
    // mostrar o nome de alguém de outra loja.
    expect(resposta?.status()).toBe(404);
    expect(await page.content(), `a página vazou ${nomeNaPadre}`).not.toContain(nomeNaPadre);
  });

  test("a gerente abre a própria vendedora e vê os seis indicadores", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await page.getByRole("link", { name: /pts/ }).first().click();

    await expect(page).toHaveURL(/\/vendedora\//);

    // Escopado à tabela dos indicadores: a de consistência repete os mesmos
    // nomes na primeira coluna.
    const tabela = page.getByRole("table").first();
    for (const indicador of ["Valor", "Pares", "Bolsas", "P.A.", "Conversão", "CRM"]) {
      await expect(tabela.getByRole("cell", { name: indicador, exact: true })).toBeVisible();
    }
    await expect(page.getByText(/A apuração fecha no último dia do mês/)).toBeVisible();
  });
});
