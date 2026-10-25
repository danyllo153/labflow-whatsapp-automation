import { useMemo, useState } from "react";

import { BarrasPorSituacao, ColunasPorDia, LinhaPorDia } from "../../componentes/Graficos";
import type { DefinicaoDePagina } from "./definicoes";

/**
 * Dashboard da página de dados (pedido de 25/10, APP-067): com o filtro que já está na tela, o analista escolhe o gráfico.
 * "Colunas" conta as linhas por uma coluna de texto (ex.: quem coletou, origem, navio); "Tendência" conta por dia numa
 * coluna de data (ex.: coletas por dia). Tudo calculado no app sobre as linhas filtradas (até 2000, como a impressão).
 */

export type Linha = Record<string, unknown>;
type Tipo = "colunas" | "tendencia";

const VAZIO = "(sem valor)";

function textoDe(v: unknown): string {
  if (v === null || v === undefined || v === "") return VAZIO;
  return String(v);
}

export function contarPor(linhas: Linha[], chave: string): { rotulo: string; total: number }[] {
  const contagem = new Map<string, number>();
  for (const l of linhas) {
    const k = textoDe(l[chave]);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  return [...contagem.entries()].map(([rotulo, total]) => ({ rotulo, total })).sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Uma contagem por dia, do primeiro ao último dia das linhas (dias sem nada entram com 0). */
export function contarPorDia(linhas: Linha[], chave: string): { dia: string; valor: number }[] {
  const contagem = new Map<string, number>();
  for (const l of linhas) {
    const v = l[chave];
    if (typeof v !== "string" || v.length < 10) continue;
    const dia = v.slice(0, 10);
    contagem.set(dia, (contagem.get(dia) ?? 0) + 1);
  }
  const dias = [...contagem.keys()].sort();
  if (dias.length === 0) return [];
  const pontos: { dia: string; valor: number }[] = [];
  const fim = new Date(`${dias[dias.length - 1]}T12:00:00`);
  for (let d = new Date(`${dias[0]}T12:00:00`); d <= fim && pontos.length < 400; d.setDate(d.getDate() + 1)) {
    const dia = d.toISOString().slice(0, 10);
    pontos.push({ dia, valor: contagem.get(dia) ?? 0 });
  }
  return pontos;
}

export default function Dashboard({
  def,
  linhas,
  total,
  inicial,
  aoFechar,
}: {
  def: DefinicaoDePagina;
  linhas: Linha[];
  total: number;
  inicial?: { tipo: Tipo; coluna: string };
  aoFechar: () => void;
}) {
  const textos = def.colunas.filter((c) => !c.formato || c.formato === "texto" || c.formato === "situacao");
  const datas = def.colunas.filter((c) => c.formato === "data" || c.formato === "dataHora");
  const [tipo, setTipo] = useState<Tipo>(inicial?.tipo ?? (textos.length ? "colunas" : "tendencia"));
  const [porTexto, setPorTexto] = useState(inicial?.tipo === "colunas" ? inicial.coluna : textos[0]?.chave ?? "");
  const [porData, setPorData] = useState(inicial?.tipo === "tendencia" ? inicial.coluna : datas[0]?.chave ?? "");
  const [forma, setForma] = useState<"linha" | "colunas">("linha");

  const barras = useMemo(() => contarPor(linhas, porTexto).slice(0, 15), [linhas, porTexto]);
  const pontos = useMemo(() => contarPorDia(linhas, porData), [linhas, porData]);
  const rotuloTexto = textos.find((c) => c.chave === porTexto)?.rotulo ?? "";
  const rotuloData = datas.find((c) => c.chave === porData)?.rotulo ?? "";

  return (
    <section className="cartao dashboard" aria-label="Dashboard">
      <div className="dashboard-topo">
        <h2>Dashboard</h2>
        <span className="texto-secundario">
          Com o filtro da tela: {linhas.length} {linhas.length === 1 ? "linha" : "linhas"}
          {total > linhas.length ? ` (das ${total})` : ""}
        </span>
        <button type="button" className="botao-icone" aria-label="Fechar o dashboard" onClick={aoFechar}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="dashboard-escolhas">
        <div role="group" aria-label="Tipo de gráfico" className="seletor-segmentado">
          <button type="button" aria-pressed={tipo === "colunas"} disabled={textos.length === 0} onClick={() => setTipo("colunas")}>
            Colunas
          </button>
          <button type="button" aria-pressed={tipo === "tendencia"} disabled={datas.length === 0} onClick={() => setTipo("tendencia")}>
            Tendência
          </button>
        </div>
        {tipo === "colunas" ? (
          <label className="campo campo-inline">
            Contar por
            <select value={porTexto} onChange={(e) => setPorTexto(e.target.value)}>
              {textos.map((c) => (
                <option key={c.chave} value={c.chave}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="campo campo-inline">
              Por dia de
              <select value={porData} onChange={(e) => setPorData(e.target.value)}>
                {datas.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <div role="group" aria-label="Forma" className="seletor-segmentado">
              <button type="button" aria-pressed={forma === "linha"} onClick={() => setForma("linha")}>
                Linha
              </button>
              <button type="button" aria-pressed={forma === "colunas"} onClick={() => setForma("colunas")}>
                Colunas
              </button>
            </div>
          </>
        )}
      </div>
      {linhas.length === 0 ? (
        <p className="texto-secundario">Nenhum registro com esse filtro.</p>
      ) : tipo === "colunas" ? (
        <BarrasPorSituacao itens={barras} />
      ) : pontos.length === 0 ? (
        <p className="texto-secundario">Sem datas em {rotuloData}.</p>
      ) : forma === "linha" ? (
        <LinhaPorDia pontos={pontos} descricao={`Registros por dia de ${rotuloData}`} />
      ) : (
        <ColunasPorDia pontos={pontos} descricao={`Registros por dia de ${rotuloData}`} />
      )}
      {tipo === "colunas" && barras.length === 15 && <p className="texto-secundario">Os 15 de {rotuloTexto} com mais registros.</p>}
    </section>
  );
}
