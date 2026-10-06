# Migração Google Sheets → PostgreSQL (V4)

Plano da migração dos dados do LabFlow da planilha para o Postgres. O
schema está em [`db/migrations/`](../db/migrations/).

**Estado (04/10/2026):** migração concluída e em uso. Banco `labflow`,
usuários `labflow_app` e `labflow_leitura`, backup diário, e as migrations
`001` a `010` aplicadas e testadas pelo WhatsApp (a `001` também com INSERTs
de teste: cargo inválido, telefone duplicado, coleta duplicada na terra e CT
com pré-leitura são recusados pelo banco). O módulo de concentrado está
descrito em [`concentrado.md`](concentrado.md).

## Por que migrar

- Cada consulta hoje lê a aba inteira (`Get rows` sem filtro) e filtra num
  Code node. No banco, vira um `WHERE data_prevista = CURRENT_DATE`.
- Regras que hoje são código passam a ser garantia do banco: coleta
  duplicada (`UNIQUE`), cargo válido (`CHECK`), drop ligado a uma coleta
  que existe (chave estrangeira).
- A planilha quebra com operações manuais: apagar o cabeçalho (Bug 22) ou
  zerar a aba `USUARIOS` derruba o fluxo.
- Recebimento e embarque de suco concentrado têm relações (load → lotes →
  compostas) que não cabem bem em abas.
- É a base para o dashboard (Power BI) e para a interface web.

## Migrations

| Arquivo | Conteúdo |
|---|---|
| [`001_tanques.sql`](../db/migrations/001_tanques.sql) | `usuarios`, `navios`, `coletas`, `drops`, `arquivo_amostras`, `analises`, `confirmacoes` |
| [`002_concentrado.sql`](../db/migrations/002_concentrado.sql) | `fabricas`, `itens`, `loads`, `recebimento_lotes`, `compostas`, `composta_lotes` e `testes` (TAB, Coliformes e Howard) |
| [`003_relatorio_nfc.sql`](../db/migrations/003_relatorio_nfc.sql) | view `vw_relatorio_nfc`: uma linha por tanque em cada linha do relatório do dia (NFC) |
| [`004_vw_compostas.sql`](../db/migrations/004_vw_compostas.sql) | view `vw_compostas`: load, item, fábrica e lotes de cada composta |
| [`005_confirmacao_tab.sql`](../db/migrations/005_confirmacao_tab.sql) | confirmações "sim/não" também para o TAB |
| [`006_testes_por_lote.sql`](../db/migrations/006_testes_por_lote.sql) | testes por lote (confirmação de Coliformes abrindo a composta) |
| [`007_busca_composta.sql`](../db/migrations/007_busca_composta.sql) | funções `composta_por_lotes` e `composta_do_lote` |
| [`008_embarque.sql`](../db/migrations/008_embarque.sql) | `embarques`, `embarque_amostras`, compostas de embarque, `vw_compostas` com as duas origens, funções de busca por amostra e Howard (`campos_positivos`) |
| [`009_contagens.sql`](../db/migrations/009_contagens.sql) | `contagens` (C.T e B.L por lote e por amostra), `vw_contagens` (com o alarme) e `vw_contagens_previstas` |
| [`010_testes_embarque.sql`](../db/migrations/010_testes_embarque.sql) | testes por amostra de embarque |
| [`011_leitura_finalizada.sql`](../db/migrations/011_leitura_finalizada.sql) | tabela `leituras_finalizadas` (quem finalizou a leitura de cada dia) e pendência `DIA` |
| [`012_desvio_drop.sql`](../db/migrations/012_desvio_drop.sql) | tabela `desvios_drop`, view `vw_desvios_drop` (desvio de drop em 7, 13 e 25 °C) e pendência `DESVIO` |
| [`013_views_bi.sql`](../db/migrations/013_views_bi.sql) | schema `bi` com 6 views para o Power BI (`coletas`, `leituras_nfc`, `drops`, `desvios`, `contagens`, `testes`), com a coluna `situacao` (Lido, Atrasado, Vence hoje, No prazo) e sem telefone; leitura pelo `labflow_leitura` |

Aplicadas em ordem, uma de cada vez, cada uma dentro de uma transação
(`-v ON_ERROR_STOP=1`): se algo falha, nada fica pela metade.

## De aba para tabela

| Aba | Tabela | O que muda |
|---|---|---|
| `USUARIOS` | `usuarios` | chave própria; `telefone` único e só dígitos; `cargo` validado por `CHECK` |
| — | `navios` | `O.SKY 123` vira nome `O.SKY` + viagem `123` |
| `COLETAS_TERRA` + `COLETAS_NAVIO` | `coletas` | uma tabela só, com `origem`; duplicata bloqueada por `UNIQUE` |
| `DROPS` | `drops` | ligada à coleta; guarda quem concluiu e quando |
| `BAGS_TERRA` + `POTES_NAVIO` | `arquivo_amostras` | uma tabela só; `tipo` é bag ou pote |
| `ANALISES` | `analises` | `DATE` de verdade; CT sem pré-leitura e só WORT com Superfície, garantidos por `CHECK` |
| `CONFIRMACOES_PENDENTES` | `confirmacoes` | uma por usuário; expiração vira comparação com `now()`; `payload` em `jsonb` cobre leitura e comando da IA |
| `AMOSTRAS` | — | sem uso desde a 0.8.0, não migra |
| `Painel` | — | vira view; o dashboard fica para a V5 |

