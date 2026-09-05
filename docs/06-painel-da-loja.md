# Etapa 5 — Painel da loja

A home da gerente (seção 8.2 do brief), na ordem em que a conversa acontece:
os números são de quando? · como está a loja no mês? · como está cada uma?

---

## 1. O aviso de importação vem antes de qualquer número

Três estados possíveis, sempre visíveis no topo:

| Estado | O que a tela diz |
|---|---|
| Nunca importou | "Aguardando a primeira importação do mês", com o que fazer |
| Importou, mas não hoje | "O relatório de hoje ainda não foi importado" + a data dos números |
| Importou hoje | A data e o horário de extração |

O segundo caso é o que mais importa. Sem ele, a gerente pode fazer a reunião
inteira em cima de dados de anteontem sem perceber. "Hoje" é o dia civil de
Porto Alegre, não UTC.

---

## 2. Duas leituras de percentual, lado a lado

A seção 8.2 pede "meta / realizado / % / % da tendência". São perguntas
diferentes, e a tabela mostra as duas:

| Coluna | Responde |
|---|---|
| **% da meta** | quanto do mês inteiro já foi feito |
| **Ritmo** | isso comparado ao ponto do mês em que estamos |

No dia 3 de 30, 10% da meta cumprida é **100% do ritmo**. Mostrar só a primeira
faria toda a loja parecer em colapso na primeira semana; mostrar só a segunda
esconderia o quanto ainda falta em números absolutos.

---

## 3. O ritmo e os selos

O brief pede um selo por tendência, mas cada pessoa tem seis tendências — uma
por indicador. Juntamos numa **média ponderada pelos pontos que cada indicador
vale**:

```
ritmo = Σ (percentual do indicador × pontos "alto" dele) ÷ Σ (pontos "alto")
```

Valor pesa 15 e Conversão pesa 3, então ir mal no faturamento derruba o ritmo
mais do que ir mal na conversão. É a própria régua do programa decidindo o
peso, em vez de uma média simples que trataria os seis como iguais.

**Indicadores sem medição ficam de fora da conta.** Contá-los como zero
puniria a pessoa por ausência de dado — quem não teve nenhum boleto no dia não
"foi mal" no P.A., simplesmente não teve P.A. Se nenhum indicador tiver
percentual, o ritmo é nulo e o selo vira "sem dados".

Os cortes são os do brief:

| Ritmo | Selo |
|---|---|
| ≥ 100% | no ritmo |
| 80% a 99,9% | atenção |
| < 80% | crítico |

⚠️ **Esta ponderação é escolha minha, não do brief** — ele não definiu como
juntar seis tendências numa só. Se preferir média simples, ou o percentual de
um indicador só, é uma linha em `ritmoDoMes`.

---

## 4. O ranking

Ordenado por pontos, com desempate pelo ritmo. Cada linha traz posição, nome,
selo com o percentual, pontos e bônus projetado, e leva à página individual.

Abaixo da lista, o total de bônus projetado da loja e um lembrete de que é
**projeção**: a apuração fecha no último dia do mês.

Quem tem meta zero no relatório aparece numa linha à parte, em texto menor:
está no histórico, mas fora do programa naquele mês.

---

## 5. A página da vendedora, por enquanto

Existe para o ranking não levar a lugar nenhum: nome, pontos, selo, bônus e a
tabela dos seis indicadores. O veredito do dia em uma frase, os insights, o
gráfico dos últimos 7 dias e o registro da reunião são a **etapa 6**.

O `id` vem da URL, então a página passa por `exigirAcessoAVendedora` antes de
qualquer coisa. Uma vendedora de outra loja responde **404, igual a uma que não
existe** — e há teste conferindo que o nome dela não aparece em lugar nenhum da
resposta.

---

## 6. Botões que ainda não existem

O brief pede também "lançar CRM do dia", "gerenciar vendedoras" e "metas do
mês". São a etapa 8; não coloquei botões que levariam a páginas em branco. O
painel diz isso em uma linha, em vez de fingir que estão lá.

---

## 7. Testes

173 de regra e 25 de navegador.

| Arquivo | Cobre |
|---|---|
| `tests/pontuacao.test.ts` | A ponderação do ritmo, indicadores sem medição ficando de fora, e os cortes 100% / 80% dos selos |
| `e2e/02-painel.spec.ts` | O aviso de importação atrasada, as duas colunas de percentual, o ranking levando à vendedora, e o 404 sem vazar nome |

### Sobre a ordem dos arquivos e2e

Os arquivos de `e2e/` compartilham um banco só e rodam em ordem alfabética —
daí o prefixo numérico. `01-importacao` grava o relatório de exemplo; deste
ponto em diante o painel tem o que mostrar. Sem o prefixo, a ordem seria
acidental e a suíte quebraria conforme os arquivos fossem renomeados.
