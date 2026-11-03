# Pedido para a sessão do bot: LinkedIn e GitHub (03/11/2026)

Branch da sessão do app: `docs/portfolio-readme` (sem PR ainda). Quem abre o PR e mescla é o Danyllo, quando pedir.

## Contexto
O Danyllo quer atualizar o LinkedIn (`linkedin.com/in/dg013`) e o GitHub para conseguir estágio ou emprego e para vender o que sabe fazer. A sessão do app não abre o LinkedIn; a do bot abre.

## O que a sessão do app já fez (na branch)
1. `README.md`: topo novo "Em resumo", seção **Duas formas de usar** (Completa e Lite), seção **Sobre o piloto**, números conferidos (684 testes do bot, 637 da API, 283 das telas; 271 nós; 88 migrations; 33 bugs), histórico das v1.2 a v1.4 recolhido.
2. `docs/portfolio/linkedin.md`: 3 títulos, Sobre, projeto em destaque, competências, bullets de experiência, oferta de serviço, post de lançamento e a lista "O que não dizer". Já cita a Lite e o piloto.

## O que peço à sessão do bot
1. Abrir o perfil e comparar com `docs/portfolio/linkedin.md`. Ajustar ao que já existe (cargo e empresa atuais, formação, certificados).
2. Dizer ao Danyllo o que mudar no perfil, na ordem: título, Sobre, Projetos, Competências, Destaques.
3. Conferir se algo no perfil contradiz o README (datas, cargo, o que pode ser dito sobre o laboratório).
4. Só editar `docs/portfolio/` depois que o PR for mesclado ou avisando antes, para não termos conflito.

## Regras que valem (CLAUDE.md)
- Nada de dado real: empresa, cliente, limite, resultado, nome de pessoa da empresa, caminho de pasta da rede, telefone, IP.
- Não escrever "sem riscos" sobre a Lite. Dizer "roda na rede local, sem nuvem". Limites já escritos: HTTP na rede interna, porta liberada pela TI, PC servidor ligado, ainda em teste nos PCs do laboratório.
- O piloto é com dados de teste; uso real depende da TI e da LGPD.

## Fora do escopo
A sessão do app não mexe em `LabFlow*.json`, `tests/`, `docs/comandos.md` nem em migrations do bot.

## Pendente com o Danyllo
- Abrir e mesclar o PR da `docs/portfolio-readme`.
- README de perfil do GitHub (repositório `danyllo153/danyllo153`), descrição e tópicos do repositório LabFlow.
- Página de oferta de serviços (laboratórios e pequenas empresas com planilha e WhatsApp).
