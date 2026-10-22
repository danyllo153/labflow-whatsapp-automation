/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// As telas moram em /app/ (a API continua na raiz: /login, /me, /docs...). Assim recarregar uma tela nunca cai numa rota da API.
export default defineConfig({
  base: "/app/",
  plugins: [react()],
  server: {
    // npm run dev: as chamadas à API vão para a API rodando no PC (uvicorn na porta 8000)
    proxy: {
      "^/(login|sair|me|trocar-senha|admin|paginas|pendencias-hoje|ambiente|saude)": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/testes-preparo.ts"],
  },
});
