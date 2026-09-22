# Deploy no VPS

Este documento descreve a migração do LabFlow de uma stack Docker local
(no PC) para uma stack própria e isolada rodando num VPS Linux
compartilhado, cedido por um amigo administrador do servidor. Cobre a
arquitetura de infraestrutura, as decisões de segurança, o processo de
migração e os problemas encontrados nele.

Para a arquitetura do fluxo n8n (nodes, regras de negócio), ver
`docs/arquitetura.md`. Para bugs de lógica do workflow, ver
`docs/troubleshooting.md`. Este documento cobre só a camada de
infraestrutura.

---

## Motivação

A stack local (Docker no PC) funcionava, mas tinha duas limitações para um
projeto de portfólio e para uso real:

- **Dependia da máquina ficar ligada.** Se o PC desligasse ou dormisse, o
  bot do WhatsApp parava de responder.
- **Não demonstrava experiência com deploy remoto**, uma peça importante
  para a transição de carreira em infraestrutura/TI.

Um amigo (chamado neste documento apenas de "o administrador do VPS")
ofereceu acesso a um VPS que já hospeda outros serviços dele (um n8n
próprio, uma API, sites), com acesso por SSH e sem custo por 2 anos. Ver
`vps-ssh-setup` (repositório separado) para o processo de acesso SSH em
si.

---

## Decisão: stack isolada, não compartilhada

O VPS já roda uma stack n8n do administrador (`menuhub-n8n`,
`menuhub-postgres`, `menuhub-proxy` com Caddy, entre outros containers).
Em vez de usar essa instância, o LabFlow ganhou sua **própria stack
completa e isolada**:

| Item | Compartilhado com o administrador? |
|---|---|
| n8n | Não — instância própria |
| Postgres | Não — instância própria |
| Evolution API | Não — instância própria |
| Rede Docker | Não — rede própria (`labflow-net`) |
| Servidor físico (VPS) | Sim |

**Motivo:** um erro na configuração do LabFlow (por exemplo, um
`docker compose down -v` acidental) não deve afetar os serviços do
administrador, e vice-versa. Também evita qualquer risco de misturar
dados entre os dois projetos.

---

## Arquitetura da infraestrutura

```
VPS (Ubuntu, 2 vCPU, ~8 GB RAM)
│
├── Stack do administrador (não gerenciada por este projeto)
│   ├── menuhub-proxy (Caddy) — único ponto exposto à internet, portas 80/443
│   ├── menuhub-n8n
│   ├── menuhub-postgres
│   └── outros containers (API, sites)
│
└── Stack do LabFlow (~/labflow/docker-compose.yml) — rede "labflow-net"
    ├── labflow-postgres   (postgres:15-alpine)      — sem porta publicada
    ├── labflow-n8n        (n8nio/n8n:2.38.6)         — 127.0.0.1:5679 -> 5678
    └── labflow-evolution  (evolution-api, por digest) — 127.0.0.1:8080 -> 8080
```

**Nenhum serviço do LabFlow é exposto publicamente na internet.** Todo
acesso administrativo (editor do n8n, Manager do Evolution) é feito por
**túnel SSH**, nunca por um domínio público. Isso mantém a superfície de
ataque mínima: quem não tem uma chave SSH autorizada no servidor não
alcança nenhum painel do LabFlow.

### Por que portas só em `127.0.0.1`

Publicar uma porta como `5679:5678` no `docker-compose.yml` a exporia para
**toda a rede**, e o firewall (`ufw`), se existir, não filtra portas
publicadas diretamente pelo Docker (o Docker manipula as regras do
`iptables` por conta própria). Publicar como `127.0.0.1:5679:5678`
restringe o acesso a processos rodando dentro do próprio servidor — de
fora, a porta simplesmente não responde, mesmo sem firewall nenhum.

### Por que sem swap, os containers têm `mem_limit`

O VPS não tem partição de swap configurada. Sem swap, se a memória
acabar, o kernel do Linux mata processos (OOM killer) de forma
imprevisível — podendo derrubar um container do administrador em vez de
um do LabFlow. Por isso, cada serviço da stack tem um teto de memória
(`mem_limit` no compose), para que um vazamento de memória do LabFlow
afete só os próprios containers.

---

## Versionamento das imagens

| Serviço | Imagem | Como foi fixada | Por quê |
|---|---|---|---|
| Postgres | `postgres:15-alpine` | Tag de versão principal | Igual à versão usada localmente |
| n8n | `n8nio/n8n:2.38.6` | Tag exata | Mesma versão validada localmente, evita quebra por mudança de comportamento numa atualização automática |
| Evolution API | `evoapicloud/evolution-api@sha256:...` | **Digest** (hash da imagem) | A tag `latest` local tinha 4 meses; usar o digest garante que o servidor roda **exatamente** a mesma imagem testada localmente, e não uma versão mais nova e potencialmente incompatível puxada na hora do deploy |

