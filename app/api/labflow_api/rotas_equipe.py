"""Central do turno: quem está no turno, a linha do tempo "quem fez o quê" e as atividades realizadas escritas à mão.

Spec: 07-app-pwa.md (v1.0), §2 Turno. Tarefa: APP-033. Tabelas das migrations 052 (entradas) e 057 (`app.registros_turno`).

Regras:
- vários analistas dividem o mesmo turno: a equipe é quem tem entrada no turno (e ainda não saiu, ou já saiu e fica na lista);
- quem está no turno coloca mais gente nele (27/11: um PC para todos, cada um sem senha na Lite) e tira quem entrou por
  engano; a entrada de quem foi colocado é a hora do clique, como no Entrar no turno. Só se mexe no PRÓPRIO turno aberto:
  quem não está em turno nenhum, ou quer tirar alguém de outro turno, leva 403;
- a linha do tempo junta, no horário do turno, coletas, leituras NFC, drops, esterilizações, estufas Não ok (a
  conferência Ok não entra), atividades fixas e as linhas livres, sempre com quem e a que horas;
- "Atividades realizadas" (as linhas livres do relatório em Excel): quem escreveu ou o Admin pode excluir; excluir guarda
  quem e quando (nada se apaga de verdade).
"""

from datetime import date, timedelta

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from labflow_api import rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_admin import SQL_NAO_E_REGISTRO_INICIAL
from labflow_api.rotas_atividades import _turno_da_pessoa

roteador = APIRouter(prefix="/turno", tags=["turno"])

LIMITE_LINHA_DO_TEMPO = 150


class Colega(BaseModel):
    usuario_id: int
    nome: str
    entrada: str  # HH:MM
    saida: str | None  # nulo: ainda no turno
    sou_eu: bool


class Disponivel(BaseModel):
    usuario_id: int
    nome: str


class Equipe(BaseModel):
    turno: str
    dia: date
    no_turno: int  # quantas pessoas estão no turno agora (o número do chip no topo)
    pessoas: list[Colega]
    pode_colocar: bool  # quem está logado está neste turno: pode colocar mais gente e tirar quem entrou por engano
    disponiveis: list[Disponivel]  # quem tem acesso e não está no turno agora


class PedidoColocar(BaseModel):
    usuario_id: int


class Registro(BaseModel):
    tipo: str  # coleta, nfc, drop, esterilizacao, estufa, atividade, livre
    texto: str
    quem: str
    quando: str  # HH:MM
    id: int | None = None  # só nas linhas livres (para excluir)
    pode_excluir: bool = False


class RegistrosDoTurno(BaseModel):
    turno: str
    dia: date
    pode_escrever: bool
    itens: list[Registro]  # do mais novo para o mais antigo


EQUIPE_SQL = """
SELECT coalesce(u.nome, c.usuario), e.entrada, e.saida, e.usuario_id
FROM app.entradas_turno e JOIN usuarios u ON u.id = e.usuario_id
LEFT JOIN app.credenciais c ON c.usuario_id = e.usuario_id
WHERE e.turno_id = %s AND e.dia = %s
ORDER BY e.entrada
"""


DISPONIVEIS_SQL = f"""
SELECT u.id, coalesce(nullif(trim(u.nome), ''), c.usuario)
FROM app.credenciais c JOIN usuarios u ON u.id = c.usuario_id
WHERE c.acesso_ativo AND {SQL_NAO_E_REGISTRO_INICIAL} AND NOT EXISTS (
    SELECT 1 FROM app.entradas_turno e WHERE e.usuario_id = u.id AND e.turno_id = %s AND e.dia = %s AND e.saida IS NULL
)
ORDER BY 2
"""