## Decisões de design

- **Banco separado no mesmo container.** O `labflow-postgres` já guarda o
  banco da Evolution API. O LabFlow ganha um banco `labflow`, um usuário da
  aplicação (`labflow_app`) e um usuário somente leitura (`labflow_leitura`,
  para o Power BI). Nenhum deles enxerga o banco `evolution`. Não sobe
  container novo (servidor compartilhado e sem swap).
- **Fuso fixado no banco.** `ALTER DATABASE labflow SET timezone TO
  'America/Sao_Paulo'` faz `CURRENT_DATE` ser o "hoje" de Brasília. A
  correção do Bug 12 deixa de depender de cada Code node.
- **Regex e regras de interpretação continuam no n8n.** A migração troca só
  a camada de dados (nodes Google Sheets → Postgres). Comandos, permissões
  e IA não mudam.
- **Normalização no n8n, conferência no banco.** Tanque e nome do navio são
  gravados em maiúsculas; o banco recusa o resto com `CHECK`. O n8n separa
  `O.SKY 123` em nome e viagem (último termo numérico = viagem).
- **`UNIQUE NULLS NOT DISTINCT`** (PostgreSQL 15) na coleta: na terra o
  `navio_id` é nulo, e sem isso dois nulos contariam como diferentes e a
  duplicata passaria. A imagem `postgres:15-alpine` da stack suporta.
- **`tanque` é texto** (terra é número, navio é `1C`, `4P`; o Sheets já
  errou com tipo misto).
- **`CHECK` em vez de `ENUM`.** Acrescentar um status novo é um `ALTER
  TABLE` simples.
- **Arquitetura de tanques do navio** (Load/TT/Linha por tanque do navio)
  continua adiada para depois da migração.

## Concentrado — o que já está decidido

- **Recebimento:** a unidade é o Load (Item e Fábrica fixos) com lotes de
  0 a ~43, em dias diferentes. CT (48h) e BL (72h e 120h) por lote, com
  resultado numérico.
- **Embarque:** Navio + viagem, Linha e Fase; várias amostras (A1, A2...)
  conforme a tonelada; mais de um Load por Linha+Fase. CT e BL por amostra.
- **Compostas** (recebimento e embarque): grupo de lotes ou amostras,
  normalmente ~5, nem sempre em sequência (`1-3,5,6`).
- **TAB** (total 10 dias): 5 dias no caldo BAT, depois estria em placa por
  superfície, mais 5 dias em estufa. Consultas planejadas: "quais TABs tenho
  para espalhar hoje?" (dia 5) e "quais TABs tenho para ler hoje?" (dia 10).
- **Coliformes:** pesa no caldo, 2 dias depois estria na placa, leitura no
  3º dia. Comando simples, por exemplo `Coliformes feitos do load 33333
  lotes 1-5, item 3333`; no embarque o comando inclui navio, linha e fase.
- **Howard:** resultado em porcentagem, não positivo/negativo. É a
  porcentagem de campos positivos sobre os campos lidos. Fonte do método: o
  padrão lê 25 campos em cada uma de 2 lâminas (50 campos), e cada campo
  positivo vale 2%. O banco guarda `campos_lidos` e `campos_positivos` e
  calcula `howard_percentual`. **Confirmar quantos campos o laboratório lê:**
  com 50 campos, 1 positivo dá 2%; com 100, dá 1%.
- Os prazos de TAB e Coliformes são o que foi dito até agora e serão
  detalhados "quando for a hora de implementar"; as colunas
  `estria_prevista` e `leitura_prevista` podem mudar.

## Etapas

Cada etapa numa branch e num PR. Depois de qualquer mudança no workflow:
exportar e rodar `python scripts/audit-workflow.py LabFlow.json --public`
(0 erros).

1. **Banco e usuários no servidor.** Criar o banco `labflow`, os usuários
   `labflow_app` e `labflow_leitura`, e a credencial Postgres no n8n.
2. **Schema de tanques.** Aplicar `001_tanques.sql` e conferir as regras do
   banco com INSERTs de teste (duplicata, cargo inválido, CT com pré-leitura).
3. **Trocar os nodes, um ramo por vez.** Começar por uma consulta simples
   (drops de hoje), testando no WhatsApp a cada troca. Depois usuários e
   confirmações, coletas (coleta + 3 drops + arquivo na mesma transação),
   análises e leituras. A troca é feita numa **cópia** do workflow, e só
   vai para o ativo quando o ramo passa nos testes.
