"""Entrar e sair do turno, editar o próprio horário e o cartão "Feito no turno" do Início.

Spec: 07-app-pwa.md (v1.0), "2. Entrar no turno", "3. Início" e "Permissões"; 08 A2. Tarefa: APP-022.
Tabelas da migration 052 (`app.turnos`, `app.entradas_turno`, `app.atividades_feitas`).

Regras de horário (sempre em America/Sao_Paulo):
- o turno de um dia vai de `inicio` a `fim`; se `fim` não passa de `inicio` (Tarde 16:00–00:00), termina no dia seguinte;
- a Madrugada conta no dia em que COMEÇA (00:00);
- um horário digitado ("15:00", "00:30") cai no dia que fica mais perto do meio do turno: 00:00 na Tarde é a meia-noite
  do fim do turno; 23:30 na Madrugada é a noite anterior (entrou mais cedo).
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api import permissoes
from labflow_api.permissoes import exigir, pode

roteador = APIRouter(prefix="/turno", tags=["turno"])

FUSO = ZoneInfo("America/Sao_Paulo")
HORARIO = r"^([01]\d|2[0-3]):[0-5]\d$"  # HH:MM
ANTECEDENCIA = timedelta(hours=2)  # entrar no próximo turno só quem chega até 2 h antes (decidido em 23/10)


@dataclass(frozen=True)
class Turno:
    id: int
    nome: str
    inicio: time
    fim: time


def janela(turno: Turno, dia: date) -> tuple[datetime, datetime]:
    """Começo e fim do turno no dia, com o horário padrão."""
    comeco = datetime.combine(dia, turno.inicio, FUSO)
    fim = datetime.combine(dia, turno.fim, FUSO)
    if fim <= comeco:
        fim += timedelta(days=1)
    return comeco, fim


def turno_agora(turnos: list[Turno], agora: datetime) -> tuple[Turno, date]:
    """O turno (e o dia dele) em que `agora` cai: é a sugestão da tela de entrar."""
    hoje = agora.astimezone(FUSO).date()
    for dia in (hoje, hoje - timedelta(days=1)):
        for t in turnos:
            comeco, fim = janela(t, dia)
            if comeco <= agora < fim:
                return t, dia
    raise ValueError("Os turnos não cobrem o dia inteiro.")  # a 052 cobre: 08–16, 16–00, 00–08


def dia_do_turno(turno: Turno, agora: datetime) -> date:
    """Dia do turno escolhido: o que está em andamento ou, se ainda não começou, o próximo.

    Nunca um turno que já terminou: entrar nele faria a entrada fechar sozinha na hora (a Tarde escolhida às 02:00
    é a Tarde de hoje, às 16:00; a Madrugada escolhida às 23:30 é a que começa à meia-noite).
    """
    hoje = agora.astimezone(FUSO).date()
    dias = [hoje - timedelta(days=1), hoje, hoje + timedelta(days=1)]
    return min((d for d in dias if janela(turno, d)[1] > agora), key=lambda d: janela(turno, d)[0])


def horario_no_turno(turno: Turno, dia: date, hhmm: str) -> datetime:
    """Põe um "HH:MM" digitado no dia certo, perto do meio do turno (ver o topo do arquivo)."""
    comeco, fim = janela(turno, dia)
    meio = comeco + (fim - comeco) / 2
    hora = time.fromisoformat(hhmm)
    opcoes = [datetime.combine(dia + timedelta(days=d), hora, FUSO) for d in (-1, 0, 1)]
    return min(opcoes, key=lambda o: abs(o - meio))


def _hhmm(valor: time | datetime | None) -> str | None:
    if valor is None:
        return None
    if isinstance(valor, datetime):
        valor = valor.astimezone(FUSO)
    return valor.strftime("%H:%M")


def _turnos(con: psycopg.Connection) -> list[Turno]:
    return [Turno(*linha) for linha in con.execute("SELECT id, nome, inicio, fim FROM app.turnos ORDER BY ordem")]


def _agora(con: psycopg.Connection) -> datetime:
    return con.execute("SELECT now()").fetchone()[0]


class TurnoPadrao(BaseModel):
    id: int
    nome: str
    inicio: str  # HH:MM
    fim: str


class Entrada(BaseModel):
    id: int
    turno_id: int
    turno: str
    dia: date
    entrada: str  # HH:MM (a corrigida, se houve correção)
    saida: str | None  # nulo: ainda no turno
    entrada_registrada: str  # hora do clique em Entrar no turno (053: nunca muda)
    saida_registrada: str | None
    motivo_correcao: str | None  # preenchido quando a pessoa corrigiu o horário


class Sugestao(BaseModel):
    turno_id: int
    dia: date


class FeitoNoTurno(BaseModel):
    turno: str
    dia: date
    total: int
    coletas: int
    leituras: int
    drops: int
    atividades: int


class EstadoDoTurno(BaseModel):
    turnos: list[TurnoPadrao]
    sugestao: Sugestao
    pode_entrar: bool
    checkin_obrigatorio: bool  # Operador e Coletor: o resto do app só abre depois de entrar no turno
    no_turno: Entrada | None
    recentes: list[Entrada]  # as últimas entradas da pessoa, para editar o horário
    feito_no_turno: FeitoNoTurno


ENTRADA_SQL = """
SELECT e.id, e.turno_id, t.nome, e.dia, e.entrada, e.saida, e.entrada_registrada, e.saida_registrada, e.motivo_correcao
FROM app.entradas_turno e JOIN app.turnos t ON t.id = e.turno_id
"""


def _entrada(linha) -> Entrada:
    id_, turno_id, nome, dia, entrada, saida, entrada_registrada, saida_registrada, motivo = linha
    return Entrada(
        id=id_, turno_id=turno_id, turno=nome, dia=dia, entrada=_hhmm(entrada), saida=_hhmm(saida),
        entrada_registrada=_hhmm(entrada_registrada), saida_registrada=_hhmm(saida_registrada), motivo_correcao=motivo,
    )


def _fechar_esquecida(con: psycopg.Connection, usuario_id: int, turnos: list[Turno], agora: datetime) -> Entrada | None:
    """08 A2: quem esqueceu de sair sai sozinho no fim do turno. Devolve a entrada que ficou aberta e é de agora."""
    linha = con.execute(ENTRADA_SQL + " WHERE e.usuario_id = %s AND e.saida IS NULL", (usuario_id,)).fetchone()
    if linha is None:
        return None
    turno = next(t for t in turnos if t.id == linha[1])
    _, fim = janela(turno, linha[3])
    if agora < fim:
        return _entrada(linha)
    saida = max(fim, linha[4] + timedelta(minutes=1))
    con.execute("UPDATE app.entradas_turno SET saida = %s, saida_registrada = %s WHERE id = %s", (saida, saida, linha[0]))
    return None


FEITO_SQL = """
SELECT
    (SELECT count(*) FROM bi.coletas WHERE registrado_em >= %(de)s AND registrado_em < %(ate)s),
    (SELECT count(*) FROM bi.leituras_nfc WHERE lida_em >= %(de)s AND lida_em < %(ate)s),
    (SELECT count(*) FROM bi.drops WHERE concluido_em >= %(de)s AND concluido_em < %(ate)s),
    (SELECT count(*) FROM app.atividades_feitas WHERE turno_id = %(turno)s AND dia = %(dia)s AND feito)
