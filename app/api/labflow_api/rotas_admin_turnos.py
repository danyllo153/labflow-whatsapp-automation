"""Admin: horários dos turnos, atividades fixas, estufas e faixas de trabalho.

Spec: 07-app-pwa.md (v1.0), "10. Admin" e "3. Início" (atividades fixas "cadastradas pelo Admin"), "7.1" (faixas só no banco).
Tarefa: APP-028. Tabelas das migrations 052 (turnos, atividades) e 055 (estufas, faixas). Só o Admin (`configurar_turnos`).
Atividade e estufa se desativam em vez de apagar (o que já foi marcado continua com o texto certo).
As faixas de trabalho reais entram aqui, pelo Admin, e ficam só no banco: nunca no repositório.
"""

from datetime import date, time
from decimal import Decimal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from labflow_api import rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir

roteador = APIRouter(prefix="/admin/turnos", tags=["admin"])

HORARIO = rotas_turno.HORARIO


class HorarioTurno(BaseModel):
    id: int
    nome: str
    inicio: str
    fim: str


class AtividadeFixa(BaseModel):
    id: int
    turno_id: int
    texto: str
    dias_semana: list[int] | None
    ordem: int
    ativa: bool


class FaixaVigente(BaseModel):
    id: int
    minimo: Decimal
    maximo: Decimal
    desde: date
    ate: date | None


class EstufaAdmin(BaseModel):
    id: int
    auxiliar: bool
    ativa: bool
    faixa: FaixaVigente | None  # a vigente hoje
    historico: list[FaixaVigente]


class Configuracao(BaseModel):
    turnos: list[HorarioTurno]
    atividades: list[AtividadeFixa]
    estufas: list[EstufaAdmin]


def _faixas(con: psycopg.Connection, hoje: date) -> dict[int, list[FaixaVigente]]:
    por_estufa: dict[int, list[FaixaVigente]] = {}
    for id_, estufa, mn, mx, desde, ate in con.execute(
        "SELECT id, estufa_id, minimo, maximo, vigente_desde, vigente_ate FROM app.faixas_estufa ORDER BY estufa_id, vigente_desde DESC"
    ):
        por_estufa.setdefault(estufa, []).append(FaixaVigente(id=id_, minimo=mn, maximo=mx, desde=desde, ate=ate))
    return por_estufa


def _configuracao(con: psycopg.Connection) -> Configuracao:
    hoje = rotas_turno._agora(con).astimezone(rotas_turno.FUSO).date()
    faixas = _faixas(con, hoje)
    return Configuracao(
        turnos=[
            HorarioTurno(id=t.id, nome=t.nome, inicio=rotas_turno._hhmm(t.inicio), fim=rotas_turno._hhmm(t.fim))
            for t in rotas_turno._turnos(con)
        ],
        atividades=[
            AtividadeFixa(id=i, turno_id=t, texto=x, dias_semana=sorted(d) if d else None, ordem=o, ativa=a)
            for i, t, x, d, o, a in con.execute(
                "SELECT id, turno_id, texto, dias_semana, ordem, ativa FROM app.atividades_fixas ORDER BY turno_id, ordem"
            )
        ],
        estufas=[
            EstufaAdmin(
                id=i, auxiliar=aux, ativa=ativa,
                faixa=next((f for f in faixas.get(i, []) if f.desde <= hoje and (f.ate is None or f.ate >= hoje)), None),
                historico=faixas.get(i, []),
            )
            for i, aux, ativa in con.execute("SELECT id, auxiliar, ativa FROM app.estufas ORDER BY id")
        ],
    )


@roteador.get("", response_model=Configuracao)
def configuracao(
    admin: PessoaLogada = Depends(exigir("configurar_turnos")), con: psycopg.Connection = Depends(obter_conexao)
) -> Configuracao:
    return _configuracao(con)


# ---------------------------------------------------------------- horários dos turnos
class NovoHorario(BaseModel):
    id: int
    inicio: str = Field(pattern=HORARIO)
    fim: str = Field(pattern=HORARIO)


class NovosHorarios(BaseModel):
    turnos: list[NovoHorario]


