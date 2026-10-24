import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { lerJson } from "../api";
import SeletorDeDias, { dm } from "../componentes/SeletorDeDias";
import { useSessao } from "../sessao";
import LaudoEsterilizacao from "./LaudoEsterilizacao";

/**
 * Controle de Incubação e Leitura (APP-040): um dia de incubação por bloco, com as amostras plaqueadas no dia (tanques
 * com N/ST, recebimento, embarque, NFC, águas, baias e linhas), o lote de cada meio em uso naquele dia e as datas de
 * leitura. Tudo vem do que foi registrado (bot e app); TAB e Coliformes não entram. O dia entra na folha quando fecha.
 */

export interface DiaDeIncubacao {
  dia: string;
  amostras: string[];
  meios: Record<string, string | null>;
  leituras: Record<string, string | null>;
  na_folha: boolean;
}

const MEIOS = ["OSA", "PDA", "PCA", "Wort"];
const LEITURAS: [string, string][] = [
  ["48h", "OSA/PCA 48h"],
  ["72h", "PDA 72h"],
  ["120h", "PDA 120h"],
  ["240h", "Wort 240h"],
];

const LAUDO = {
  base: "/laudos/incubacao",
  titulo: "Laudo de incubação e leitura",
  rotulo: "Laudo de incubação e leitura",
  explicacao:
    "Um dia de incubação por bloco, 7 por folha. O dia entra na folha no dia seguinte, quando fecha. Nome e Visto do responsável são à mão.",
  unidade: "dias",
};

export default function IncubacaoLeitura() {
  const { pessoa } = useSessao();
  const [hoje, setHoje] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [dados, setDados] = useState<DiaDeIncubacao | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async (escolhido: string | null) => {
    try {
      const novo = await lerJson<DiaDeIncubacao>(escolhido ? `/incubacao?dia=${escolhido}` : "/incubacao");
      setDados(novo);
      setHoje((h) => h ?? novo.dia);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o dia de incubação.");
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
      <h1>Incubação e leitura</h1>
      <p className="texto-secundario">
        O que foi plaqueado em cada dia, com o lote de cada meio em uso e quando ler. Vem do que foi registrado no bot e no app;
        TAB e Coliformes não entram.
      </p>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
        </div>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {hoje && <SeletorDeDias hoje={hoje} escolhido={dados?.dia ?? hoje} preenchidos={[]} aoEscolher={setDia} />}
      {dados && (
        <div className="cartao" aria-label={`Incubação de ${dm(dados.dia)}`}>
          <h2>
            Incubação de {dm(dados.dia)}{" "}
            <span className={dados.na_folha ? "etiqueta etiqueta-ok" : "etiqueta etiqueta-neutra"}>
              {dados.na_folha ? "Na folha" : dados.dia === hoje ? "Entra na folha amanhã" : "Ainda fora da folha"}
            </span>
          </h2>
          {dados.amostras.length === 0 ? (
            <p className="texto-secundario">Nada plaqueado neste dia (fora TAB e Coliformes).</p>
          ) : (
            <ul className="lista-simples" aria-label="Amostras">
              {dados.amostras.map((linha) => (
                <li key={linha}>{linha}</li>
              ))}
            </ul>
          )}
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  {MEIOS.map((m) => (
                    <th key={m} scope="col">
                      Lote {m}
                    </th>
                  ))}
                  {LEITURAS.map(([, rotulo]) => (
                    <th key={rotulo} scope="col">
                      {rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {MEIOS.map((m) => (
                    <td key={m}>{dados.meios[m] ?? <span className="etiqueta etiqueta-pendente">sem lote em uso</span>}</td>
                  ))}
                  {LEITURAS.map(([chave]) => (
                    <td key={chave}>{dados.leituras[chave] ? dm(dados.leituras[chave] as string) : "-"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {MEIOS.some((m) => dados.meios[m] === null) && (
            <p className="texto-secundario">
              Meio usado sem lote marcado: escolha o lote em uso em <Link to="/meios-lotes">Meios e lotes</Link>.
            </p>
          )}
        </div>
      )}
      {pessoa?.pode.includes("registrar_analise") && <LaudoEsterilizacao versao={0} config={LAUDO} />}
    </section>
  );
}
