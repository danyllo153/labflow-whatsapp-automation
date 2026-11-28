import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";

import App from "./App";
import { ProvedorDeSessao } from "./sessao";
import "./estilos.css";
import "./fase-e.css";
import "./visual-novo.css";
import "./navegacao.css";
import "./visual-kaiadmin.css";
import "./visual-staradmin.css";
import "./paleta.css"; // creme, azul-marinho e laranja (27/11): por último
import "./desktop.css"; // densidade para o computador (28/11): por último, vence as outras folhas
import { carregarMarca } from "./marca";
import { aplicarTema } from "./tema";

aplicarTema(); // antes de desenhar a tela, para não piscar claro e depois escuro
void carregarMarca(); // nome, logo e cores da instalação (Lite); sem marca fica o LabFlow

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <BrowserRouter basename="/app" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </BrowserRouter>
  </StrictMode>,
);

// App instalável (só na Completa): o service worker guarda só os arquivos das telas, nunca os dados (ver public/sw.js).
// A Lite atende só o próprio PC (sem celular, 27/11): sem "instalar como app" e sem service worker; se uma versão antiga
// deixou um registrado neste navegador, ele é desligado e o que guardou é apagado.
fetch("/ambiente", { credentials: "same-origin" })
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then((ambiente: { lite?: boolean }) => {
    if (!("serviceWorker" in navigator)) return;
    if (ambiente.lite) {
      void navigator.serviceWorker.getRegistrations().then((registros) => registros.forEach((r) => void r.unregister()));
      void caches?.keys().then((nomes) => nomes.filter((n) => n.startsWith("labflow-")).forEach((n) => void caches.delete(n)));
    } else if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {
        // sem service worker o app funciona igual, só não fica instalável
      });
    }
  });
