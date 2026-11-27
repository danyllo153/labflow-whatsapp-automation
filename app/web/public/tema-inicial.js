// Aplica o tema antes de desenhar a tela (sem piscar). Arquivo estático: a CSP não aceita script inline.
try {
  document.documentElement.setAttribute("data-tema", localStorage.getItem("labflow:tema") === "escuro" ? "escuro" : "claro");
} catch (e) {
  document.documentElement.setAttribute("data-tema", "claro");
}
