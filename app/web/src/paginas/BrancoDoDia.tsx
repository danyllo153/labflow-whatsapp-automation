import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { enviarJson, lerJson } from "../api";
import SeletorDeDias, { dm } from "../componentes/SeletorDeDias";
import LaudoEsterilizacao from "./LaudoEsterilizacao";

/**
 * Controle de Meio de Cultura / Fluxo Laminar, o branco do dia (07 §7.5; APP-038): as placas da capela e de cada meio em
 * uso, para ver se cresceu algo. Tudo começa em "<1"; Wort e PCA vêm com "-" nos dias sem análise que use esses meios
 * (o app explica por quê). Quem salva é o responsável. Laudo de 39 dias por página.
 */

interface Valores {
  capela_ct: string;
  capela_bl: string;
  osa: string;
  pda: string;
  wort: string;
  pca: string;
}

export interface DiaDoFluxo {
  dia: string;
  pode_preencher: boolean;
  registro: (Valores & { quem: string; quando: string }) | null;
  sugestao: Valores;
  motivo_wort: string;
  motivo_pca: string;
  recentes: string[];
}

const CAMPOS: { chave: keyof Valores; rotulo: string; grupo: string }[] = [
  { chave: "capela_ct", rotulo: "C.T.", grupo: "Capela do fluxo laminar (UFC/50 cm²/30 min)" },
  { chave: "capela_bl", rotulo: "B.L.", grupo: "Capela do fluxo laminar (UFC/50 cm²/30 min)" },
  { chave: "osa", rotulo: "OSA", grupo: "Controle de meio de cultura (UFC/ml)" },
  { chave: "pda", rotulo: "PDA", grupo: "Controle de meio de cultura (UFC/ml)" },
  { chave: "wort", rotulo: "Wort", grupo: "Controle de meio de cultura (UFC/ml)" },
  { chave: "pca", rotulo: "PCA", grupo: "Controle de meio de cultura (UFC/ml)" },
];

const LAUDO = {
  base: "/laudos/fluxo-laminar",
  titulo: "Laudo de meio de cultura e fluxo laminar",
  rotulo: "Laudo de meio de cultura e fluxo laminar",
  explicacao: "Um dia por linha, 39 por página, com o nome de quem preencheu. O Visto é à mão, na folha impressa.",
  unidade: "dias",
};

export default function BrancoDoDia() {
  const [hoje, setHoje] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [dados, setDados] = useState<DiaDoFluxo | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async (escolhido: string | null) => {
    try {
      const novo = await lerJson<DiaDoFluxo>(escolhido ? `/fluxo-laminar?dia=${escolhido}` : "/fluxo-laminar");
      setDados(novo);
      setHoje((h) => h ?? novo.dia);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o branco do dia.");
    }
  }, []);

  useEffect(() => {
    void carregar(dia);
  }, [carregar, dia]);

  return (
    <section className="pagina-material">
      <p className="voltar">
        <Link to="/paginas">← Análises</Link>
      </p>
      <h1>Meio de cultura e fluxo laminar</h1>
      <p className="texto-secundario">
        O branco do dia: as placas da capela e de cada meio em uso, sem amostra. O normal é &lt;1. Todo dia que teve análise entra
        sozinho no dia seguinte, já preenchido; só corrija se algo crescer.
      </p>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
        </div>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados && hoje && (
        <>
          <SeletorDeDias hoje={hoje} escolhido={dados.dia} preenchidos={dados.recentes} aoEscolher={setDia} />
          <Formulario key={dados.dia} dados={dados} aoSalvar={(d) => (setDados(d), setVersao((v) => v + 1))} />
        </>
      )}
      {dados?.pode_preencher && <LaudoEsterilizacao versao={versao} config={LAUDO} />}
    </section>
  );
}

function Formulario({ dados, aoSalvar }: { dados: DiaDoFluxo; aoSalvar: (d: DiaDoFluxo) => void }) {
  const base = dados.registro ?? dados.sugestao;
  const [valores, setValores] = useState<Valores>({
    capela_ct: base.capela_ct, capela_bl: base.capela_bl, osa: base.osa, pda: base.pda, wort: base.wort, pca: base.pca,
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      aoSalvar(await enviarJson<DiaDoFluxo>(`/fluxo-laminar/${dados.dia}`, valores, "PUT"));
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  const grupos = [...new Set(CAMPOS.map((c) => c.grupo))];
  return (
    <form className="cartao" onSubmit={salvar} aria-label="Branco do dia">
      <h2>Branco do dia {dm(dados.dia)}</h2>
      <p className="texto-secundario">
        {dados.registro
          ? `Preenchido por ${dados.registro.quem} em ${dados.registro.quando}. Salvar de novo deixa no seu nome.`
          : `Ainda não preenchido (entra sozinho amanhã, se o dia tiver análise). Wort: ${dados.motivo_wort}. PCA: ${dados.motivo_pca}.`}
      </p>
      {grupos.map((g) => (
        <fieldset key={g} className="grupo-campos">
          <legend>{g}</legend>
          <div className="linha-formulario">
            {CAMPOS.filter((c) => c.grupo === g).map((c) => (
              <label key={c.chave} className="campo campo-hora">
                {c.rotulo}
                <input
                  maxLength={10}
                  value={valores[c.chave]}
                  disabled={!dados.pode_preencher}
                  onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {salvo && !erro && (
        <p className="texto-secundario" role="status">
          Salvo.
        </p>
      )}
      {dados.pode_preencher ? (
        <button type="submit" className="botao botao-principal" disabled={enviando}>
          {dados.registro ? "Salvar correção" : "Salvar o dia"}
        </button>
      ) : (
        <p className="texto-secundario">O seu cargo vê o branco do dia, mas não preenche.</p>
      )}
    </form>
  );
}
