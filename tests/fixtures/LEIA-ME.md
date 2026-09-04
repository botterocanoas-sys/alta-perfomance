# Arquivos de exemplo

`relatorio-exemplo-18h39.xlsx` é o relatório real extraído em 03/09/2026, com
os **nomes trocados por fictícios** e todos os números preservados. A seção 11
do brief exige que o parser seja testado contra o arquivo de verdade, não
contra a descrição dele — e o nome de quem vendeu não faz diferença nenhuma
para o parser.

Os nomes fictícios mantêm de propósito as armadilhas de grafia do original:

- `VERÔNICA` — acento;
- `SIMÃO VITOR` — til e nome composto;
- `ANA CAROLINA` — nome composto com espaço.

O que este arquivo exercita, e que uma planilha inventada não exercitaria:

- cabeçalho na linha 14, com título e 11 linhas em branco antes;
- blocos das lojas na ordem Padre, Park, Barra;
- a célula da Barra com espaço na frente;
- coluna `Loja` preenchida só na primeira linha de cada bloco;
- linha `Subtotal` fechando cada bloco, trazendo a meta da loja;
- `Conversao` em pontos percentuais (44,44) em vez de fração;
- `Total` como soma de todas as categorias, e não só de calçados;
- uma vendedora ativa (meta 17.500) com 3 oportunidades e 0 boletos;
- seis linhas com meta zero, fora do programa naquele mês.

Os arquivos sintéticos usados nos outros casos — outra ordem de blocos, coluna
faltando, dois dias seguidos para o delta — são montados em `tests/planilha.ts`.