Fixar por tag garante reprodutibilidade até a próxima vez que alguém
publicar uma imagem com aquela tag; fixar por digest garante
reprodutibilidade permanente, porque aponta para um conteúdo de imagem
específico e imutável.

---

## Gestão de segredos

Todo segredo da stack (senha do Postgres, chave da API do Evolution,
chave de criptografia do n8n) foi **gerado no próprio servidor**, nunca
digitado nem transmitido por chat, e-mail ou qualquer canal fora do
terminal SSH:

```bash
umask 077
cat > .env <<EOF
POSTGRES_USER=evolution
POSTGRES_DB=evolution
POSTGRES_PASSWORD=$(openssl rand -hex 24)
AUTHENTICATION_API_KEY=$(openssl rand -hex 32)
N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF
```

- `umask 077` garante que o arquivo nasce com permissão `600` (só o dono
  lê), sem uma janela de tempo em que outros usuários do servidor
  poderiam lê-lo.
- `openssl rand -hex N` gera segredos aleatórios fortes, sem depender de
  senhas "pensadas" e mais fracas.
- O `.env` nunca sai do servidor: nem sobe pro GitHub (fica no
  `.gitignore`), nem é copiado para o PC.

### Evolution API: chave em credencial, não no workflow

Antes da migração, a chave da Evolution API estava escrita diretamente no
cabeçalho `apikey` de cada node HTTP Request do workflow. Isso significa
que qualquer exportação do workflow (`.json`) levava a chave em texto
puro junto. Corrigido: a chave passou a viver numa **Credencial** do tipo
Header Auth dentro do n8n (`Evolution API (servidor)`), referenciada
pelos nodes sem nunca aparecer no JSON exportado.

### Google Sheets: conta de serviço em vez de OAuth2

A credencial original usava OAuth2 (login com a conta Google no
navegador). Um projeto Google Cloud em modo "Testing" expira o token de
acesso a cada 7 dias, o que faria o LabFlow parar de gravar na planilha
silenciosamente até alguém reconectar manualmente — inviável para um
serviço rodando num servidor sem supervisão constante.

**Solução:** uma **conta de serviço** (service account) do Google Cloud,
que não expira e não depende de navegador:

1. Conta de serviço criada no Google Cloud Console (`labflow-sheets@...`),
   sem nenhum papel atribuído no projeto.
2. Chave JSON gerada uma única vez, usada para criar a credencial no n8n,
   e depois apagada do computador local.
3. A planilha do LabFlow foi compartilhada diretamente com o e-mail da
   conta de serviço, papel **Editor** — e só com ela, aplicando o
   princípio de privilégio mínimo (a conta não tem acesso a nenhuma outra
   planilha ou recurso do Google Cloud).

---

## Acesso administrativo (túnel SSH)

| Serviço | Porta no servidor | Túnel (porta no PC) | URL local |
|---|---|---|---|
| n8n (editor) | `127.0.0.1:5679` | `5679` | `http://127.0.0.1:5679` |
| Evolution API (Manager) | `127.0.0.1:8080` | `18080` (a `8080` do PC já era usada pelo ambiente local) | `http://127.0.0.1:18080/manager` |

Comando para abrir o túnel:

```powershell
ssh -L 5679:localhost:5679 -L 18080:localhost:8080 SEU_USUARIO@SEU_IP
```

A janela precisa ficar aberta enquanto os painéis estão em uso — o túnel
existe só enquanto a sessão SSH existe. Os containers, porém, continuam
rodando (`restart: unless-stopped`) independentemente do túnel estar
aberto ou não.

---

## Comunicação interna entre containers

Dentro da rede `labflow-net`, os serviços se enxergam pelo **nome do
container**, não por IP nem por `localhost`:

- O n8n chama o Evolution em `http://labflow-evolution:8080/...`
- O Evolution chama o n8n (webhook) em `http://labflow-n8n:5678/webhook/...`
- O Evolution acessa o banco em `labflow-postgres:5432`

Isso é o padrão de service discovery do Docker Compose: cada serviço
listado no `docker-compose.yml` vira automaticamente resolvível pelo
próprio nome dentro da rede que a stack cria.

---

## Resumo do processo de migração

1. **Reconhecimento do servidor**: memória, disco, arquitetura (`uname -m`),
   portas já em uso, permissões do usuário no grupo `docker`.
2. **Criação da stack** (`~/labflow/docker-compose.yml` + `.env`), com
   Postgres, n8n e Evolution subidos **um de cada vez**, validando o
   `healthcheck` do Postgres antes de seguir para os próximos.
3. **Exportação do workflow** do n8n local (`.json`), com verificação
   manual (busca por `apikey`, `password`) antes de qualquer uso.
4. **Substituição da chave fixa do Evolution por credencial Header Auth**,
   feita no n8n **local** antes de exportar — assim o `.json` exportado
   já nasce sem segredo embutido.
