// Service worker do LabFlow (APP-012). Regra do rumo: NADA de dado guardado no aparelho.
// Guarda só os arquivos das telas com nome versionado (/app/assets/...), que nunca mudam.
// Nenhuma resposta da API (login, páginas, pendências) passa por aqui nem é guardada.
const CAIXA = "labflow-telas-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CAIXA).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/app/assets/")) {
    return; // todo o resto vai direto para a rede (só online)
  }
  evento.respondWith(
    caches.open(CAIXA).then((caixa) =>
      caixa.match(evento.request).then(
        (guardado) =>
          guardado ||
          fetch(evento.request).then((resposta) => {
            if (resposta.ok) caixa.put(evento.request, resposta.clone());
            return resposta;
          }),
      ),
    ),
  );
});