def _minutos(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def conferir_cobertura(turnos: list[tuple[str, str]]) -> None:
    """Os turnos precisam cobrir as 24 horas, um começando quando o outro termina, sem sobrepor."""
    comeco = sorted(turnos, key=lambda t: _minutos(t[0]))
    for (_, fim), (proximo, _) in zip(comeco, comeco[1:] + comeco[:1]):
        if _minutos(fim) != _minutos(proximo):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Os três turnos precisam cobrir as 24 horas: cada um começa na hora em que o anterior termina.",
            )
    if any(_minutos(i) == _minutos(f) for i, f in turnos):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Um turno não pode começar e terminar na mesma hora.")


@roteador.put("/horarios", response_model=Configuracao)
def horarios(
    novos: NovosHorarios,
    admin: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Configuracao:
    """Muda os horários padrão dos três turnos de uma vez (a soma precisa fechar as 24 horas)."""
    existentes = {t.id for t in rotas_turno._turnos(con)}
    if {n.id for n in novos.turnos} != existentes or len(novos.turnos) != len(existentes):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Mande os horários dos três turnos.")
    conferir_cobertura([(n.inicio, n.fim) for n in novos.turnos])
    for n in novos.turnos:
        con.execute(
            "UPDATE app.turnos SET inicio = %s, fim = %s WHERE id = %s", (time.fromisoformat(n.inicio), time.fromisoformat(n.fim), n.id)
        )
    return _configuracao(con)


# ---------------------------------------------------------------- atividades fixas
class NovaAtividade(BaseModel):
    turno_id: int
    texto: str = Field(max_length=120)
    dias_semana: list[int] | None = None  # 1 = segunda ... 7 = domingo; vazio = todos os dias


def _dias(dias: list[int] | None) -> list[int] | None:
    if not dias:
        return None
    if any(d < 1 or d > 7 for d in dias):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Dia da semana de 1 (segunda) a 7 (domingo).")
    return sorted(set(dias))


def _texto(texto: str) -> str:
    texto = texto.strip()
    if not texto:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva a atividade.")
    return texto


@roteador.post("/atividades", response_model=Configuracao, status_code=status.HTTP_201_CREATED)
def nova_atividade(
    pedido: NovaAtividade,
    admin: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Configuracao:
    if con.execute("SELECT 1 FROM app.turnos WHERE id = %s", (pedido.turno_id,)).fetchone() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Turno não encontrado.")
    con.execute(
        """
        INSERT INTO app.atividades_fixas (turno_id, texto, dias_semana, ordem, criada_por)
        VALUES (%s, %s, %s, (SELECT coalesce(max(ordem), 0) + 1 FROM app.atividades_fixas WHERE turno_id = %s), %s)
        """,
        (pedido.turno_id, _texto(pedido.texto), _dias(pedido.dias_semana), pedido.turno_id, admin.usuario_id),
    )
    return _configuracao(con)


class MudancaAtividade(BaseModel):
    texto: str = Field(max_length=120)
    dias_semana: list[int] | None = None
    ativa: bool = True


@roteador.put("/atividades/{atividade_id}", response_model=Configuracao)
def mudar_atividade(
    atividade_id: int,
    mudanca: MudancaAtividade,
    admin: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Configuracao:
    """Muda o texto, os dias ou desativa/reativa (desativar não apaga: o que já foi marcado continua)."""
    feito = con.execute(
        "UPDATE app.atividades_fixas SET texto = %s, dias_semana = %s, ativa = %s WHERE id = %s",
        (_texto(mudanca.texto), _dias(mudanca.dias_semana), mudanca.ativa, atividade_id),
    ).rowcount
    if not feito:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Atividade não encontrada.")
    return _configuracao(con)


class Movimento(BaseModel):
    direcao: str = Field(pattern="^(cima|baixo)$")


@roteador.post("/atividades/{atividade_id}/mover", response_model=Configuracao)
def mover_atividade(
    atividade_id: int,
    movimento: Movimento,
    admin: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Configuracao:
    """Troca de lugar com a vizinha de cima ou de baixo no mesmo turno (a ordem tem de ser única por turno)."""
    atual = con.execute("SELECT turno_id, ordem FROM app.atividades_fixas WHERE id = %s", (atividade_id,)).fetchone()
    if atual is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Atividade não encontrada.")
    turno_id, ordem = atual
    comparacao, ordenacao = ("<", "DESC") if movimento.direcao == "cima" else (">", "ASC")
    vizinha = con.execute(
        f"SELECT id, ordem FROM app.atividades_fixas WHERE turno_id = %s AND ordem {comparacao} %s ORDER BY ordem {ordenacao} LIMIT 1",
        (turno_id, ordem),
    ).fetchone()
    if vizinha is not None:
        con.execute("UPDATE app.atividades_fixas SET ordem = -1 WHERE id = %s", (atividade_id,))  # passo intermediário
        con.execute("UPDATE app.atividades_fixas SET ordem = %s WHERE id = %s", (ordem, vizinha[0]))
        con.execute("UPDATE app.atividades_fixas SET ordem = %s WHERE id = %s", (vizinha[1], atividade_id))
    return _configuracao(con)


# ---------------------------------------------------------------- estufas e faixas
class NovaEstufa(BaseModel):
    id: int = Field(ge=1, le=99)
    auxiliar: bool = False


@roteador.post("/estufas", response_model=Configuracao, status_code=status.HTTP_201_CREATED)
def nova_estufa(
    pedido: NovaEstufa,
    admin: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Configuracao:
    if con.execute("SELECT 1 FROM app.estufas WHERE id = %s", (pedido.id,)).fetchone():
        raise HTTPException(status.HTTP_409_CONFLICT, f"A estufa {pedido.id:02d} já existe.")
    con.execute("INSERT INTO app.estufas (id, auxiliar) VALUES (%s, %s)", (pedido.id, pedido.auxiliar))
    return _configuracao(con)


class MudancaEstufa(BaseModel):
    ativa: bool


@roteador.put("/estufas/{estufa_id}", response_model=Configuracao)
def mudar_estufa(
    estufa_id: int,
    mudanca: MudancaEstufa,
    admin: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Configuracao:
    """Desativa ou reativa a estufa (as leituras já feitas ficam)."""
    if not con.execute("UPDATE app.estufas SET ativa = %s WHERE id = %s", (mudanca.ativa, estufa_id)).rowcount:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Estufa não encontrada.")
    return _configuracao(con)


class NovaFaixa(BaseModel):
    minimo: Decimal = Field(ge=-20, le=200, decimal_places=1)
    maximo: Decimal = Field(ge=-20, le=200, decimal_places=1)
    desde: date | None = None  # padrão: hoje


@roteador.put("/estufas/{estufa_id}/faixa", response_model=Configuracao)
def nova_faixa(
    estufa_id: int,
    faixa: NovaFaixa,
    admin: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Configuracao:
    """Cadastra a faixa de trabalho a partir de uma data; a anterior termina no dia anterior (fica o histórico)."""
    linha = con.execute("SELECT auxiliar FROM app.estufas WHERE id = %s", (estufa_id,)).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Estufa não encontrada.")
    if linha[0]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A estufa auxiliar não tem faixa de trabalho.")
    if faixa.maximo <= faixa.minimo:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O máximo precisa ser maior que o mínimo.")
    desde = faixa.desde or rotas_turno._agora(con).astimezone(rotas_turno.FUSO).date()
    con.execute(
        """
        UPDATE app.faixas_estufa SET vigente_ate = %s::date - 1
        WHERE estufa_id = %s AND vigente_desde < %s AND (vigente_ate IS NULL OR vigente_ate >= %s)
        """,
        (desde, estufa_id, desde, desde),
    )
    con.execute(
        """
        INSERT INTO app.faixas_estufa (estufa_id, minimo, maximo, vigente_desde, criada_por)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (estufa_id, vigente_desde) DO UPDATE SET minimo = EXCLUDED.minimo, maximo = EXCLUDED.maximo,
                                                             vigente_ate = NULL, criada_por = EXCLUDED.criada_por
        """,
        (estufa_id, faixa.minimo, faixa.maximo, desde, admin.usuario_id),
    )
    return _configuracao(con)
