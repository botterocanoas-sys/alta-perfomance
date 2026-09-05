import { expect, test, type Page } from "@playwright/test";

/**
 * A tela da reunião. Depende da importação feita em `01-importacao`.
 */

async function entrar(page: Page, usuario: string, senha: string) {
  await page.goto("/entrar");
  await page.getByLabel("Usuário").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/painel");
}

async function abrirPrimeiraVendedora(page: Page) {
  await page.getByRole("link", { name: /pts/ }).first().click();
  await page.waitForURL("**/vendedora/**");
}

test.describe("o veredito e o que atacar", () => {
  test("abre com o veredito em uma frase e o selo com a cobertura", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await abrirPrimeiraVendedora(page);

    await expect(page.getByText(/Hoje está com/)).toBeVisible();
    await expect(page.getByText(/de bônus projetado no mês/)).toBeVisible();

    // A cobertura da medição fica visível ao lado do selo, sempre.
    await expect(page.getByText(/de 40 pontos medidos/).first()).toBeVisible();

    await expect(page.getByText(/A apuração fecha no último dia do mês/)).toBeVisible();
  });

  test("o card de atacar hoje diz quanto falta e quanto vale", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await abrirPrimeiraVendedora(page);

    const card = page.getByText("Atacar hoje");
    await expect(card).toBeVisible();
    await expect(page.getByText(/para passar de/)).toBeVisible();
    await expect(page.getByText(/vale/).first()).toBeVisible();
  });

  test("explica por que o recomendado não é o indicador mais fraco", async ({ page }) => {
    await entrar(page, "admin", "trocarsenha123");

    // Percorre as vendedoras até achar uma em que os dois divergem — é o caso
    // que a explicação existe para cobrir.
    await page.goto("/painel");
    const quantas = await page.getByRole("link", { name: /pts/ }).count();

    let achou = false;
    for (let i = 0; i < quantas; i += 1) {
      await page.goto("/painel");
      await page.getByRole("link", { name: /pts/ }).nth(i).click();
      await page.waitForURL("**/vendedora/**");

      if (await page.getByText(/O indicador mais fraco dela hoje é/).isVisible().catch(() => false)) {
        achou = true;
        await expect(page.getByText(/A recomendação é por/)).toBeVisible();
        await expect(page.getByText(/O ritmo diz onde ela está/)).toBeVisible();
        break;
      }
    }

    // Se em nenhuma delas houver divergência, o teste não tem o que provar —
    // mas a ausência precisa ser deliberada, não silenciosa.
    expect(
      achou || quantas === 0,
      "nenhuma vendedora com pior indicador diferente do recomendado",
    ).toBeTruthy();
  });
});

test.describe("os insights", () => {
  test("traz frases curtas, cada uma com um número", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await abrirPrimeiraVendedora(page);

    await expect(page.getByRole("heading", { name: "Para a conversa" })).toBeVisible();

    const frases = page.getByRole("heading", { name: "Para a conversa" }).locator("xpath=../ul/li");
    const quantas = await frases.count();

    expect(quantas).toBeGreaterThanOrEqual(1);
    expect(quantas).toBeLessThanOrEqual(5);

    // Toda frase precisa carregar um número: é a regra da seção 9.
    for (let i = 0; i < quantas; i += 1) {
      const texto = (await frases.nth(i).textContent()) ?? "";
      expect(texto, `frase ${i + 1} sem número`).toMatch(/\d/);
      // E nada de elogio ou crítica solta.
      expect(texto).not.toMatch(/parabéns|ótim|excelente|péssim|ruim demais/i);
    }
  });

  test("deixa claro que hipótese é hipótese", async ({ page }) => {
    await entrar(page, "admin", "trocarsenha123");
    await abrirPrimeiraVendedora(page);

    await expect(
      page.getByText(/é hipótese para checar na conversa/),
    ).toBeVisible();
  });
});

test.describe("os números da conversa", () => {
  test("traz o gráfico, os seis indicadores e a consistência", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await abrirPrimeiraVendedora(page);

    await expect(page.getByRole("heading", { name: "Últimos dias" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Pontos por dia/ })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Os seis indicadores" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "vs. semana" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Média da loja" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Consistência no mês" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Acima de 110%" })).toBeVisible();
  });
});

test.describe("o registro da reunião", () => {
  test("na primeira vez diz que não há acordo anterior, e salva", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await abrirPrimeiraVendedora(page);

    await expect(page.getByText(/Primeira reunião registrada com ela/)).toBeVisible();

    await page.getByLabel("Pauta").fill("Conversão travada na primeira semana.");
    await page.getByLabel("Acordos").fill("Oferecer segundo par em todo atendimento.");
    await page.getByLabel("Próximos passos").fill("Reportar amanhã quantas ofertas fez.");
    await page.getByRole("button", { name: "Salvar registro" }).click();

    await expect(page.getByRole("status")).toContainText("Registro salvo");
  });

  test("salvar de novo no mesmo dia atualiza o mesmo registro", async ({ page }) => {
    await entrar(page, "gerentebarra", "barra123");
    await abrirPrimeiraVendedora(page);

    await expect(page.getByText(/Já existe registro de hoje/)).toBeVisible();
    await expect(page.getByLabel("Acordos")).toHaveValue(
      "Oferecer segundo par em todo atendimento.",
    );

    await page.getByLabel("Observações").fill("Chegou animada.");
    await page.getByRole("button", { name: "Salvar registro" }).click();
    await expect(page.getByRole("status")).toContainText("Registro salvo");

    await page.reload();
    await expect(page.getByLabel("Observações")).toHaveValue("Chegou animada.");
  });

  test("recusa salvar com todos os campos em branco", async ({ page }) => {
    await entrar(page, "gerentepadre", "padre123");
    await abrirPrimeiraVendedora(page);

    await page.getByRole("button", { name: "Salvar registro" }).click();
    // Escopado ao formulário: o Next mantém um anunciador de rota com role="alert".
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "Escreva ao menos um campo",
    );
  });
});
