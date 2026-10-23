import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { ProvedorDeSessao } from "./sessao";
import "./estilos.css";
import { aplicarTema } from "./tema";

aplicarTema(); // antes de desenhar a tela, para não piscar claro e depois escuro

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <BrowserRouter basename="/app" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </BrowserRouter>
  </StrictMode>,
);

// App instalável: o service worker guarda só os arquivos das telas, nunca os dados (ver public/sw.js).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {
    // sem service worker o app funciona igual, só não fica instalável
  });
}
