import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { enviarJson, lerJson } from "../api";
import SeletorDeDias, { dm } from "../componentes/SeletorDeDias";
import LaudoEsterilizacao from "./LaudoEsterilizacao";

/**
 * Controle de Material Asséptico (07 §7.2; APP-041): o que foi usado em cada dia de análise. O app sugere os ciclos do
 * dia anterior e os esterilizados depois dele; o analista confirma, tira ou acrescenta livremente. Os lotes das placas
 * (P pequenas, G grandes para tanques de NFC) são anotação livre. Quem salva fica como responsável pelo preenchimento.
 */

interface Uso {
  ponteiras: string | null;
  agua_diluicao: string | null;
  placas: string | null;
  meios: string | null;
}

interface Registro extends Uso {
  ct: string;
  bl: string;
  quem: string;
  quando: string;
}

export interface DiaDoMaterial {
  dia: string; // AAAA-MM-DD
  pode_preencher: boolean;
  registro: Registro | null;
  sugestao: Uso;
  recentes: string[];
}

const CAMPOS: { chave: keyof Uso; rotulo: string; dica: string }[] = [
  { chave: "ponteiras", rotulo: "Ponteira / pipeta", dica: "Ciclos, ex.: A954, A959" },
  { chave: "agua_diluicao", rotulo: "Água de diluição", dica: "Ciclos, ex.: A953" },
  { chave: "placas", rotulo: "Placa de Petri", dica: "Lotes: P (pequenas) e G (grandes, tanques de NFC)" },
  { chave: "meios", rotulo: "Meio de cultura", dica: "Ciclos, ex.: A964, A969" },
];

const LAUDO = {
  base: "/material-asseptico/laudos",
  titulo: "Laudo de material asséptico",
  rotulo: "Laudo de material asséptico",
  explicacao: "Nove dias por página, com o que foi usado em cada um e o nome de quem preencheu. O Visto é à mão, na folha impressa.",
  unidade: "dias",
};

export default function MaterialAsseptico() {
  const [hoje, setHoje] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [dados, setDados] = useState<DiaDoMaterial | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async (escolhido: string | null) => {
    try {
      const novo = await lerJson<DiaDoMaterial>(escolhido ? `/material-asseptico?dia=${escolhido}` : "/material-asseptico");
      setDados(novo);
      setHoje((h) => h ?? novo.dia);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o material asséptico.");
    }
  }, []);

  useEffect(() => {
    void carregar(dia);
  }, [carregar, dia]);

  return (
    <section className="pagina-material">
      <p className="voltar">
        <Link to="/registros-diarios">← Registros diários</Link>
      </p>
      <h1>Material asséptico</h1>
      <p className="texto-secundario">
        O que foi usado nas análises do dia: os ciclos vêm da <Link to="/esterilizacao">Esterilização</Link>, e você pode
        acrescentar o que saiu do roteiro.
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

function Formulario({ dados, aoSalvar }: { dados: DiaDoMaterial; aoSalvar: (d: DiaDoMaterial) => void }) {
  const base = dados.registro ?? dados.sugestao;
  const [valores, setValores] = useState<Record<keyof Uso, string>>({
    ponteiras: base.ponteiras ?? "",
    agua_diluicao: base.agua_diluicao ?? "",
    placas: base.placas ?? "",
    meios: base.meios ?? "",
  });
  const [ct, setCt] = useState(dados.registro?.ct ?? "<1");
  const [bl, setBl] = useState(dados.registro?.bl ?? "<1");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      aoSalvar(await enviarJson<DiaDoMaterial>(`/material-asseptico/${dados.dia}`, { ...valores, ct, bl }, "PUT"));
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={salvar} aria-label="Material do dia">
      <h2>Material do dia {dm(dados.dia)}</h2>
      <p className="texto-secundario">
        {dados.registro
          ? `Preenchido por ${dados.registro.quem} em ${dados.registro.quando}. Salvar de novo deixa no seu nome.`
          : "Ainda não preenchido: o app sugeriu o que estava em uso. Confira, tire o que acabou e acrescente o que usou."}
      </p>
      {CAMPOS.map((c) => (
        <label key={c.chave} className="campo">
          {c.rotulo}
          <input
            maxLength={200}
            placeholder={c.dica}
            value={valores[c.chave]}
            disabled={!dados.pode_preencher}
            onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })}
          />
        </label>
      ))}
      <div className="linha-formulario">
        <label className="campo campo-hora">
          C.T. (UFC/ml)
          <input maxLength={10} value={ct} disabled={!dados.pode_preencher} onChange={(e) => setCt(e.target.value)} />
        </label>
        <label className="campo campo-hora">
          B.L. (UFC/ml)
          <input maxLength={10} value={bl} disabled={!dados.pode_preencher} onChange={(e) => setBl(e.target.value)} />
        </label>
      </div>
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
        <p className="texto-secundario">O seu cargo vê o material asséptico, mas não preenche.</p>
      )}
    </form>
  );
}