4. **Migrar dados.** Os dados atuais são fictícios: recomeçar do zero
   (cadastrando só os usuários) ou importar CSV.
5. **Concentrado.** Aplicar `002_concentrado.sql` e criar os comandos
   (regex primeiro, depois ensinar a IA), de forma incremental.
6. **Views para relatório**, por exemplo `vw_painel_analises` com situação
   Concluído, Pendente e Atrasado.
7. **Documentação:** arquitetura, comandos, troubleshooting, CHANGELOG e
   README; número da versão a decidir (0.10.0 ou 1.0.0).
8. **Backup:** rotina de `pg_dump` agendada no servidor.

## Etapa 1 — criar banco e usuários

No servidor, dentro de `~/labflow`. As senhas são geradas no servidor, como
os outros segredos da stack, e nunca saem dele.

```bash
# senhas guardadas no .env (permissão 600)
umask 077
echo "LABFLOW_DB_PASSWORD=$(openssl rand -hex 24)" >> .env
echo "LABFLOW_DB_LEITURA_PASSWORD=$(openssl rand -hex 24)" >> .env
source .env

# banco e usuários (POSTGRES_USER é o superusuário do container)
docker exec -i labflow-postgres psql -U "$POSTGRES_USER" -d postgres <<SQL
CREATE ROLE labflow_app LOGIN PASSWORD '$LABFLOW_DB_PASSWORD';
CREATE ROLE labflow_leitura LOGIN PASSWORD '$LABFLOW_DB_LEITURA_PASSWORD';
CREATE DATABASE labflow OWNER labflow_app;
REVOKE ALL ON DATABASE labflow FROM PUBLIC;
GRANT CONNECT ON DATABASE labflow TO labflow_leitura;
ALTER DATABASE labflow SET timezone TO 'America/Sao_Paulo';
SQL

# o usuário somente leitura enxerga as tabelas atuais e as futuras
docker exec -i labflow-postgres psql -U labflow_app -d labflow <<SQL
GRANT USAGE ON SCHEMA public TO labflow_leitura;
ALTER DEFAULT PRIVILEGES FOR ROLE labflow_app IN SCHEMA public GRANT SELECT ON TABLES TO labflow_leitura;
SQL

# conferir o fuso
docker exec -it labflow-postgres psql -U labflow_app -d labflow -c 'SELECT CURRENT_DATE, now();'
```

Credencial no n8n (tipo Postgres): host `labflow-postgres`, porta `5432`,
banco `labflow`, usuário `labflow_app`, SSL desativado (tráfego só dentro
da rede `labflow-net`).

Primeiro usuário, para o bot não ficar sem nenhum Admin (número fictício de
exemplo; usar o seu):

```sql
INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5511999999999', 'Seu Nome', 'Admin');
```

## Pendências para decidir

- **Comandos exatos do concentrado:** criar composta, registrar resultado de
  composta, registrar CT/BL por lote ou amostra e as consultas.
- **Quem registra resultado:** Operador ou só Admin.
- **Importar ou recomeçar do zero** os dados de teste.
- **Número da versão** da migração: 0.10.0 ou 1.0.0.
- **Campos lidos no Howard:** 50 ou 100 (ver acima).
- **Power BI:** licença (Microsoft 365 Family não inclui o Pro). O Desktop é
  gratuito para montar e testar; conectaria pelo túnel SSH, já que o
  servidor não expõe portas.
- **Backup:** onde guardar a cópia do `pg_dump`.
- **Versão do n8n:** confirmar que o node Postgres da 2.38.6 executa várias
  instruções numa transação (coleta + drops + arquivo).

## Power BI (V5, iniciado em 05/10/2026)

O Power BI lê **só o schema `bi`** (migration `013`), com o usuário somente leitura `labflow_leitura`. As views já trazem nomes legíveis, quem fez cada etapa e a coluna `situacao` calculada pelo "hoje" de Brasília.

Conexão a partir do PC (o banco não tem porta pública):

```powershell
ssh -L 15432:172.16.2.2:5432 dan@IP-DO-SERVIDOR
```

Com essa janela aberta, no Power BI Desktop: **Obter dados → Banco de dados PostgreSQL**, servidor `localhost:15432`, banco `labflow`, modo **Importar**, aba **Banco de dados** com `labflow_leitura` (senha: `LABFLOW_DB_LEITURA_PASSWORD` do `.env`). O aviso "não foi possível criptografar" pode ser aceito: o tráfego já vai dentro do túnel SSH. No Navegador, `labflow → bi`, marcar as 6 views. `172.16.2.2` é o IP interno do container (muda se ele for recriado: `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' labflow-postgres`).

**Dados de demonstração** (fictícios): `db/seeds/demo.sql` gera ~30 dias até a data em que roda (analistas Ana, Bruno e Carla (demo), tanques 80 a 95, navio DEMO STAR 900, loads 90001 a 90006); `db/seeds/limpar_demo.sql` apaga só eles. Aplicados no servidor em 05/10/2026, com backup antes.
