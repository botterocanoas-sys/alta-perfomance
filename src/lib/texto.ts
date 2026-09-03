/**
 * Normaliza um texto vindo da planilha para comparação.
 *
 * O relatório não é consistente: a célula da Barra vem com espaço na frente
 * (" PORTO A. - RS - BARRA SHOPPING") e os nomes vêm com acento em umas linhas
 * e sem em outras. Comparar as versões normalizadas evita criar loja ou
 * vendedora duplicada por causa de um espaço ou de um til.
 *
 * "  Verônica  " → "VERONICA"
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