"""


def _feito_no_turno(con: psycopg.Connection, turno: Turno, dia: date) -> FeitoNoTurno:
    """O que o laboratório registrou no horário do turno (07 §3, cartão "Feito no turno"), pelas views do Power BI.

    Por ora conta pela hora padrão do turno; o relatório do turno (APP-024) separa por quem gravou.
    """
    de, ate = janela(turno, dia)
    coletas, leituras, drops, atividades = con.execute(FEITO_SQL, {"de": de, "ate": ate, "turno": turno.id, "dia": dia}).fetchone()
    return FeitoNoTurno(
        turno=turno.nome, dia=dia, total=coletas + leituras + drops + atividades,
        coletas=coletas, leituras=leituras, drops=drops, atividades=atividades,
    )


@roteador.get("", response_model=EstadoDoTurno)
def estado_do_turno(
    pessoa: PessoaLogada = Depends(exigir("ver_turno")), con: psycopg.Connection = Depends(obter_conexao)
) -> EstadoDoTurno:
    turnos = _turnos(con)
    agora = _agora(con)
    sugerido, dia = turno_agora(turnos, agora)
    no_turno = _fechar_esquecida(con, pessoa.usuario_id, turnos, agora)
    recentes = [
        _entrada(l)
        for l in con.execute(ENTRADA_SQL + " WHERE e.usuario_id = %s ORDER BY e.entrada DESC LIMIT 5", (pessoa.usuario_id,))
    ]
    turno_do_cartao = next(t for t in turnos if t.id == no_turno.turno_id) if no_turno else sugerido
    return EstadoDoTurno(
        turnos=[TurnoPadrao(id=t.id, nome=t.nome, inicio=_hhmm(t.inicio), fim=_hhmm(t.fim)) for t in turnos],
        sugestao=Sugestao(turno_id=sugerido.id, dia=dia),
        pode_entrar=pode(pessoa.cargo, "entrar_no_turno"),
        checkin_obrigatorio=pessoa.cargo in permissoes.CHECKIN_OBRIGATORIO,
        no_turno=no_turno,
        recentes=recentes,
        feito_no_turno=_feito_no_turno(con, turno_do_cartao, no_turno.dia if no_turno else dia),
    )


class PedidoEntrar(BaseModel):
    turno_id: int  # a entrada é a hora do clique (check-in, decidido em 23/10)


@roteador.post("/entrar", response_model=Entrada)
def entrar(
    pedido: PedidoEntrar,
    pessoa: PessoaLogada = Depends(exigir("entrar_no_turno")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Entrada:
    turnos = _turnos(con)
    turno = next((t for t in turnos if t.id == pedido.turno_id), None)
    if turno is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha Manhã, Tarde ou Madrugada.")
    agora = _agora(con)
    dia = dia_do_turno(turno, agora)
    comeco = janela(turno, dia)[0]
    if comeco - agora > ANTECEDENCIA:
        atual, _ = turno_agora(turnos, agora)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"A {turno.nome} começa às {_hhmm(comeco)}. Entre quando chegar ou escolha a {atual.nome}.",
        )
    aberta = _fechar_esquecida(con, pessoa.usuario_id, turnos, agora)
    if aberta and (aberta.turno_id, aberta.dia) == (turno.id, dia):
        return aberta  # já está nesse turno (tocou duas vezes)
    if aberta:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Você ainda está no turno {aberta.turno} de {aberta.dia:%d/%m}. Toque em Sair do turno antes.",
        )
    # Já tinha saído desse mesmo turno (saiu sem querer): volta a ficar no turno, com a entrada de antes.
    linha = con.execute(
        """
        INSERT INTO app.entradas_turno (usuario_id, turno_id, dia, entrada, entrada_registrada) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (usuario_id, turno_id, dia) DO UPDATE SET saida = NULL, saida_registrada = NULL
        RETURNING id
        """,
        (pessoa.usuario_id, turno.id, dia, agora, agora),
    ).fetchone()
    return _entrada(con.execute(ENTRADA_SQL + " WHERE e.id = %s", linha).fetchone())


def _conferir_horarios(entrada: datetime, saida: datetime | None) -> None:
    if saida is not None and saida <= entrada:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"A saída precisa ser depois da entrada ({_hhmm(entrada)})."
        )
    if saida is not None and saida - entrada > timedelta(hours=16):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Mais de 16 horas no turno: confira os horários.")


@roteador.post("/sair", response_model=Entrada)
def sair(
    pessoa: PessoaLogada = Depends(exigir("entrar_no_turno")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Entrada:
    turnos = _turnos(con)
    agora = _agora(con)
    aberta = _fechar_esquecida(con, pessoa.usuario_id, turnos, agora)
    if aberta is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Você não está em nenhum turno.")
    entrada = con.execute("SELECT entrada FROM app.entradas_turno WHERE id = %s", (aberta.id,)).fetchone()[0]
    saida = max(agora, entrada + timedelta(minutes=1))  # a hora do clique (check-out)
    con.execute("UPDATE app.entradas_turno SET saida = %s, saida_registrada = %s WHERE id = %s", (saida, agora, aberta.id))
    return _entrada(con.execute(ENTRADA_SQL + " WHERE e.id = %s", (aberta.id,)).fetchone())


class PedidoHorario(BaseModel):
    entrada: str = Field(pattern=HORARIO)
    saida: str | None = Field(default=None, pattern=HORARIO)  # só para quem já saiu
    motivo: str = Field(min_length=5, max_length=300)  # corrigir pede motivo (decidido em 23/10)


@roteador.put("/entradas/{entrada_id}", response_model=Entrada)
def editar_horario(
    entrada_id: int,
    pedido: PedidoHorario,
    pessoa: PessoaLogada = Depends(exigir("entrar_no_turno")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Entrada:
    """07 §2: a própria pessoa corrige a entrada e a saída (esqueceu de marcar na hora), sempre com motivo.

    O horário do clique fica guardado em entrada_registrada e saida_registrada (053).
    """
    linha = con.execute(ENTRADA_SQL + " WHERE e.id = %s AND e.usuario_id = %s", (entrada_id, pessoa.usuario_id)).fetchone()
    if linha is None:  # de outra pessoa ou não existe: a mesma resposta
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entrada no turno não encontrada.")
    atual = _entrada(linha)
    if atual.saida is None and pedido.saida is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Para registrar a saída, use Sair do turno.")
    if atual.saida is not None and pedido.saida is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Informe também a saída.")
    if len(pedido.motivo.strip()) < 5:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o motivo da correção.")
    turno = next(t for t in _turnos(con) if t.id == atual.turno_id)
    entrada = horario_no_turno(turno, atual.dia, pedido.entrada)
    saida = horario_no_turno(turno, atual.dia, pedido.saida) if pedido.saida else None
    _conferir_horarios(entrada, saida)
    con.execute(
        "UPDATE app.entradas_turno SET entrada = %s, saida = %s, editada_em = now(), motivo_correcao = %s, "
        "corrigida_por = %s WHERE id = %s",
        (entrada, saida, pedido.motivo.strip(), pessoa.usuario_id, entrada_id),
    )
    return _entrada(con.execute(ENTRADA_SQL + " WHERE e.id = %s", (entrada_id,)).fetchone())
