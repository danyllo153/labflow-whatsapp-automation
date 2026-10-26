import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { vi } from "vitest";

// O jsdom não desenha canvas: nos testes, o gráfico do Chart.js vira um <canvas> com as séries em data-series
// (nome e quantos pontos), para conferir o que foi montado sem depender do desenho.
function graficoFalso(props: { data: { datasets: { label?: string; data: unknown[] }[] }; type?: string; "aria-label"?: string }) {
  return createElement("canvas", {
    role: "img",
    "aria-label": props["aria-label"],
    "data-tipo": props.type ?? "bar",
    "data-series": JSON.stringify(props.data.datasets.map((d) => [d.label, d.data.length])),
  });
}
vi.mock("react-chartjs-2", () => ({ Chart: graficoFalso, Bar: graficoFalso, Line: graficoFalso }));
