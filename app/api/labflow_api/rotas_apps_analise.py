"""Os apps de análise da Fase E, passos E3 a E8: tanques, testes, drops, embarque, NFC recebido e desvios.

Spec: rumo-do-app.md, "Fase E"; 07-app-pwa.md §5.2. Tarefa: APP-061. Cada gravação chama a MESMA função do banco que o bot
chama (042 a 047, PB12 a PB17; permissão na 069), com a mesma regra, as mesmas recusas e, quando a função tem, a mesma
prévia ("o que vai ser criado") antes do Confirmar. Aqui ficam só as listas do que falta fazer (para marcar na tela) e a
tradução da tela para os parâmetros das funções.
"""

import re
from datetime import date, timedelta
from typing import Any, Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.rotas_analise_recebimento import _chamar, _faixas, _grupos, _hoje, _lotes, _resultado

roteador = APIRouter(prefix="/analises", tags=["apps de análise (Fase E)"])


class Gravacao(BaseModel):
    """A resposta da função do banco: o texto pronto (o mesmo do bot) e os números para a tela."""

    ok: bool = True
    previa: bool = False
    texto: str
    dados: dict[str, Any] = {}


def _resposta(r: dict, previa: bool, texto: str | None = None) -> Gravacao:
    return Gravacao(ok=r.get("ok", True), previa=r.get("previa", previa), texto=texto or r.get("texto", ""), dados=r)


def _tanques(texto: str) -> list[str]:
    """"1C, 2P 3S" -> ["1C", "2P", "3S"]."""
    tanques = [t.upper() for t in re.split(r"[,;\s]+", texto.strip()) if t]
    if not tanques:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Diga os tanques (ex.: 44, 45 ou 1C, 2P).")
    return tanques


def _ids(ids: list[int]) -> list[int]:
    if not ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Marque pelo menos um item.")
    return ids


# --- E3: tanques terra e navios (042) ---------------------------------------------------------------------------------


class Coleta(BaseModel):
    origem: Literal["terra", "navio"]
    navio: str = Field(default="", max_length=40)  # "O.SKY 189"
    tanques: str = Field(max_length=200)
    data: date
    coletado_por: str = Field(default="", max_length=60)
    previa: bool = True


