# Telas do app LabFlow (React + TypeScript)

Spec: [07 — App (PWA)](../../docs/specs/lims/07-app-pwa.md) v1.0. Tarefas da Fase C no [rumo do app](../../docs/specs/lims/rumo-do-app.md) (`APP-012` em diante). Decisão de 22/10/2026: telas em React + TypeScript, **servidas pela própria API** em `/app/`.

- As telas moram em `/app/`; a API continua na raiz (`/login`, `/me`, `/docs`...).
- O app é **instalável** ("Adicionar à tela inicial"), mas o service worker (`public/sw.js`) guarda **só os arquivos das telas**: nenhum dado sai do servidor para o aparelho.
- A faixa "Dados de demonstração" aparece quando a API responde `GET /ambiente` com `demonstracao: true` (padrão; `LABFLOW_DEMONSTRACAO=0` desliga).

## Rodar no Windows (PowerShell), para mexer nas telas

Precisa do **Node.js 20** instalado (nodejs.org, versão LTS). Na pasta das telas:

```
cd C:\Dev\labflow-whatsapp-automation\app\web
```

```
npm ci
```

```
npm run dev
```

Abra o endereço que aparecer (ex.: `http://localhost:5173/app/`). Para as telas conversarem com a API, deixe a API rodando em outra janela (ver `app/api/README.md`): o `npm run dev` repassa as chamadas para `http://127.0.0.1:8000`.

Testes e build:

```
npm test
```

```
npm run build
```

## Pastas

| Pasta | O quê |
|---|---|
| `src/componentes/` | Moldura (menu lateral no computador, barra embaixo no celular) e a faixa de demonstração |
| `src/paginas/` | Uma tela por arquivo |
| `src/menu.ts` | Itens do menu e quais telas já existem |
| `src/estilos.css` | Paleta aprovada em 15/10 (07 §Visual) |
| `public/` | Manifesto do app instalável, ícones e service worker |