def _equipe(con: psycopg.Connection, pessoa: PessoaLogada) -> Equipe:
    turno, dia = _turno_da_pessoa(con, pessoa)
    pessoas = [
        Colega(
            usuario_id=uid, nome=nome, entrada=rotas_turno._hhmm(entrada), saida=rotas_turno._hhmm(saida),
            sou_eu=uid == pessoa.usuario_id,
        )
        for nome, entrada, saida, uid in con.execute(EQUIPE_SQL, (turno.id, dia))
    ]
    pode_colocar = pode(pessoa.cargo, "entrar_no_turno") and any(p.sou_eu and p.saida is None for p in pessoas)
    disponiveis = (
        [Disponivel(usuario_id=i, nome=n) for i, n in con.execute(DISPONIVEIS_SQL, (turno.id, dia))] if pode_colocar else []
    )
    return Equipe(
        turno=turno.nome, dia=dia, no_turno=sum(p.saida is None for p in pessoas), pessoas=pessoas,
        pode_colocar=pode_colocar, disponiveis=disponiveis,
    )


def _meu_turno(con: psycopg.Connection, pessoa: PessoaLogada):
    """O turno aberto de quem está logado. Só quem está nele mexe na equipe dele: sem turno aberto, 403."""
    turnos = rotas_turno._turnos(con)
    agora = rotas_turno._agora(con)
    aberta = rotas_turno._fechar_esquecida(con, pessoa.usuario_id, turnos, agora)
    if aberta is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só quem está no turno mexe na equipe dele. Entre no turno primeiro.")
    return turnos, agora, aberta


@roteador.get("/equipe", response_model=Equipe)
def equipe_do_turno(
    pessoa: PessoaLogada = Depends(exigir("ver_turno")), con: psycopg.Connection = Depends(obter_conexao)
) -> Equipe:
    return _equipe(con, pessoa)


