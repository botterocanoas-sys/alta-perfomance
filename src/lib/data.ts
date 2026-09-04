/**
 * Datas do app, sempre no fuso de Porto Alegre.
 *
 * A extração do relatório sai às 17h50 ou 18h39 — perto o suficiente da virada
 * do dia em UTC para que usar UTC jogasse a importação da noite para o dia
 * seguinte. Por isso "dia" aqui é sempre o dia civil de Porto Alegre.
 *
 * Convenção interna: um "dia civil" é representado por um `Date` na meia-noite
 * UTC daquela data — é assim que o Postgres guarda uma coluna `date` e é assim
 * que o Prisma a devolve. Nunca compare esses valores com `new Date()` direto.
 */

export const FUSO = "America/Sao_Paulo";

/** Monta a meia-noite UTC de um dia civil. `mes` é 1-12, como a pessoa escreve. */
export function diaUtc(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** O dia civil de Porto Alegre correspondente a um instante. */
export function diaEmPortoAlegre(instante: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);

  const pegar = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((parte) => parte.type === tipo)!.value);

  return diaUtc(pegar("year"), pegar("month"), pegar("day"));
}

/** O primeiro dia do mês a que um dia civil pertence. */
export function mesDe(dia: Date): Date {
  return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), 1));
}

export function mesmoMes(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

/** Quantos dias corridos o mês tem. Setembro devolve 30. */
export function diasNoMes(dia: Date): number {
  return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Quantos dias do mês já correram até esta data, contando o próprio dia.
 * Dia 3 de setembro devolve 3 — é o divisor da meta proporcional.
 */
export function diasDecorridos(dia: Date): number {
  return dia.getUTCDate();
}

/** O último instante de um dia civil, para montar intervalos fechados. */
export function fimDoMes(dia: Date): Date {
  return diaUtc(dia.getUTCFullYear(), dia.getUTCMonth() + 2, 0);
}

export function diaAnterior(dia: Date): Date {
  return new Date(dia.getTime() - 24 * 60 * 60 * 1000);
}

/** "03/09/2026" — para a tela, nunca para comparação. */
export function formatarDia(dia: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(dia);
}

/** "setembro de 2026" */
export function formatarMes(mes: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(mes);
}

/**
 * Lê o horário de extração do nome do arquivo, quando ele existe.
 * "2074-Relatorio_Performance_por_Vendedor-17h50.xlsx" → 17h50 do dia informado.
 * Devolve nulo quando o nome não traz horário — o app não depende disso.
 */
export function horarioDeExtracao(nomeDoArquivo: string, dia: Date): Date | null {
  const achado = /(\d{1,2})h(\d{2})/i.exec(nomeDoArquivo);
  if (!achado) return null;

  const hora = Number(achado[1]);
  const minuto = Number(achado[2]);
  if (hora > 23 || minuto > 59) return null;

  // Porto Alegre está em UTC-3 o ano inteiro desde que o Brasil acabou com o
  // horário de verão, em 2019.
  return new Date(dia.getTime() + (hora + 3) * 3_600_000 + minuto * 60_000);
}
