import { useId } from "react";

/**
 * Gráficos simples em SVG (APP-032), no estilo dos painéis de LIMS: barras por situação, colunas por dia e linha por dia.
 * Todos mostram o número (em cima da barra ou no ponto), têm grade leve e `<title>` em cada marca (aparece ao passar o mouse),
 * usam só as cores do tema (claro e escuro) e nunca dependem só da cor: cada barra vem com o rótulo e o valor escritos.
 */

const SERIE_OK = new Set(["Ok", "Concluído", "Lido", "Negativo", "Não confirmado", "Repetição ok"]);
const SERIE_NAO_OK = new Set(["Não ok", "Atrasado", "Positivo", "Confirmado", "Repetição não ok"]);
const SERIE_ATENCAO = new Set(["Vence hoje", "Em andamento", "Em confirmação", "Positivo, em confirmação"]);

function corDaSituacao(rotulo: string): string {
  if (SERIE_OK.has(rotulo)) return "var(--ok)";
  if (SERIE_NAO_OK.has(rotulo)) return "var(--nao-ok)";
  if (SERIE_ATENCAO.has(rotulo)) return "var(--atencao)";
  return "var(--acao)";
}

export interface ItemDeSituacao {
  rotulo: string;
  total: number;
}

/** Barras horizontais: uma por situação, com o número ao lado. Tocar numa barra chama `aoEscolher` (filtra a tabela). */
export function BarrasPorSituacao(props: { itens: ItemDeSituacao[]; aoEscolher?: (rotulo: string) => void; escolhido?: string }) {
  const maximo = Math.max(1, ...props.itens.map((i) => i.total));
  const soma = props.itens.reduce((n, i) => n + i.total, 0);
  return (
    <ul className="barras-situacao" aria-label={`Por situação: ${props.itens.map((i) => `${i.rotulo} ${i.total}`).join(", ")}`}>
      {props.itens.map((i) => {
        const conteudo = (
          <>
            <span className="barra-rotulo">{i.rotulo}</span>
            <span className="barra-trilho" aria-hidden="true">
              <span className="barra-preenchida" style={{ width: `${Math.max(2, (i.total / maximo) * 100)}%`, background: corDaSituacao(i.rotulo) }} />
            </span>
            <span className="barra-valor">
              {i.total}
              <span className="texto-secundario"> · {Math.round((i.total / Math.max(1, soma)) * 100)}%</span>
            </span>
          </>
        );
        return (
          <li key={i.rotulo}>
            {props.aoEscolher ? (
              <button
                type="button"
                className={`barra-linha${props.escolhido === i.rotulo ? " escolhida" : ""}`}
                aria-pressed={props.escolhido === i.rotulo}
                title={`Filtrar por ${i.rotulo}`}
                onClick={() => props.aoEscolher?.(i.rotulo)}
              >
                {conteudo}
              </button>
            ) : (
              <div className="barra-linha">{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface PontoDeDia {
  dia: string; // AAAA-MM-DD
  valor: number;
}

const L = 360;
const A = 170;
const M = { esq: 30, dir: 10, cima: 14, baixo: 26 };

function diaMes(dia: string): string {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

function escala(pontos: PontoDeDia[]) {
  const maximo = Math.max(4, ...pontos.map((p) => p.valor));
  const passo = maximo <= 8 ? 2 : maximo <= 20 ? 5 : maximo <= 50 ? 10 : Math.pow(10, Math.floor(Math.log10(maximo)));
  const topo = Math.ceil(maximo / passo) * passo;
  const y = (v: number) => A - M.baixo - (v / topo) * (A - M.cima - M.baixo);
  const marcas: number[] = [];
  for (let v = 0; v <= topo; v += passo) marcas.push(v);
  return { y, marcas };
}

function Eixos(props: { pontos: PontoDeDia[]; x: (n: number) => number }) {
  const { y, marcas } = escala(props.pontos);
  const ultimo = props.pontos.length - 1;
  const rotulados = [...new Set([0, Math.round(ultimo / 3), Math.round((2 * ultimo) / 3), ultimo])].filter((n) => n >= 0);
  return (
    <>
      {marcas.map((m) => (
        <g key={m}>
          <line x1={M.esq} x2={L - M.dir} y1={y(m)} y2={y(m)} className="g2-grade" />
          <text x={M.esq - 5} y={y(m) + 3} textAnchor="end" className="g2-eixo">
            {m}
          </text>
        </g>
      ))}
      {rotulados.map((n) => (
        <text key={n} x={n === ultimo && ultimo > 0 ? L - M.dir : n === 0 ? M.esq : props.x(n)} y={A - 8} textAnchor={n === ultimo && ultimo > 0 ? "end" : n === 0 ? "start" : "middle"} className="g2-eixo">
          {diaMes(props.pontos[n].dia)}
        </text>
      ))}
    </>
  );
}

/** Colunas por dia (como "Tests Completed"): o valor aparece em cima de cada coluna quando cabe. */
export function ColunasPorDia(props: { pontos: PontoDeDia[]; descricao: string }) {
  const { pontos } = props;
  const { y } = escala(pontos);
  const largura = (L - M.esq - M.dir) / Math.max(1, pontos.length);
  const x = (n: number) => M.esq + n * largura + largura / 2;
  const total = pontos.reduce((s, p) => s + p.valor, 0);
  const mostrarValor = pontos.length <= 16;
  return (
    <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`${props.descricao}: ${total} no período`} className="svg-grafico">
      <Eixos pontos={pontos} x={x} />
      {pontos.map((p, n) => (
        <g key={p.dia}>
          <rect x={x(n) - Math.max(1.5, largura * 0.34)} y={y(p.valor)} width={Math.max(3, largura * 0.68)} height={y(0) - y(p.valor)} rx={1.5} className="coluna-dia">
            <title>{`${diaMes(p.dia)}: ${p.valor}`}</title>
          </rect>
          {mostrarValor && p.valor > 0 && (
            <text x={x(n)} y={y(p.valor) - 3} textAnchor="middle" className="g2-eixo">
              {p.valor}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** Linha por dia (como "Result Trend"): área leve sob a linha, pontos com o valor ao passar o mouse. */
export function LinhaPorDia(props: { pontos: PontoDeDia[]; descricao: string }) {
  const { pontos } = props;
  const { y } = escala(pontos);
  const passo = (L - M.esq - M.dir) / Math.max(1, pontos.length - 1);
  const x = (n: number) => M.esq + n * passo;
  const total = pontos.reduce((s, p) => s + p.valor, 0);
  const id = useId();
  const caminho = pontos.map((p, n) => `${n === 0 ? "M" : "L"}${x(n).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(" ");
  const area = `${caminho} L${x(pontos.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  return (
    <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`${props.descricao}: ${total} no período`} className="svg-grafico">
      <defs>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--acao)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--acao)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <Eixos pontos={pontos} x={x} />
      <path d={area} fill={`url(#${id}-area)`} />
      <path d={caminho} className="linha-dia" />
      {pontos.map((p, n) => (
        <circle key={p.dia} cx={x(n)} cy={y(p.valor)} r={pontos.length > 40 ? 1.8 : 3} className="ponto-dia">
          <title>{`${diaMes(p.dia)}: ${p.valor}`}</title>
        </circle>
      ))}
    </svg>
  );
}