@roteador.post("/equipe", response_model=Equipe)
def colocar_no_turno(
    pedido: PedidoColocar, pessoa: PessoaLogada = Depends(exigir("entrar_no_turno")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Equipe:
    """Coloca outra pessoa no turno de quem está logado, com a entrada na hora do clique (27/11)."""
    turnos, agora, minha = _meu_turno(con, pessoa)
    ativa = con.execute(
        f"SELECT 1 FROM app.credenciais c JOIN usuarios u ON u.id = c.usuario_id "
        f"WHERE c.usuario_id = %s AND c.acesso_ativo AND {SQL_NAO_E_REGISTRO_INICIAL}",
        (pedido.usuario_id,),
    ).fetchone()
    if ativa is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha uma pessoa da lista.")
    outra = rotas_turno._fechar_esquecida(con, pedido.usuario_id, turnos, agora)
    if outra and (outra.turno_id, outra.dia) == (minha.turno_id, minha.dia):
        return _equipe(con, pessoa)  # já está neste turno
    if outra:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Essa pessoa ainda está no turno {outra.turno} de {outra.dia:%d/%m}: ela precisa sair dele antes."
        )
    con.execute(
        """
        INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada, entrada_registrada, colocado_por)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (usuario_id, turno_id, dia) DO UPDATE SET saida = NULL, saida_registrada = NULL, colocado_por = EXCLUDED.colocado_por
        """,
        (pedido.usuario_id, minha.turno_id, minha.dia, agora, agora, pessoa.usuario_id),
    )
    return _equipe(con, pessoa)


@roteador.delete("/equipe/{usuario_id}", response_model=Equipe)
def tirar_do_turno(
    usuario_id: int, pessoa: PessoaLogada = Depends(exigir("entrar_no_turno")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Equipe:
    """Tira do turno quem foi colocado por engano: a saída é a hora do clique (a própria pessoa usa o Sair do turno).
    Só dentro do turno de quem pede: gente de outro turno leva 403."""
    if usuario_id == pessoa.usuario_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Para sair você mesmo, use o Sair do turno.")
    _, agora, minha = _meu_turno(con, pessoa)
    linha = con.execute(
        "SELECT id, entrada, turno_id, dia FROM app.entradas_turno WHERE usuario_id = %s AND saida IS NULL", (usuario_id,)
    ).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Essa pessoa não está no turno.")
    if (linha[2], linha[3]) != (minha.turno_id, minha.dia):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Essa pessoa está em outro turno: só dá para tirar quem está no seu.")
    saida = max(agora, linha[1] + timedelta(minutes=1))
    con.execute("UPDATE app.entradas_turno SET saida = %s, saida_registrada = %s WHERE id = %s", (saida, agora, linha[0]))
    return _equipe(con, pessoa)


LINHA_DO_TEMPO_SQL = """
SELECT * FROM (
    SELECT 'coleta' AS tipo, 'Coleta ' || coalesce(tanque, '') || coalesce(' · ' || navio, '') AS texto,
           coalesce(nullif(registrado_por, ''), 'Sem nome') AS quem, registrado_em AS quando, NULL::bigint AS id, NULL::bigint AS autor
    FROM bi.coletas WHERE registrado_em >= %(de)s AND registrado_em < %(ate)s
  UNION ALL
    SELECT 'nfc', 'Leitura ' || coalesce(analise, 'NFC') || ' · ' || coalesce(tanque, '') || coalesce(' ' || frasco, ''),
           coalesce(nullif(lida_por, ''), 'Sem nome'), lida_em, NULL, NULL
    FROM bi.leituras_nfc WHERE lida_em >= %(de)s AND lida_em < %(ate)s
  UNION ALL
    SELECT 'drop', 'Drop ' || coalesce("drop", '') || ' · ' || coalesce(tanque, ''),
           coalesce(nullif(concluido_por, ''), 'Sem nome'), concluido_em, NULL, NULL
    FROM bi.drops WHERE concluido_em >= %(de)s AND concluido_em < %(ate)s
  UNION ALL
    SELECT 'esterilizacao', 'Esterilização ' || lower(s.tipo) || ' · ciclo ' || s.ciclo, coalesce(u.nome, c.usuario), s.feita_em, NULL, NULL
    FROM app.esterilizacoes s JOIN usuarios u ON u.id = s.feita_por LEFT JOIN app.credenciais c ON c.usuario_id = s.feita_por
    WHERE s.turno_id = %(turno)s AND s.dia = %(dia)s AND s.excluida_em IS NULL
  UNION ALL
    SELECT 'estufa', 'Estufa ' || lpad(l.estufa_id::text, 2, '0') || ' · ' || lower(l.leitura) || ' não ok'
           || coalesce(' (' || replace(l.temperatura::text, '.', ',') || ' °C)', ''),
           coalesce(u.nome, c.usuario), l.feita_em, NULL, NULL
    FROM app.leituras_estufa l JOIN usuarios u ON u.id = l.feita_por LEFT JOIN app.credenciais c ON c.usuario_id = l.feita_por
    WHERE l.turno_id = %(turno)s AND l.dia = %(dia)s AND NOT l.ok  -- a conferência Ok não entra na linha do tempo (24/10)
  UNION ALL
    SELECT 'atividade', a.texto || CASE WHEN f.feito THEN '' ELSE ' (não feito)' END,
           coalesce(u.nome, c.usuario), f.marcado_em, NULL, NULL
    FROM app.atividades_feitas f
    LEFT JOIN app.atividades_fixas a ON a.id = f.atividade_fixa_id
    JOIN usuarios u ON u.id = f.marcado_por LEFT JOIN app.credenciais c ON c.usuario_id = f.marcado_por
    WHERE f.turno_id = %(turno)s AND f.dia = %(dia)s AND a.texto IS NOT NULL
  UNION ALL
    SELECT 'livre', r.texto, coalesce(u.nome, c.usuario), r.feita_em, r.id, r.feita_por
    FROM app.registros_turno r JOIN usuarios u ON u.id = r.feita_por LEFT JOIN app.credenciais c ON c.usuario_id = r.feita_por
    WHERE r.turno_id = %(turno)s AND r.dia = %(dia)s AND r.excluida_em IS NULL
) t ORDER BY quando DESC LIMIT %(limite)s
"""


class Realizada(BaseModel):
    texto: str
    quem: str
    quando: str  # HH:MM


def realizadas_do_turno(con: psycopg.Connection, turno_id: int, dia: date) -> list[Realizada]:
    """As linhas livres de "Atividades realizadas" do turno, na ordem em que foram escritas (vão para o relatório)."""
    return [
        Realizada(texto=texto, quem=quem, quando=rotas_turno._hhmm(quando))
        for texto, quem, quando in con.execute(
            """
            SELECT r.texto, coalesce(u.nome, c.usuario), r.feita_em
            FROM app.registros_turno r JOIN usuarios u ON u.id = r.feita_por LEFT JOIN app.credenciais c ON c.usuario_id = r.feita_por
            WHERE r.turno_id = %s AND r.dia = %s AND r.excluida_em IS NULL ORDER BY r.feita_em
            """,
            (turno_id, dia),
        )
    ]


def _registros(con: psycopg.Connection, pessoa: PessoaLogada) -> RegistrosDoTurno:
    turno, dia = _turno_da_pessoa(con, pessoa)
    if pessoa.cargo == "Coletor":  # Coletor vê só as próprias coletas (07, Permissões): a linha do tempo é de quem analisa
        return RegistrosDoTurno(turno=turno.nome, dia=dia, pode_escrever=False, itens=[])
    de, ate = rotas_turno.janela(turno, dia)
    linhas = con.execute(
        LINHA_DO_TEMPO_SQL, {"de": de, "ate": ate, "turno": turno.id, "dia": dia, "limite": LIMITE_LINHA_DO_TEMPO}
    ).fetchall()
    itens = [
        Registro(
            tipo=tipo, texto=texto, quem=quem, quando=rotas_turno._hhmm(quando), id=id_,
            pode_excluir=id_ is not None and (autor == pessoa.usuario_id or pessoa.cargo == "Admin"),
        )
        for tipo, texto, quem, quando, id_, autor in linhas
    ]
    return RegistrosDoTurno(turno=turno.nome, dia=dia, pode_escrever=pode(pessoa.cargo, "registrar_analise"), itens=itens)


@roteador.get("/registros", response_model=RegistrosDoTurno)
def registros_do_turno(
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)
) -> RegistrosDoTurno:
    return _registros(con, pessoa)


class NovoRegistro(BaseModel):
    texto: str = Field(max_length=200)


@roteador.post("/registros", response_model=RegistrosDoTurno, status_code=status.HTTP_201_CREATED)
def escrever(
    pedido: NovoRegistro,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> RegistrosDoTurno:
    texto = " ".join(pedido.texto.split())
    if not texto:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o que foi feito.")
    turno, dia = _turno_da_pessoa(con, pessoa)
    con.execute(
        "INSERT INTO app.registros_turno (turno_id, dia, texto, feita_por, feita_em) VALUES (%s, %s, %s, %s, clock_timestamp())",
        (turno.id, dia, texto, pessoa.usuario_id),
    )
    return _registros(con, pessoa)


@roteador.delete("/registros/{registro_id}", response_model=RegistrosDoTurno)
def excluir(
    registro_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> RegistrosDoTurno:
    turno, dia = _turno_da_pessoa(con, pessoa)
    linha = con.execute(
        "SELECT feita_por FROM app.registros_turno WHERE id = %s AND turno_id = %s AND dia = %s AND excluida_em IS NULL",
        (registro_id, turno.id, dia),
    ).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esse registro não está no seu turno.")
    if linha[0] != pessoa.usuario_id and pessoa.cargo != "Admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Só quem escreveu (ou o Admin) pode excluir.")
    con.execute(
        "UPDATE app.registros_turno SET excluida_por = %s, excluida_em = clock_timestamp() WHERE id = %s",
        (pessoa.usuario_id, registro_id),
    )
    return _registros(con, pessoa)
