# Arquivos de exemplo

`2074-Relatorio_Performance_por_Vendedor-18h39.xlsx` é o relatório real
extraído em 03/09/2026, guardado aqui porque a seção 11 do brief exige que o
parser seja testado contra o arquivo de verdade, não contra a descrição dele.

Ele contém nomes e números de venda reais das três lojas. O repositório é
privado; se um dia deixar de ser, este arquivo tem de sair antes.

O que ele exercita, e que uma planilha inventada não exercitaria:

- cabeçalho na linha 14, com título e 11 linhas em branco antes;
- blocos das lojas na ordem Padre, Park, Barra — não a do brief;
- a célula da Barra com espaço na frente;
- coluna Loja preenchida só na primeira linha de cada bloco;
- linha `Subtotal` fechando cada bloco, com a meta da loja;
- conversão em pontos percentuais (44,44) em vez de fração;
- Verônica com 3 oportunidades e 0 boletos — divisão por zero de verdade;
- seis pessoas com meta zero, que ficam fora do programa no mês.