@roteador.post("/tanques/coleta", response_model=Gravacao)
def registrar_coleta(
    pedido: Coleta, pessoa: PessoaLogada = Depends(exigir("registrar_coleta")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    r = _chamar(
        con, "SELECT registrar_coleta(%s, %s, %s, %s, %s, %s, %s)",
        (pessoa.usuario_id, pedido.origem, pedido.navio, _tanques(pedido.tanques), pedido.data, pedido.coletado_por or None, pedido.previa),
    )
    return _resposta(r, pedido.previa)


class AnaliseDeTanque(BaseModel):
    origem: Literal["terra", "navio"]
    navio: str = Field(default="", max_length=40)
    tanques: str = Field(max_length=200)
    frasco: Literal["Normal", "Stress"]
    data: date
    previa: bool = True


@roteador.post("/tanques/analise", response_model=Gravacao)
def registrar_analise(
    pedido: AnaliseDeTanque, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    navio = pedido.navio if pedido.origem == "navio" else None  # sem navio = tanque de terra
    r = _chamar(
        con, "SELECT registrar_analise(%s, %s, %s, %s, %s, %s)",
        (pessoa.usuario_id, navio, _tanques(pedido.tanques), pedido.frasco, pedido.data, pedido.previa),
    )
    return _resposta(r, pedido.previa)


class LeituraPendente(BaseModel):
    analise_id: int
    etapa: Literal["pre", "final"]
    origem: str
    tanque: str
    navio: str | None
    frasco: str
    analise: str  # "C.T 48h", "B.L 72h"...
    prevista: date
    situacao: str  # "Atrasado" | "Vence hoje"
    pode_placas: bool  # a pré-leitura do C.T não existe


@roteador.get("/tanques/leituras", response_model=list[LeituraPendente])
def leituras_pendentes(
    busca: str = Query(default="", max_length=40),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[LeituraPendente]:
    """As leituras de tanque que já venceram (até hoje) e ninguém fez: o que o analista marca ou digita as placas."""
    hoje = _hoje(con)
    termo = busca.strip()
    return [
        LeituraPendente(
            analise_id=a, etapa="pre" if et == "Pré-leitura" else "final", origem=o, tanque=t, navio=n, frasco=f,
            analise=lr, prevista=p, situacao="Atrasado" if p < hoje else "Vence hoje", pode_placas=True,
        )
        for a, et, o, t, n, f, lr, p in con.execute(
            """
            SELECT analise_id, etapa, origem, tanque, navio, frasco, linha_relatorio, prevista FROM bi.leituras_nfc
            WHERE NOT lida AND prevista <= %(hoje)s
              AND (%(termo)s = '' OR tanque ILIKE %(parecido)s OR coalesce(navio, '') ILIKE %(parecido)s)
            ORDER BY prevista, navio NULLS FIRST, tanque, analise_id, etapa DESC
            LIMIT 300
            """,
            {"hoje": hoje, "termo": termo, "parecido": f"%{termo}%"},
        )
    ]


class ItemLeitura(BaseModel):
    analise_id: int
    etapa: Literal["pre", "final"]


class Concluir(BaseModel):
    itens: list[ItemLeitura] = Field(min_length=1, max_length=200)


@roteador.post("/tanques/leituras/concluir", response_model=Gravacao)
def concluir_leituras(
    pedido: Concluir, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    itens = [i.model_dump() for i in pedido.itens]
    return _resposta(_chamar(con, "SELECT concluir_leitura(%s, %s)", (pessoa.usuario_id, Jsonb(itens))), False)


class ItemPlacas(ItemLeitura):
    placas: str = Field(max_length=40)  # "<1, <1, 2"


class Placas(BaseModel):
    itens: list[ItemPlacas] = Field(min_length=1, max_length=100)
    previa: bool = True


def _tres_placas(texto: str) -> list[dict]:
    partes = [p for p in re.split(r"[,;/\s]+", texto.strip()) if p]
    if len(partes) != 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'Diga as 3 placas (ex.: <1, <1, 2), não "{texto.strip()}".')
    placas = []
    for n, p in enumerate(partes, start=1):
        sinal, valor = _resultado(p)
        placas.append({"placa": n, "sinal": sinal, "valor": valor})
    return placas


@roteador.post("/tanques/placas", response_model=Gravacao)
def lancar_placas(
    pedido: Placas, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    itens = [{"analise_id": i.analise_id, "etapa": i.etapa, "placas": _tres_placas(i.placas)} for i in pedido.itens]
    return _resposta(_chamar(con, "SELECT lancar_placas(%s, %s, %s)", (pessoa.usuario_id, Jsonb(itens), pedido.previa)), pedido.previa)


# --- E4: compostas, TAB, Coliformes e Howard (043) --------------------------------------------------------------------


class TestePendente(BaseModel):
    teste_id: int
    teste: str  # TAB | Coliformes
    alvo: str  # "Load 43669 · #87 (1-5)" ou "O.SKY 189 L1 F2 · #12"
    status: str
    proxima: str  # "espalhar" | "ler" | "confirmar" | "resultado do lote"
    prevista: date | None
    situacao: str
    lote_aberto: bool  # Coliformes aberto por lote (o resultado é do lote)


@roteador.get("/testes/pendentes", response_model=list[TestePendente])
def testes_pendentes(
    busca: str = Query(default="", max_length=40),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[TestePendente]:
    """TAB e Coliformes que não acabaram, com a próxima ação de cada um (a mesma regra da teste_acao)."""
    termo = busca.strip()
    linhas = con.execute(
        """
        SELECT t.id, initcap(lower(t.tipo)), coalesce(nullif(b.load_ou_tanque, ''), '') AS ref, b.composta, b.lotes, t.status,
               coalesce(t.confirmacao_prevista, t.leitura_prevista, t.espalhar_prevista), b.situacao, t.teste_pai_id IS NOT NULL,
               (SELECT r.lote FROM recebimento_lotes r WHERE r.id = t.recebimento_lote_id)
        FROM testes t LEFT JOIN bi.testes b ON b.teste_id = t.id
        WHERE t.tipo IN ('TAB', 'COLIFORMES') AND t.status <> 'Concluída'
          AND NOT (t.tipo = 'COLIFORMES' AND t.teste_pai_id IS NULL AND t.status = 'Em confirmação')
          AND (%(termo)s = '' OR coalesce(b.load_ou_tanque, '') ILIKE %(parecido)s OR coalesce(b.composta::text, '') = %(termo)s)
        ORDER BY 7 NULLS LAST, t.tipo, t.id
        LIMIT 300
        """,
        {"termo": termo, "parecido": f"%{termo}%"},
    ).fetchall()
    proximas = {"No caldo": "espalhar", "Incubada": "ler", "Estriada": "ler", "Em confirmação": "confirmar"}
    saida = []
    for id_, tipo, ref, composta, lotes, st, prevista, situacao, filho, lote in linhas:
        alvo = " · ".join(x for x in (ref, f"#{composta}" if composta else "", f"({lotes})" if lotes else "", f"lote {lote}" if lote else "") if x)
        proxima = "resultado do lote" if filho else proximas.get(st, st.lower())
        saida.append(TestePendente(teste_id=id_, teste=tipo, alvo=alvo or f"teste {id_}", status=st, proxima=proxima,
                                   prevista=prevista, situacao=situacao or "", lote_aberto=filho))
    return saida


class AcaoDeTeste(BaseModel):
    acao: Literal["espalhar", "confirmar", "negativos", "resultado", "abrir"]
    tipo: Literal["TAB", "COLIFORMES"]
    ids: list[int] = Field(max_length=200)
    resultado: Literal["Positivo", "Negativo"] | None = None


@roteador.post("/testes/acao", response_model=Gravacao)
def acao_de_teste(
    pedido: AcaoDeTeste, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    """Uma etapa em lote ("espalhei todos", "todos negativos"): a tela mostra a lista marcada e só o Confirmar chama aqui."""
    r = _chamar(
        con, "SELECT teste_acao(%s, %s, %s, %s, %s, NULL)",
        (pessoa.usuario_id, pedido.acao, pedido.tipo, _ids(pedido.ids), pedido.resultado),
    )
    return _resposta(r, False)


class CompostaSemTeste(BaseModel):
    composta_id: int
    alvo: str
    criada_em: date


@roteador.get("/testes/compostas", response_model=list[CompostaSemTeste])
def compostas_sem_teste(
    tipo: Literal["TAB", "COLIFORMES", "HOWARD"] = Query(...),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[CompostaSemTeste]:
    """Compostas dos últimos 60 dias sem esse teste (Howard: só as do embarque)."""
    linhas = con.execute(
        """
        SELECT c.id, coalesce('Load ' || l.numero, n.nome || ' ' || n.viagem || ' L' || e.linha || ' F' || e.fase),
               (c.criada_em AT TIME ZONE 'America/Sao_Paulo')::date,
               (SELECT array_agg(coalesce(r.lote, a.numero) ORDER BY coalesce(r.lote, a.numero)) FROM composta_lotes cl
                LEFT JOIN recebimento_lotes r ON r.id = cl.recebimento_lote_id
                LEFT JOIN embarque_amostras a ON a.id = cl.embarque_amostra_id WHERE cl.composta_id = c.id)
        FROM compostas c LEFT JOIN loads l ON l.id = c.load_id
        LEFT JOIN embarques e ON e.id = c.embarque_id LEFT JOIN navios n ON n.id = e.navio_id
        WHERE c.criada_em >= now() - interval '60 days' AND (%(tipo)s <> 'HOWARD' OR c.embarque_id IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM testes t WHERE t.composta_id = c.id AND t.tipo = %(tipo)s)
        ORDER BY c.id DESC LIMIT 200
        """,
        {"tipo": tipo},
    ).fetchall()
    return [CompostaSemTeste(composta_id=i, alvo=f"{alvo} · #{i}" + (f" ({_faixas(lotes)})" if lotes else ""), criada_em=d)
            for i, alvo, d, lotes in linhas]


class TesteFeito(BaseModel):
    tipo: Literal["TAB", "COLIFORMES"]
    composta_ids: list[int] = Field(max_length=200)
    data: date
    previa: bool = True


@roteador.post("/testes/feito", response_model=Gravacao)
def teste_feito(
    pedido: TesteFeito, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    r = _chamar(
        con, "SELECT teste_feito(%s, %s, %s, %s, %s)",
        (pessoa.usuario_id, pedido.tipo, _ids(pedido.composta_ids), pedido.data, pedido.previa),
    )
    return _resposta(r, pedido.previa)


class Howard(BaseModel):
    composta_id: int
    percentual: int = Field(ge=0, le=100)


@roteador.post("/testes/howard", response_model=Gravacao)
def howard(
    pedido: Howard, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    if pedido.percentual % 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O Howard é par: cada campo positivo de 50 vale 2%.")
    r = _chamar(
        con, "SELECT teste_acao(%s, 'howard', 'HOWARD', %s, NULL, %s)", (pessoa.usuario_id, [pedido.composta_id], pedido.percentual)
    )
    return _resposta(r, False)


# --- E5: drops (044) --------------------------------------------------------------------------------------------------


class DropPendente(BaseModel):
    drop_id: int
    drop: str  # D5 | D10 | D15
    origem: str
    tanque: str
    navio: str | None
    data_coleta: date
    prevista: date
    situacao: str


class DesvioDeDrop(BaseModel):
    desvio_id: int
    drop: str
    origem: str
    tanque: str
    navio: str | None
    aberto_em: date
    prazo: date | None
    situacao: str


class Drops(BaseModel):
    pendentes: list[DropPendente]
    desvios: list[DesvioDeDrop]


@roteador.get("/drops", response_model=Drops)
def drops(
    busca: str = Query(default="", max_length=40),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Drops:
    """Os drops que venceram e não foram concluídos, e os desvios de drop abertos (esperando a leitura em 7, 13 e 25 °C)."""
    hoje, termo = _hoje(con), busca.strip()
    filtro = {"hoje": hoje, "termo": termo, "parecido": f"%{termo}%"}
    pendentes = [
        DropPendente(drop_id=i, drop=d, origem=o, tanque=t, navio=n, data_coleta=c, prevista=p, situacao=s)
        for i, d, o, t, n, c, p, s in con.execute(
            """
            SELECT drop_id, drop, origem, tanque, navio, data_coleta, prevista, situacao FROM bi.drops
            WHERE NOT concluido AND prevista <= %(hoje)s
              AND (%(termo)s = '' OR tanque ILIKE %(parecido)s OR coalesce(navio, '') ILIKE %(parecido)s)
            ORDER BY prevista, navio NULLS FIRST, tanque, drop LIMIT 300
            """,
            filtro,
        )
    ]
    desvios = [
        DesvioDeDrop(desvio_id=i, drop=d, origem=o, tanque=t, navio=n, aberto_em=a, prazo=p, situacao=s)
        for i, d, o, t, n, a, p, s in con.execute(
            """
            SELECT desvio_id, drop, origem, tanque, navio, data_abertura, prazo, situacao FROM bi.desvios
            WHERE tipo = 'Drop' AND status <> 'Concluído'
              AND (%(termo)s = '' OR tanque ILIKE %(parecido)s OR coalesce(navio, '') ILIKE %(parecido)s)
            ORDER BY prazo NULLS LAST, desvio_id LIMIT 200
            """,
            filtro,
        )
    ]
    return Drops(pendentes=pendentes, desvios=desvios)


class ConcluirDrops(BaseModel):
    ids: list[int] = Field(max_length=300)
    previa: bool = True


@roteador.post("/drops/concluir", response_model=Gravacao)
def concluir_drops(
    pedido: ConcluirDrops, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    r = _chamar(
        con, "SELECT concluir_drops(%s, %s, NULL, NULL, NULL, %s)", (pessoa.usuario_id, _ids(pedido.ids), pedido.previa)
    )
    return _resposta(r, pedido.previa)


class AbrirDesvioDeDrop(BaseModel):
    drop_id: int


@roteador.post("/drops/desvio", response_model=Gravacao)
def abrir_desvio_drop(
    pedido: AbrirDesvioDeDrop, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    return _resposta(_chamar(con, "SELECT abrir_desvio_drop(%s, %s)", (pessoa.usuario_id, pedido.drop_id)), False)


class FecharDesvioDeDrop(BaseModel):
    temperaturas: list[Literal[7, 13, 25]] = Field(max_length=3)  # onde confirmou; vazio = não confirmou


@roteador.post("/drops/desvio/{desvio_id}/fechar", response_model=Gravacao)
def fechar_desvio_drop(
    desvio_id: int, pedido: FecharDesvioDeDrop, pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Gravacao:
    r = _chamar(con, "SELECT fechar_desvio_drop(%s, %s, %s)", (pessoa.usuario_id, desvio_id, sorted(set(pedido.temperaturas))))
    return _resposta(r, False)


# --- E6: embarque FCOJ (045; C.T/B.L por amostra pela lancar_contagem da 040) -----------------------------------------


class Embarque(BaseModel):
    navio: str = Field(max_length=40)
    linha: int = Field(ge=1, le=99)
    fase: int = Field(ge=1, le=99)
    load: str = Field(max_length=10)
    item: str = Field(max_length=10)
    amostras: str = Field(max_length=200)  # "1-5"
    data: date
    previa: bool = True


@roteador.post("/embarque/registrar", response_model=Gravacao)
def registrar_embarque(
    pedido: Embarque, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    if pedido.data > _hoje(con):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A data do embarque não pode ser depois de hoje.")
    r = _chamar(
        con, "SELECT registrar_embarque(%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (pessoa.usuario_id, pedido.navio, pedido.linha, pedido.fase, pedido.load, pedido.item, _lotes(pedido.amostras),
         pedido.data, pedido.previa),
    )
    return _resposta(r, pedido.previa)


class CompostasDoEmbarque(BaseModel):
    navio: str = Field(max_length=40)
    linha: int = Field(ge=1, le=99)
    fase: int = Field(ge=1, le=99)
    grupos: str = Field(max_length=300)  # "(1-3)(4-5)"
    previa: bool = True


@roteador.post("/embarque/compostas", response_model=Gravacao)
def compostas_do_embarque(
    pedido: CompostasDoEmbarque, pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Gravacao:
    r = _chamar(
        con, "SELECT criar_compostas_embarque(%s, %s, %s, %s, %s, %s)",
        (pessoa.usuario_id, pedido.navio, pedido.linha, pedido.fase, Jsonb(_grupos(pedido.grupos)), pedido.previa),
    )
    return _resposta(r, pedido.previa)


class AmostraDoEmbarque(BaseModel):
    id: int  # embarque_amostra_id
    embarque: str  # "O.SKY 189 L1 F2"
    amostra: str  # "A3"
    load: str | None
    data: date
    ct: str | None
    bl72: str | None
    bl120: str | None
    composta: int | None


@roteador.get("/embarque/amostras", response_model=list[AmostraDoEmbarque])
def amostras_do_embarque(
    busca: str = Query(default="", max_length=40),
    dias: int = Query(default=30, ge=1, le=365),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[AmostraDoEmbarque]:
    termo = busca.strip()
    linhas = con.execute(
        """
        SELECT a.id, n.nome || ' ' || n.viagem || ' L' || e.linha || ' F' || e.fase, 'A' || a.numero, l.numero, a.data_embarque,
               (SELECT jsonb_object_agg(c.analise, CASE WHEN c.sinal = '=' THEN '' ELSE c.sinal END || trim_scale(c.valor)::text)
                FROM contagens c WHERE c.embarque_amostra_id = a.id),
               (SELECT cl.composta_id FROM composta_lotes cl WHERE cl.embarque_amostra_id = a.id LIMIT 1)
        FROM embarque_amostras a JOIN embarques e ON e.id = a.embarque_id JOIN navios n ON n.id = e.navio_id
        LEFT JOIN loads l ON l.id = a.load_id
        WHERE a.data_embarque >= %(desde)s
          AND (%(termo)s = '' OR (n.nome || ' ' || n.viagem) ILIKE %(parecido)s OR coalesce(l.numero, '') ILIKE %(parecido)s)
        ORDER BY a.data_embarque DESC, n.nome, e.linha, e.fase, a.numero LIMIT 400
        """,
        {"desde": _hoje(con) - timedelta(days=dias), "termo": termo, "parecido": f"%{termo}%"},
    ).fetchall()
    return [
        AmostraDoEmbarque(id=i, embarque=em, amostra=am, load=ld, data=d, ct=(r or {}).get("CT"), bl72=(r or {}).get("BL72"),
                          bl120=(r or {}).get("BL120"), composta=c)
        for i, em, am, ld, d, r, c in linhas
    ]


class NavioNaoOk(BaseModel):
    navio: str
    lidos: int
    nao_ok: int


class PainelDoEmbarque(BaseModel):
    atrasados: int
    para_hoje: int
    nao_ok_semana: int
    navios: list[NavioNaoOk]  # últimos 30 dias, os com Não ok primeiro


@roteador.get("/embarque/painel", response_model=PainelDoEmbarque)
def painel_do_embarque(pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)) -> PainelDoEmbarque:
    """Painel do Embarque igual ao do Recebimento FCOJ (padronização de 26/10), pela bi.contagens (o mesmo alarme do bot)."""
    hoje = _hoje(con)
    a, h, n = con.execute(
        """
        SELECT count(*) FILTER (WHERE situacao = 'Atrasado'), count(*) FILTER (WHERE situacao = 'Vence hoje'),
               count(*) FILTER (WHERE lido AND alarme AND data_leitura > %(hoje)s - 7)
        FROM bi.contagens WHERE origem = 'Embarque'
        """,
        {"hoje": hoje},
    ).fetchone()
    navios = con.execute(
        """
        SELECT navio, count(*), count(*) FILTER (WHERE alarme)
        FROM bi.contagens WHERE origem = 'Embarque' AND lido AND data_leitura > %(hoje)s - 30
        GROUP BY navio ORDER BY 3 DESC, 2 DESC, 1 LIMIT 8
        """,
        {"hoje": hoje},
    ).fetchall()
    return PainelDoEmbarque(atrasados=a, para_hoje=h, nao_ok_semana=n,
                            navios=[NavioNaoOk(navio=nv or "-", lidos=l, nao_ok=no) for nv, l, no in navios])


class LancarNoEmbarque(BaseModel):
    analise: Literal["CT", "BL72", "BL120"]
    itens: list[dict] = Field(min_length=1, max_length=200)  # [{embarque_amostra_id, resultado "<1"}]
    previa: bool = True


@roteador.post("/embarque/lancar", response_model=Gravacao)
def lancar_no_embarque(
    pedido: LancarNoEmbarque, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    itens = []
    for i in pedido.itens:
        sinal, valor = _resultado(str(i.get("resultado", "")))
        itens.append({"embarque_amostra_id": int(i["embarque_amostra_id"]), "sinal": sinal, "valor": valor})
    r = _chamar(con, "SELECT lancar_contagem(%s, %s, %s, %s)", (pessoa.usuario_id, pedido.analise, Jsonb(itens), pedido.previa))
    return _resposta(r, pedido.previa)


# --- E7: recebimento de NFC (046) -------------------------------------------------------------------------------------


class LoteNfc(BaseModel):
    lote: int = Field(ge=1, le=9999)
    amostra: Literal["fresh", "past"]
    diluicao: int = Field(ge=0, le=9)


class RecebimentoNfc(BaseModel):
    load: str = Field(max_length=10)
    fabrica: str = Field(max_length=10)
    data: date
    lotes: list[LoteNfc] = Field(min_length=1, max_length=60)
    previa: bool = True


@roteador.post("/recebimento-nfc/registrar", response_model=Gravacao)
def registrar_nfc(
    pedido: RecebimentoNfc, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    if pedido.data > _hoje(con):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A data do recebimento não pode ser depois de hoje.")
    blocos = [{
        "load": pedido.load.strip(), "fabrica": pedido.fabrica.strip().upper(), "item": "129",
        "itens": [{**l.model_dump(), "data": pedido.data.strftime("%d/%m/%Y")} for l in pedido.lotes],
    }]
    r = _chamar(con, "SELECT registrar_recebimento_nfc(%s, %s, %s)", (pessoa.usuario_id, Jsonb(blocos), pedido.previa))
    # a função do NFC não monta texto: a tela recebe um pronto, no mesmo jeito das outras
    linhas = [
        f"lote {g['lote']} {g['amostra']} 10^{g['diluicao']}" + ("" if g.get("novo") else f" (já existia, diluição era 10^{g.get('era')})")
        for g in r.get("gravados") or []
    ]
    conflito = "; ".join(f"load {c['load']} já é da fábrica {c['cadastrada']}" for c in r.get("conflitos") or [])
    texto = (f"Load {pedido.load.strip()} ({pedido.fabrica.strip().upper()}), recebido em {pedido.data:%d/%m/%Y}: "
             + ", ".join(linhas) + "." + (f" ⚠️ Fica de fora: {conflito}." if conflito else ""))
    return _resposta(r, pedido.previa, texto)


class LoteNfcPendente(BaseModel):
    id: int  # recebimento_nfc
    load: str
    fabrica: str | None
    lote: int
    amostra: str
    diluicao: int
    recebido_em: date
    analise: Literal["CT", "BL72", "BL120"]
    prevista: date
    situacao: str


@roteador.get("/recebimento-nfc/pendentes", response_model=list[LoteNfcPendente])
def nfc_pendentes(
    busca: str = Query(default="", max_length=40),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[LoteNfcPendente]:
    """C.T 48h, B.L 72h e B.L 120h do NFC recebido que já venceram e não têm resultado."""
    hoje, termo = _hoje(con), busca.strip()
    return [
        LoteNfcPendente(id=i, load=ld, fabrica=f, lote=lt, amostra=am, diluicao=dl, recebido_em=rec, analise=an, prevista=p,
                        situacao="Atrasado" if p < hoje else "Vence hoje")
        for i, ld, f, lt, am, dl, rec, an, p in con.execute(
            """
            SELECT r.id, l.numero, fb.nome, r.lote, r.amostra, r.diluicao, r.data_recebimento, a.cod, r.data_recebimento + a.dias
            FROM recebimento_nfc r JOIN loads l ON l.id = r.load_id LEFT JOIN fabricas fb ON fb.id = l.fabrica_id
            CROSS JOIN (VALUES ('CT', 2), ('BL72', 3), ('BL120', 5)) AS a(cod, dias)
            WHERE r.data_recebimento + a.dias <= %(hoje)s AND r.data_recebimento >= %(hoje)s - 60
              AND NOT EXISTS (SELECT 1 FROM contagens_nfc c WHERE c.recebimento_nfc_id = r.id AND c.analise = a.cod)
              AND (%(termo)s = '' OR l.numero ILIKE %(parecido)s)
            ORDER BY 9, l.numero, r.lote, r.amostra, a.dias LIMIT 400
            """,
            {"hoje": hoje, "termo": termo, "parecido": f"%{termo}%"},
        )
    ]


class LancarNfc(BaseModel):
    itens: list[dict] = Field(min_length=1, max_length=200)  # [{id, analise, resultado "<1"}] — o lido na placa
    previa: bool = True


@roteador.post("/recebimento-nfc/lancar", response_model=Gravacao)
def lancar_nfc(
    pedido: LancarNfc, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    itens = []
    for i in pedido.itens:
        if str(i.get("analise", "")).upper() not in ("CT", "BL72", "BL120"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Análise inválida: CT, BL72 ou BL120.")
        sinal, valor = _resultado(str(i.get("resultado", "")))
        itens.append({"id": int(i["id"]), "analise": str(i["analise"]).upper(), "sinal": sinal, "lido": valor})
    r = _chamar(con, "SELECT lancar_contagem_nfc(%s, %s, %s)", (pessoa.usuario_id, Jsonb(itens), pedido.previa))
    lotes = {
        i: (load, lote, amostra, dil)
        for i, load, lote, amostra, dil in con.execute(
            "SELECT r.id, l.numero, r.lote, r.amostra, r.diluicao FROM recebimento_nfc r JOIN loads l ON l.id = r.load_id WHERE r.id = ANY(%s)",
            ([i["id"] for i in itens],),
        )
    }
    nomes = {"CT": "C.T 48h", "BL72": "B.L 72h", "BL120": "B.L 120h"}
    linhas = []
    for i in itens:
        load, lote, amostra, dil = lotes.get(i["id"], ("?", "?", "", 0))
        sinal = "" if i["sinal"] == "=" else i["sinal"]
        final = f"{i['lido'] * 10 ** dil:g}"
        linhas.append(f"load {load} lote {lote} {amostra} · {nomes[i['analise']]}: lido {sinal}{i['lido']:g} → {sinal}{final} (10^{dil})")
    texto = "\n".join(linhas) + (f"\n⚠️ Corrige {r.get('correcoes')} resultado anterior." if r.get("correcoes") else "")
    return _resposta(r, pedido.previa, texto)


# --- E8: desvios de tanque e a leitura do dia (047) ------------------------------------------------------------------


class LeituraNaoOk(BaseModel):
    analise_id: int
    etapa: Literal["pre", "final"]
    origem: str
    tanque: str
    navio: str | None
    frasco: str
    analise: str
    resultado: str | None  # "12, 30, >300"
    lida_em: date | None


class DesvioDeTanque(BaseModel):
    desvio_id: int
    origem: str
    tanque: str
    navio: str | None
    analise: str | None
    frasco: str | None
    aberto_em: date
    prazo: date | None
    repeticao_feita: bool
    situacao: str


class Desvios(BaseModel):
    para_abrir: list[LeituraNaoOk]
    abertos: list[DesvioDeTanque]
    dia_finalizado: bool


@roteador.get("/desvios", response_model=Desvios)
def desvios(
    busca: str = Query(default="", max_length=40),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Desvios:
    """As leituras de tanque não ok sem desvio (o bot pergunta; aqui o analista abre) e os desvios de tanque abertos."""
    hoje, termo = _hoje(con), busca.strip()
    filtro = {"hoje": hoje, "termo": termo, "parecido": f"%{termo}%"}
    para_abrir = [
        LeituraNaoOk(analise_id=a, etapa="pre" if et == "Pré-leitura" else "final", origem=o, tanque=t, navio=n, frasco=f,
                     analise=lr, resultado=res, lida_em=(em.date() if em else None))
        for a, et, o, t, n, f, lr, res, em in con.execute(
            """
            SELECT b.analise_id, b.etapa, b.origem, b.tanque, b.navio, b.frasco, b.linha_relatorio,
                   concat_ws(', ', trim_scale(b.placa_1), trim_scale(b.placa_2), trim_scale(b.placa_3)), b.lida_em AT TIME ZONE 'America/Sao_Paulo'
            FROM bi.leituras_nfc b
            WHERE b.lida AND b.resultado = 'Não ok' AND b.repeticao IS NOT TRUE
              AND NOT EXISTS (SELECT 1 FROM desvios_tanque d WHERE d.analise_id = b.analise_id)
              AND b.data_analise >= %(hoje)s - 30
              AND (%(termo)s = '' OR b.tanque ILIKE %(parecido)s OR coalesce(b.navio, '') ILIKE %(parecido)s)
            ORDER BY b.prevista DESC, b.navio NULLS FIRST, b.tanque LIMIT 200
            """,
            filtro,
        )
    ]
    abertos = [
        DesvioDeTanque(desvio_id=i, origem=o, tanque=t, navio=n, analise=an, frasco=f, aberto_em=a, prazo=p,
                       repeticao_feita=rep is not None, situacao=s)
        for i, o, t, n, an, f, a, p, rep, s in con.execute(
            """
            SELECT d.id, b.origem, b.tanque, b.navio, b.analise, b.frasco, b.data_abertura, b.prazo, d.repeticao_em, b.situacao
            FROM bi.desvios b JOIN desvios_tanque d ON d.id = b.desvio_id - 1000000  -- a view soma 1.000.000 no id do tanque
            WHERE b.tipo = 'Tanque' AND b.status <> 'Concluído'
              AND (%(termo)s = '' OR b.tanque ILIKE %(parecido)s OR coalesce(b.navio, '') ILIKE %(parecido)s)
            ORDER BY b.prazo NULLS LAST, b.desvio_id LIMIT 200
            """,
            filtro,
        )
    ]
    finalizado = con.execute("SELECT EXISTS (SELECT 1 FROM leituras_finalizadas WHERE dia = %s)", (hoje,)).fetchone()[0]
    return Desvios(para_abrir=para_abrir, abertos=abertos, dia_finalizado=finalizado)


class AbrirDesvioDeTanque(BaseModel):
    analise_id: int
    etapa: Literal["pre", "final"]


@roteador.post("/desvios/abrir", response_model=Gravacao)
def abrir_desvio_tanque(
    pedido: AbrirDesvioDeTanque, pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Gravacao:
    r = _chamar(con, "SELECT abrir_desvio_tanque(%s, %s, %s)", (pessoa.usuario_id, pedido.analise_id, pedido.etapa))
    return _resposta(r, False)


@roteador.post("/desvios/{desvio_id}/repeticao", response_model=Gravacao)
def registrar_repeticao(
    desvio_id: int, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    return _resposta(_chamar(con, "SELECT registrar_repeticao(%s, %s)", (pessoa.usuario_id, desvio_id)), False)


class FinalizarDia(BaseModel):
    previa: bool = True


@roteador.post("/leitura-do-dia/finalizar", response_model=Gravacao)
def finalizar_leitura_do_dia(
    pedido: FinalizarDia, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    """O "leitura do dia finalizada" do bot: placas sem digitar viram "<1", drops e TAB/Coliformes de hoje negativos."""
    r = _chamar(con, "SELECT finalizar_leitura_do_dia(%s, %s)", (pessoa.usuario_id, pedido.previa))
    return _resposta(r, pedido.previa)