5. **Importação do workflow no n8n do servidor**, mantido **inativo**
   até todas as credenciais serem religadas.
6. **Recriação das credenciais no servidor**: Header Auth (Evolution) e
   conta de serviço (Google Sheets), selecionadas manualmente em cada
   node do workflow importado (a importação não preserva os valores de
   credencial, só a estrutura do workflow).
7. **Criação da instância do WhatsApp** (`labflow2`) no Evolution do
   servidor, com o mesmo nome usado nas URLs dos nodes HTTP Request do
   workflow (o nome da instância faz parte da URL de envio de mensagem).
8. **Configuração do webhook** da instância, apontando para
   `http://labflow-n8n:5678/webhook/<caminho>` — ver troubleshooting
   abaixo.
9. **Desconexão da instância local** antes de parear a nova (o mesmo
   número de WhatsApp não pode estar ativo em duas instâncias
   simultaneamente).
10. **Pareamento via QR code** e ativação do workflow no servidor.
11. **Teste de ponta a ponta** com mensagens reais, cobrindo mais de um
    tipo de comando.

---

## Troubleshooting específico do deploy

### Webhook configurado pela tela do Manager não era salvo

**Sintoma:** depois de configurar a URL e os eventos do webhook pela
interface do Manager do Evolution API, mensagens reais enviadas ao número
pareado não geravam nenhuma execução no n8n (`Executions` ficava vazio).
Um teste manual de conectividade (`wget` de dentro do container do
Evolution até o n8n) retornou `200 OK`, confirmando que a rede e o n8n
estavam corretos — o problema era o Evolution nunca chamar essa URL.

**Diagnóstico:** consultando a configuração da instância diretamente pela
API (`GET /webhook/find/<instancia>`), o retorno foi `null` — ou seja, a
configuração feita pela tela do Manager nunca chegou a ser persistida de
fato pela API, mesmo a interface não acusando erro nenhum.

**Solução aplicada:** configurar o webhook diretamente via API, em vez de
pela tela:

```bash
curl -X POST http://127.0.0.1:8080/webhook/set/labflow2 \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d '{
    "webhook": {
      "url": "http://labflow-n8n:5678/webhook/<caminho>",
      "enabled": true,
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

Depois dessa chamada, `GET /webhook/find/labflow2` passou a retornar a
configuração completa (em vez de `null`), e a próxima mensagem de teste
real gerou a primeira execução bem-sucedida no n8n.

**Lição:** ao suspeitar de uma configuração "fantasma" (a tela não mostra
erro, mas o comportamento não muda), consultar o estado real pela API é
mais confiável que confiar na interface — e permite reconfigurar de forma
determinística, reaproveitável em scripts.

### Falso teste de webhook com corpo vazio

Ao testar a conectividade com `wget --post-data='{}'`, o item chegou no
n8n mas foi descartado pelo node **Filter**, por não ter os campos
`data.key.fromMe` nem `data.message.conversation` (o corpo do teste
estava vazio, sem simular uma mensagem real). Isso é o comportamento
correto do Filter — o teste provou conectividade de rede, não testou a
lógica do workflow. A confirmação definitiva só veio com uma mensagem de
WhatsApp real, enviada de um número diferente do pareado.

---

## Impacto de recursos no servidor

| Métrica | Antes da stack do LabFlow | Depois |
|---|---|---|
| Disco usado | ~6,4% de 95,82 GB | ~10,7% |
| Memória em uso | ~32% | ~39% |
| Swap | 0% | 0% (sem alteração) |
| Carga do sistema | ~0,1 | sem impacto perceptível |

A stack do LabFlow (Postgres + n8n + Evolution, com as imagens já
baixadas) ocupou cerca de 4 pontos percentuais de disco e 7 de memória,
com folga considerável de recursos restantes no servidor compartilhado.

---

## Estado atual

- [x] Stack isolada rodando (`labflow-postgres`, `labflow-n8n`,
      `labflow-evolution`), sem porta pública nenhuma
- [x] Segredos gerados no servidor via `openssl`, nunca transmitidos
- [x] Credencial da Evolution API migrada para Header Auth
- [x] Credencial do Google Sheets migrada para conta de serviço
- [x] Instância `labflow2` pareada e testada ponta a ponta com sucesso
- [ ] Login por senha SSH ainda ativo no servidor (pendente até os dois
      dispositivos locais serem validados por chave — ver `vps-ssh-setup`)
- [ ] Stack local (Docker no PC) ainda não desligada definitivamente

## Próximos passos

- Desligar a stack local depois de um período de confirmação de
  estabilidade do servidor.
- Fechar a migração de acesso SSH (`vps-ssh-setup`): validar login por
  chave nos dois computadores e desativar o login por senha no VPS.
- Avaliar reforçar a autenticação do node Webhook do n8n (hoje
  `Authentication: None`), já que ele só é alcançável de dentro da rede
  Docker do servidor, mas uma camada extra de defesa é barata de
  implementar.
