import { afterEach, describe, expect, it } from "vitest";

import {
  diaAnterior,
  diaEmPortoAlegre,
  diasDecorridos,
  diasNoMes,
  diaUtc,
  fimDoMes,
  formatarDia,
  formatarMes,
  horarioDeExtracao,
  mesDe,
  mesmoMes,
} from "@/lib/data";

/**
 * O fuso é o alicerce de tudo: "resultado do dia" é uma diferença entre duas
 * importações, e a meta proporcional divide pelos dias decorridos. Errar o dia
 * erra os dois.
 *
 * Estes testes existem porque o app NÃO depende de nenhuma variável de
 * ambiente de fuso. A Vercel roda em UTC e nem aceita definir `TZ` — é nome
 * reservado lá. O fuso está fixo no código e toda conversão passa por `Intl`
 * com o fuso explícito.
 */

const TZ_ORIGINAL = process.env.TZ;

afterEach(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

describe("o dia civil de Porto Alegre", () => {
  it("a extração das 18h39 pertence ao dia dela, e não ao dia seguinte em UTC", () => {
    // 18h39 em Porto Alegre (UTC-3) são 21h39 UTC do mesmo dia.
    const instante = new Date("2026-09-03T21:39:00.000Z");
    expect(diaEmPortoAlegre(instante)).toEqual(diaUtc(2026, 9, 3));
  });

  it("depois da meia-noite em UTC ainda é o dia anterior aqui", () => {
    // 23h30 de 3 de setembro em Porto Alegre já é 4 de setembro em UTC.
    // Este é o caso que faria a importação da noite cair no dia errado.
    const instante = new Date("2026-09-04T02:30:00.000Z");
    expect(diaEmPortoAlegre(instante)).toEqual(diaUtc(2026, 9, 3));
  });

  it("passada a meia-noite daqui, vira o dia novo", () => {
    // 00h10 de 4 de setembro em Porto Alegre.
    const instante = new Date("2026-09-04T03:10:00.000Z");
    expect(diaEmPortoAlegre(instante)).toEqual(diaUtc(2026, 9, 4));
  });

  it("não depende da variável TZ do servidor", () => {
    const instante = new Date("2026-09-04T02:30:00.000Z");
    const esperado = diaUtc(2026, 9, 3);

    for (const fuso of ["UTC", "Asia/Tokyo", "America/Sao_Paulo", "America/Los_Angeles"]) {
      process.env.TZ = fuso;
      expect(diaEmPortoAlegre(instante), `com TZ=${fuso}`).toEqual(esperado);
    }

    delete process.env.TZ;
    expect(diaEmPortoAlegre(instante), "sem TZ nenhuma").toEqual(esperado);
  });

  it("devolve sempre a meia-noite UTC, que é como o Postgres guarda uma data", () => {
    const dia = diaEmPortoAlegre(new Date("2026-09-03T21:39:00.000Z"));
    expect(dia.toISOString()).toBe("2026-09-03T00:00:00.000Z");
  });
});

describe("mês, dias e fronteiras", () => {
  it("mesDe leva ao primeiro dia, e mesmoMes ignora o dia", () => {
    expect(mesDe(diaUtc(2026, 9, 17))).toEqual(diaUtc(2026, 9, 1));
    expect(mesmoMes(diaUtc(2026, 9, 1), diaUtc(2026, 9, 30))).toBe(true);
    expect(mesmoMes(diaUtc(2026, 9, 30), diaUtc(2026, 10, 1))).toBe(false);
  });

  it("diasNoMes acerta mês de 30, de 31, fevereiro e ano bissexto", () => {
    expect(diasNoMes(diaUtc(2026, 9, 5))).toBe(30);
    expect(diasNoMes(diaUtc(2026, 10, 5))).toBe(31);
    expect(diasNoMes(diaUtc(2026, 2, 5))).toBe(28);
    expect(diasNoMes(diaUtc(2028, 2, 5))).toBe(29);
  });

  it("diasDecorridos conta o próprio dia — é o divisor da meta proporcional", () => {
    expect(diasDecorridos(diaUtc(2026, 9, 1))).toBe(1);
    expect(diasDecorridos(diaUtc(2026, 9, 3))).toBe(3);
    expect(diasDecorridos(diaUtc(2026, 9, 30))).toBe(30);
  });

  it("fimDoMes é o último dia, não o primeiro do seguinte", () => {
    expect(fimDoMes(diaUtc(2026, 9, 5))).toEqual(diaUtc(2026, 9, 30));
    expect(fimDoMes(diaUtc(2026, 12, 5))).toEqual(diaUtc(2026, 12, 31));
  });

  it("diaAnterior atravessa a virada do mês", () => {
    expect(diaAnterior(diaUtc(2026, 9, 1))).toEqual(diaUtc(2026, 8, 31));
    expect(diaAnterior(diaUtc(2026, 1, 1))).toEqual(diaUtc(2025, 12, 31));
  });
});

describe("o que aparece na tela", () => {
  it("formata dia e mês em português, sem escorregar de fuso", () => {
    expect(formatarDia(diaUtc(2026, 9, 3))).toBe("03/09/2026");
    expect(formatarMes(diaUtc(2026, 9, 1))).toBe("setembro de 2026");
  });
});

describe("o horário de extração no nome do arquivo", () => {
  it("lê 17h50 e 18h39 e devolve o instante em UTC", () => {
    const dia = diaUtc(2026, 9, 3);
    expect(horarioDeExtracao("2074-Relatorio-17h50.xlsx", dia)?.toISOString()).toBe(
      "2026-09-03T20:50:00.000Z",
    );
    expect(horarioDeExtracao("2074-Relatorio-18h39.xlsx", dia)?.toISOString()).toBe(
      "2026-09-03T21:39:00.000Z",
    );
  });

  it("devolve nulo quando não há horário no nome, ou o horário não existe", () => {
    const dia = diaUtc(2026, 9, 3);
    expect(horarioDeExtracao("relatorio.xlsx", dia)).toBeNull();
    expect(horarioDeExtracao("relatorio-25h00.xlsx", dia)).toBeNull();
    expect(horarioDeExtracao("relatorio-10h75.xlsx", dia)).toBeNull();
  });
});
