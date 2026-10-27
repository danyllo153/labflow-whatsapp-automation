"""Água de consumo (Águas e superfícies): Santos e TMG (Guarujá), mensal e semanal, e a água dos navios (TEC e COZ).

Pedido do Danyllo de 27/10/2026. Tabelas da migration 079.

Regras:
- mensal (Santos e TMG, mesmo laudo "Água de consumo"): C.T 48 h, B.L 120 h, Coliformes totais e E.coli (P/A; o bag
  dá o resultado em 24 h); uma linha por ponto, com a data só na primeira linha da coleta;
- semanal: físico-química (pH, cloro livre e observação, medidos na hora) e microbiológica (Coliformes e E.coli, 24 h),
  dos mesmos pontos; uma coleta é um bloco do laudo (2 por folha na físico-química, 1 na microbiológica);
- navio: a mesma tabela do mensal, com o navio e a viagem na amostra ("O.BLOSSOM II - 123 TEC"), uma folha por navio
  (cheia, abre outra); TEC = água técnica, COZ = água da cozinha;
- mensal com os pontos fixos do semanal (080): no ponto do mensal marcado "semanal", mede-se também pH e cloro (na
  hora), e a coleta mensal vale como a semanal daquela semana: essas linhas entram nos laudos físico-químico e
  microbiológico semanais (a folha mensal continua com todos os pontos);
- os pontos são editáveis pelo Admin (nome, ordem, ativo, a marca "semanal"); o nome e a marca são copiados na coleta;
- os limites (C.T, B.L, pH e cloro) são do banco, editáveis pelo Admin; o repositório só tem valores fictícios;
- quem coleta: Admin, Analista e Coletor; quem lança: Admin e Analista; o resultado passa pela prévia antes do Confirmar.
"""

from collections.abc import Callable
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from labflow_api import laudo_esterilizacao, laudos, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_aguas import Exclusao, _hoje, _quando, resultado
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/aguas/consumo", tags=["água de consumo"])

Unidade = Literal["Santos", "TMG"]
Tipo = Literal["mensal", "semanal"]
MAX_PONTOS = {("TMG", "mensal"): 30, ("Santos", "mensal"): 8, ("TMG", "semanal"): 10, ("Santos", "semanal"): 10}
PONTOS_DO_NAVIO = {"TEC": "Água técnica", "COZ": "Água da cozinha"}
DIAS_NA_TELA = 60
PARAMETROS = ("ct", "bl", "ph_min", "ph_max", "cloro_min", "cloro_max")


# --- modelos -----------------------------------------------------------------------------------------------------------


class Ponto(BaseModel):
    id: int
    nome: str
    ordem: int
    ativo: bool
    semanal: bool = False  # só no mensal: também é ponto fixo do semanal (pH e cloro)


class Resultado(BaseModel):
    ordem: int
    ponto: str
    ct: str | None = None
    bl: str | None = None
    coliformes: Literal["P", "A"] | None = None
    ecoli: Literal["P", "A"] | None = None
    ph: float | None = None
    cloro: float | None = None
    observacao: str | None = None
    semanal: bool = False  # linha do mensal que vale também como semanal (pH e cloro; entra nos laudos semanais)
    fora: list[str] = []  # o que passou do limite ("C.T", "pH"...)


class Coleta(BaseModel):
    id: int
    unidade: str
    tipo: str
    navio: str | None
    dia: date
    hora: str
    quem: str
    analisada_em: str | None  # "dd/mm/aaaa HH:MM"
    analisada_por: str | None
    resultados: list[Resultado]
    faltas: list[str]  # "C.T 48h (29/10)"...
    situacao: str  # Concluída, Atrasado: ..., Vence hoje: ..., Aguardando ...
    nao_ok: int


class Limites(BaseModel):
    ct: float
    bl: float
    ph_min: float
    ph_max: float
    cloro_min: float
    cloro_max: float


class AguaDeConsumo(BaseModel):
    pode_coletar: bool
    pode_lancar: bool
    pode_configurar: bool
    pontos: dict[str, dict[str, list[Ponto]]]  # unidade -> tipo -> pontos
    pontos_do_navio: dict[str, str]
    limites: Limites
    coletas: list[Coleta]  # a mais nova primeiro: últimos 60 dias e as que ainda têm leitura
    navios: list[str]  # navios com água registrada, o mais recente primeiro


# --- leitura -----------------------------------------------------------------------------------------------------------


def _limites(con: psycopg.Connection) -> Limites:
    valores = dict(con.execute("SELECT parametro, valor FROM app.limites_agua_consumo").fetchall())
    return Limites(**{p: float(valores.get(p, 0)) for p in PARAMETROS})


def _numero(texto: str | None) -> tuple[float, bool] | None:
    """'<1' -> (1, True); '120' -> (120, False); '-' ou vazio -> None."""
    if not texto or texto == "-":
        return None
    try:
        return float(texto.lstrip("<>").replace(",", ".")), texto.startswith("<")
    except ValueError:
        return None


def fora_do_limite(r: Resultado, lim: Limites) -> list[str]:
    fora = []
    for nome, valor, limite in (("C.T", r.ct, lim.ct), ("B.L", r.bl, lim.bl)):
        n = _numero(valor)
        if n and not n[1] and n[0] > limite:
            fora.append(nome)
    if r.coliformes == "P":
        fora.append("Coliformes")
    if r.ecoli == "P":
        fora.append("E.coli")
    if r.ph is not None and not lim.ph_min <= r.ph <= lim.ph_max:
        fora.append("pH")
    if r.cloro is not None and not lim.cloro_min <= r.cloro <= lim.cloro_max:
        fora.append("Cloro")
    return fora


def _faltas(tipo: str, dia: date, resultados: list[Resultado]) -> list[tuple[str, date]]:
    """O que falta ler e quando: o bag (Coliformes e E.coli) em 24 h, o C.T em 48 h, o B.L em 120 h; pH e cloro na hora
    (no semanal e, no mensal, nos pontos marcados "semanal")."""
    etapas = (
        [("pH e cloro", 0, lambda r: r.ph is None or r.cloro is None), ("Coliformes e E.coli", 1, lambda r: r.coliformes is None or r.ecoli is None)]
        if tipo == "semanal"
        else [("pH e cloro", 0, lambda r: r.semanal and (r.ph is None or r.cloro is None)),
              ("Coliformes e E.coli", 1, lambda r: r.coliformes is None or r.ecoli is None),
              ("C.T 48h", 2, lambda r: r.ct is None), ("B.L 120h", 5, lambda r: r.bl is None)]
    )
    return [(nome, dia + timedelta(days=d)) for nome, d, falta in etapas if any(falta(r) for r in resultados)]


def _situacao(faltas: list[tuple[str, date]], hoje: date) -> str:
    if not faltas:
        return "Concluída"
    atrasada = [f for f in faltas if f[1] < hoje]
    if atrasada:
        return f"Atrasado: {atrasada[0][0]}"
    hoje_ = [f for f in faltas if f[1] == hoje]
    if hoje_:
        return f"Vence hoje: {hoje_[0][0]}"
    return f"Aguardando {faltas[0][0]} ({faltas[0][1]:%d/%m})"


COLETAS_SQL = """
SELECT c.id, c.unidade, c.tipo, c.navio, c.coletada_em, coalesce(c.coletor_nome, u.nome, cu.usuario), c.analisada_em,
       coalesce(a.nome, ca.usuario)
FROM app.coletas_agua_consumo c
JOIN usuarios u ON u.id = c.coletada_por LEFT JOIN app.credenciais cu ON cu.usuario_id = c.coletada_por
LEFT JOIN usuarios a ON a.id = c.analisada_por LEFT JOIN app.credenciais ca ON ca.usuario_id = c.analisada_por
WHERE c.excluida_em IS NULL
"""


def _coletas(con: psycopg.Connection, onde: str, valores: list, lim: Limites, hoje: date) -> list[Coleta]:
    linhas = con.execute(COLETAS_SQL + onde, valores).fetchall()
    if not linhas:
        return []
    resultados: dict[int, list[Resultado]] = {}
    for cid, ordem, ponto, ct, bl, coli, ec, ph, cl, obs, semanal in con.execute(
        """SELECT coleta_id, ordem, ponto, ct, bl, coliformes, ecoli, ph, cloro, observacao, semanal
           FROM app.resultados_agua_consumo WHERE coleta_id = ANY(%s) ORDER BY coleta_id, ordem""",
        ([l[0] for l in linhas],),
    ).fetchall():
        r = Resultado(ordem=ordem, ponto=ponto, ct=ct, bl=bl, coliformes=coli, ecoli=ec, observacao=obs, semanal=semanal,
                      ph=float(ph) if ph is not None else None, cloro=float(cl) if cl is not None else None)
        r.fora = fora_do_limite(r, lim)
        resultados.setdefault(cid, []).append(r)
    coletas = []
    for cid, unidade, tipo, navio, em, quem, analisada_em, analisada_por in linhas:
        dia = em.astimezone(FUSO).date()
        rs = resultados.get(cid, [])
        faltas = _faltas(tipo, dia, rs)
        coletas.append(
            Coleta(
                id=cid, unidade=unidade, tipo=tipo, navio=navio, dia=dia, hora=rotas_turno._hhmm(em), quem=quem,
                analisada_em=analisada_em.astimezone(FUSO).strftime("%d/%m/%Y %H:%M") if analisada_em else None,
                analisada_por=analisada_por, resultados=rs, faltas=[f"{n} ({d:%d/%m})" for n, d in faltas],
                situacao=_situacao(faltas, hoje), nao_ok=sum(1 for r in rs if r.fora),
            )
        )
    return coletas


def _pontos(con: psycopg.Connection) -> dict[str, dict[str, list[Ponto]]]:
    pontos: dict[str, dict[str, list[Ponto]]] = {u: {"mensal": [], "semanal": []} for u in ("Santos", "TMG")}
    for pid, unidade, tipo, nome, ordem, ativo, semanal in con.execute(
        "SELECT id, unidade, tipo, nome, ordem, ativo, semanal FROM app.pontos_agua_consumo ORDER BY unidade, tipo, ordem, nome"
    ).fetchall():
        pontos[unidade][tipo].append(Ponto(id=pid, nome=nome, ordem=ordem, ativo=ativo, semanal=semanal))
    return pontos


def _agua(con: psycopg.Connection, pessoa: PessoaLogada) -> AguaDeConsumo:
    hoje, lim = _hoje(con), _limites(con)
    desde = datetime.combine(hoje - timedelta(days=DIAS_NA_TELA), time.min, FUSO)
    coletas = _coletas(con, " AND c.coletada_em >= %s ORDER BY c.coletada_em DESC, c.id DESC", [desde], lim, hoje)
    # as antigas que ainda têm leitura aparecem também
    antigas = _coletas(
        con,
        """ AND c.coletada_em < %s AND EXISTS (SELECT 1 FROM app.resultados_agua_consumo r WHERE r.coleta_id = c.id
               AND (r.coliformes IS NULL OR r.ecoli IS NULL
                    OR (c.tipo = 'mensal' AND (r.ct IS NULL OR r.bl IS NULL))
                    OR ((c.tipo = 'semanal' OR r.semanal) AND (r.ph IS NULL OR r.cloro IS NULL))))
            ORDER BY c.coletada_em DESC""",
        [desde], lim, hoje,
    )
    navios = [n for (n,) in con.execute(
        """SELECT navio FROM app.coletas_agua_consumo WHERE unidade = 'Navio' AND excluida_em IS NULL
           GROUP BY navio ORDER BY max(coletada_em) DESC LIMIT 50"""
    ).fetchall()]
    return AguaDeConsumo(
        pode_coletar=pode(pessoa.cargo, "registrar_coleta"), pode_lancar=pode(pessoa.cargo, "registrar_analise"),
        pode_configurar=pode(pessoa.cargo, "configurar_turnos"), pontos=_pontos(con), pontos_do_navio=PONTOS_DO_NAVIO,
        limites=lim, coletas=coletas + antigas, navios=navios,
    )


@roteador.get("", response_model=AguaDeConsumo)
def ver(pessoa: PessoaLogada = Depends(exigir("registrar_coleta")), con: psycopg.Connection = Depends(obter_conexao)) -> AguaDeConsumo:
    return _agua(con, pessoa)


def pendencias(con: psycopg.Connection) -> list[tuple[str, str, int, int]]:
    """Para a aba Leituras e o Turno: (rótulo, unidade, coletas com leitura vencendo ou atrasada, atrasadas)."""
    hoje, lim = _hoje(con), _limites(con)
    antes = datetime.combine(hoje + timedelta(days=1), time.min, FUSO)
    saida: dict[tuple[str, str], list[int]] = {}
    for c in _coletas(con, " AND c.coletada_em < %s ORDER BY c.coletada_em", [antes], lim, hoje):
        if c.situacao == "Concluída" or c.situacao.startswith("Aguardando"):
            continue
        rotulo = "Navios" if c.unidade == "Navio" else f"{c.unidade} {c.tipo}"
        par = saida.setdefault((rotulo, c.situacao.split(": ", 1)[-1]), [0, 0])
        par[0] += 1
        par[1] += c.situacao.startswith("Atrasado")
    return [(r, etapa, n, a) for (r, etapa), (n, a) in saida.items()]


# --- coleta ------------------------------------------------------------------------------------------------------------


class NovaColeta(BaseModel):
    unidade: Literal["Santos", "TMG", "Navio"]
    tipo: Tipo = "mensal"
    navio: str = Field(default="", max_length=40)  # "O.BLOSSOM II - 123"
    dia: date
    hora: str
    pontos: list[int] = []  # ids dos pontos (vazio: todos os ativos); no navio, a ordem de TEC (1) e COZ (2)
    coletado_por: str = Field(default="", max_length=60)


@roteador.post("/coletas", response_model=AguaDeConsumo, status_code=status.HTTP_201_CREATED)
def coletar(
    pedido: NovaColeta, pessoa: PessoaLogada = Depends(exigir("registrar_coleta")), con: psycopg.Connection = Depends(obter_conexao)
) -> AguaDeConsumo:
    quando = _quando(con, pedido.dia, pedido.hora)
    if pedido.unidade == "Navio":
        navio = " ".join(pedido.navio.split()).upper()
        if not navio:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Diga o navio e a viagem (ex.: O.BLOSSOM II - 123).")
        codigos = list(PONTOS_DO_NAVIO)
        escolhidos = [(i + 1, c, False) for i, c in enumerate(codigos) if not pedido.pontos or (i + 1) in pedido.pontos]
        tipo = "mensal"
    else:
        navio, tipo = None, pedido.tipo
        ativos = con.execute(
            """SELECT id, nome, semanal FROM app.pontos_agua_consumo WHERE unidade = %s AND tipo = %s AND ativo
               ORDER BY ordem, nome""",
            (pedido.unidade, tipo),
        ).fetchall()
        escolhidos = [(n, nome, semanal) for n, (pid, nome, semanal) in enumerate(ativos, start=1) if not pedido.pontos or pid in pedido.pontos]
    if not escolhidos:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Marque os pontos coletados.")
    coletor = " ".join(pedido.coletado_por.split()) or None
    cid = con.execute(
        """INSERT INTO app.coletas_agua_consumo (unidade, tipo, navio, coletada_em, coletada_por, coletor_nome)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
        (pedido.unidade, tipo, navio, quando, pessoa.usuario_id, coletor),
    ).fetchone()[0]
    for ordem, nome, semanal in escolhidos:
        con.execute(
            "INSERT INTO app.resultados_agua_consumo (coleta_id, ordem, ponto, semanal) VALUES (%s, %s, %s, %s)",
            (cid, ordem, nome, semanal),
        )
    return _agua(con, pessoa)


@roteador.post("/coletas/{coleta_id}/excluir", response_model=AguaDeConsumo)
def excluir(
    coleta_id: int, pedido: Exclusao, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> AguaDeConsumo:
    if len(pedido.motivo.strip()) < 5:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o motivo da exclusão.")
    feito = con.execute(
        """UPDATE app.coletas_agua_consumo SET excluida_por = %s, excluida_em = clock_timestamp(), motivo_exclusao = %s
           WHERE id = %s AND excluida_em IS NULL""",
        (pessoa.usuario_id, pedido.motivo.strip(), coleta_id),
    ).rowcount
    if not feito:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coleta não encontrada.")
    return _agua(con, pessoa)


# --- resultados --------------------------------------------------------------------------------------------------------


class ItemDeResultado(BaseModel):
    """Só os campos enviados mudam; texto vazio apaga a leitura."""

    ordem: int
    ct: str | None = None
    bl: str | None = None
    coliformes: str | None = None
    ecoli: str | None = None
    ph: str | None = None
    cloro: str | None = None
    observacao: str | None = Field(default=None, max_length=40)


class Lancamento(BaseModel):
    itens: list[ItemDeResultado] = Field(min_length=1, max_length=40)
    previa: bool = True


class RespostaDoLancamento(BaseModel):
    previa: bool
    texto: str  # o que vai ser (ou foi) gravado, uma linha por ponto
    fora: list[str]  # "Ponto 2: pH 9,8 fora do limite"
    agua: AguaDeConsumo | None = None


def _pa(valor: str | None) -> str | None:
    texto = (valor or "").strip().upper()
    if not texto:
        return None
    if texto in ("P", "PRESENTE", "POSITIVO", "+"):
        return "P"
    if texto in ("A", "AUSENTE", "NEGATIVO", "-"):
        return "A"
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Coliformes e E.coli: P (presente) ou A (ausente), não {valor}.")


def _decimal(valor: str | None, nome: str, maximo: float) -> Decimal | None:
    texto = (valor or "").strip().replace(",", ".")
    if not texto:
        return None
    try:
        n = Decimal(texto)
    except InvalidOperation:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{nome} inválido: {valor}.") from None
    if not 0 <= n <= maximo:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{nome} fora da escala: {valor}.")
    return n.quantize(Decimal("0.01"))


def _br(n: Decimal | float | None) -> str:
    return "" if n is None else f"{float(n):.2f}".replace(".", ",")


@roteador.put("/coletas/{coleta_id}/resultados", response_model=RespostaDoLancamento)
def lancar(
    coleta_id: int, pedido: Lancamento, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> RespostaDoLancamento:
    coleta = con.execute(
        "SELECT tipo, analisada_em FROM app.coletas_agua_consumo WHERE id = %s AND excluida_em IS NULL", (coleta_id,)
    ).fetchone()
    if coleta is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coleta não encontrada.")
    tipo, analisada_em = coleta
    linhas = {o: (p, s) for o, p, s in con.execute(
        "SELECT ordem, ponto, semanal FROM app.resultados_agua_consumo WHERE coleta_id = %s", (coleta_id,)
    ).fetchall()}
    pontos = {o: p for o, (p, _) in linhas.items()}
    lim = _limites(con)
    fq = ("ph", "cloro", "observacao")
    texto, fora, mudancas = [], [], []
    for item in pedido.itens:
        if item.ordem not in pontos:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"O ponto {item.ordem} não é desta coleta.")
        # mensal: C.T, B.L, Coliformes e E.coli; pH, cloro e observação só nos pontos que valem também como semanal
        if tipo == "semanal":
            campos_do_tipo = (*fq, "coliformes", "ecoli")
        else:
            campos_do_tipo = ("ct", "bl", "coliformes", "ecoli", *(fq if linhas[item.ordem][1] else ()))
            if not linhas[item.ordem][1] and any(c in item.model_fields_set and getattr(item, c) for c in fq):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                    f"{pontos[item.ordem]} não é ponto do semanal: pH e cloro não se medem nele.")
        enviados = {c for c in item.model_fields_set if c in campos_do_tipo}
        valores: dict = {}
        for c in enviados:
            v = getattr(item, c)
            if c in ("ct", "bl"):
                valores[c] = resultado(v)
            elif c in ("coliformes", "ecoli"):
                valores[c] = _pa(v)
            elif c == "ph":
                valores[c] = _decimal(v, "pH", 14)
            elif c == "cloro":
                valores[c] = _decimal(v, "Cloro", 100)
            else:
                valores[c] = " ".join((v or "").split()) or None
        if not valores:
            continue
        r = Resultado(ordem=item.ordem, ponto=pontos[item.ordem],
                      **{k: (float(v) if isinstance(v, Decimal) else v) for k, v in valores.items()})
        partes = []
        for c, rotulo in (("ct", "C.T"), ("bl", "B.L"), ("coliformes", "Coliformes"), ("ecoli", "E.coli"), ("ph", "pH"),
                          ("cloro", "Cloro"), ("observacao", "Obs.")):
            if c in valores:
                v = valores[c]
                partes.append(f"{rotulo} {(_br(v) if isinstance(v, Decimal) else v) or '(apaga)'}")
        texto.append(f"{pontos[item.ordem]}: " + ", ".join(partes))
        fora += [f"{pontos[item.ordem]}: {f} fora do limite" for f in fora_do_limite(r, lim)]
        mudancas.append((item.ordem, valores))
    if not mudancas:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Digite pelo menos um resultado.")
    if pedido.previa:
        return RespostaDoLancamento(previa=True, texto="\n".join(texto), fora=fora)
    for ordem, valores in mudancas:
        sets = ", ".join(f"{c} = %({c})s" for c in valores)
        con.execute(
            f"""UPDATE app.resultados_agua_consumo SET {sets}, lido_por = %(quem)s, lido_em = clock_timestamp()
                WHERE coleta_id = %(id)s AND ordem = %(ordem)s""",
            {**valores, "quem": pessoa.usuario_id, "id": coleta_id, "ordem": ordem},
        )
    if analisada_em is None:  # o cabeçalho do laudo semanal: a primeira análise lançada
        con.execute(
            "UPDATE app.coletas_agua_consumo SET analisada_em = clock_timestamp(), analisada_por = %s WHERE id = %s",
            (pessoa.usuario_id, coleta_id),
        )
    return RespostaDoLancamento(previa=False, texto="\n".join(texto), fora=fora, agua=_agua(con, pessoa))


# --- pontos e limites (Admin) ------------------------------------------------------------------------------------------


class NovoPonto(BaseModel):
    unidade: Unidade
    tipo: Tipo
    nome: str = Field(min_length=1, max_length=50)


class MudancaDePonto(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=50)
    ordem: int | None = Field(default=None, ge=1, le=99)
    ativo: bool | None = None
    semanal: bool | None = None  # só no mensal


def _nome_do_ponto(nome: str) -> str:
    limpo = " ".join(nome.split())
    if not limpo:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Diga o nome do ponto.")
    return limpo


def _sem_repetir(con: psycopg.Connection, unidade: str, tipo: str, nome: str, menos: int = 0) -> None:
    if con.execute(
        "SELECT 1 FROM app.pontos_agua_consumo WHERE unidade = %s AND tipo = %s AND lower(nome) = lower(%s) AND id <> %s",
        (unidade, tipo, nome, menos),
    ).fetchone():
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um ponto com esse nome.")


def _ativos(con: psycopg.Connection, unidade: str, tipo: str) -> int:
    return con.execute(
        "SELECT count(*) FROM app.pontos_agua_consumo WHERE unidade = %s AND tipo = %s AND ativo", (unidade, tipo)
    ).fetchone()[0]


@roteador.post("/pontos", response_model=AguaDeConsumo, status_code=status.HTTP_201_CREATED)
def novo_ponto(
    pedido: NovoPonto, pessoa: PessoaLogada = Depends(exigir("configurar_turnos")), con: psycopg.Connection = Depends(obter_conexao)
) -> AguaDeConsumo:
    if _ativos(con, pedido.unidade, pedido.tipo) >= MAX_PONTOS[(pedido.unidade, pedido.tipo)]:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"{pedido.unidade} {pedido.tipo} já tem {MAX_PONTOS[(pedido.unidade, pedido.tipo)]} pontos ativos (o máximo).",
        )
    nome = _nome_do_ponto(pedido.nome)
    _sem_repetir(con, pedido.unidade, pedido.tipo, nome)
    con.execute(
        """INSERT INTO app.pontos_agua_consumo (unidade, tipo, nome, ordem)
           SELECT %(u)s, %(t)s, %(n)s, coalesce(max(ordem), 0) + 1 FROM app.pontos_agua_consumo WHERE unidade = %(u)s AND tipo = %(t)s""",
        {"u": pedido.unidade, "t": pedido.tipo, "n": nome},
    )
    return _agua(con, pessoa)


@roteador.put("/pontos/{ponto_id}", response_model=AguaDeConsumo)
def mudar_ponto(
    ponto_id: int, pedido: MudancaDePonto, pessoa: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> AguaDeConsumo:
    """Renomeia, muda a ordem ou desativa. O que já foi coletado guarda o nome antigo."""
    linha = con.execute("SELECT unidade, tipo, ativo FROM app.pontos_agua_consumo WHERE id = %s", (ponto_id,)).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ponto não encontrado.")
    unidade, tipo, ativo = linha
    if pedido.semanal and tipo != "mensal":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A marca \"também semanal\" é só dos pontos do mensal.")
    if pedido.ativo and not ativo and _ativos(con, unidade, tipo) >= MAX_PONTOS[(unidade, tipo)]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{unidade} {tipo} já tem o máximo de pontos ativos.")
    valores = {k: v for k, v in pedido.model_dump().items() if v is not None}
    if "nome" in valores:
        valores["nome"] = _nome_do_ponto(valores["nome"])
        _sem_repetir(con, unidade, tipo, valores["nome"], ponto_id)
    if valores:
        con.execute(
            f"UPDATE app.pontos_agua_consumo SET {', '.join(f'{k} = %({k})s' for k in valores)} WHERE id = %(id)s",
            {**valores, "id": ponto_id},
        )
    return _agua(con, pessoa)


@roteador.put("/limites", response_model=AguaDeConsumo)
def mudar_limites(
    pedido: Limites, pessoa: PessoaLogada = Depends(exigir("configurar_turnos")), con: psycopg.Connection = Depends(obter_conexao)
) -> AguaDeConsumo:
    if pedido.ph_min >= pedido.ph_max or pedido.cloro_min >= pedido.cloro_max:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O mínimo tem de ser menor que o máximo.")
    for p in PARAMETROS:
        con.execute(
            """INSERT INTO app.limites_agua_consumo (parametro, valor, alterado_por) VALUES (%s, %s, %s)
               ON CONFLICT (parametro) DO UPDATE SET valor = EXCLUDED.valor, alterado_por = EXCLUDED.alterado_por,
                                                     alterado_em = clock_timestamp()""",
            (p, getattr(pedido, p), pessoa.usuario_id),
        )
    return _agua(con, pessoa)


# --- laudos ------------------------------------------------------------------------------------------------------------

# Mensal (e navios): "Laudo de Análise Microbiológica – Água de consumo", A4 em pé, 41 linhas (medido no modelo).
TABELA_MENSAL = laudos.Tabela(colunas=(36.3, 92.8, 240.4, 298.6, 356.9, 462.3, 574.8), topo=163.0, base=702.5, linhas=41)
DEMO_MENSAL = laudos.demonstracao(
    "Laudo de Análise Microbiológica – Água de consumo", TABELA_MENSAL,
    ("Data", "Amostra", "C.T 48h", "B.L 120h", "Coliformes Totais (P/A)", "E.coli (P/A)"),
)
PRESENCA = {"P": "Presente", "A": "Ausente"}

# lugar de cada linha (076): ref "c<coleta>p<ponto>" no mensal, "c<coleta>" no semanal (um bloco por coleta)
_COLETA_DA_REF = "split_part(substr(l.ref, 2), 'p', 1)::bigint"
CONTAR_SQL = f"""
SELECT count(*), min(l.dia), max(l.dia) FROM app.laudo_linhas l
JOIN app.coletas_agua_consumo c ON c.id = {_COLETA_DA_REF}
WHERE l.pagina_id = %s AND c.excluida_em IS NULL
"""


def _preparar_mensal(unidade: str) -> Callable[[psycopg.Connection], None]:
    def _preparar(con: psycopg.Connection) -> None:
        linhas = con.execute(
            """SELECT c.id, r.ordem, coalesce(c.navio, c.unidade), (c.coletada_em AT TIME ZONE 'America/Sao_Paulo')::date
               FROM app.coletas_agua_consumo c JOIN app.resultados_agua_consumo r ON r.coleta_id = c.id
               WHERE c.excluida_em IS NULL AND c.tipo = 'mensal' AND c.unidade = %s ORDER BY c.coletada_em, c.id, r.ordem""",
            (unidade,),
        ).fetchall()
        nome = "agua-consumo-navio" if unidade == "Navio" else f"agua-consumo-mensal-{unidade}"
        laudos.distribuir_linhas(con, nome, [(f"c{c}p{o}", chave, dia) for c, o, chave, dia in linhas], TABELA_MENSAL.linhas)

    return _preparar


def _linhas_da_folha(con: psycopg.Connection, pagina_id: int) -> list[tuple[Coleta, Resultado | None]]:
    """As coletas (e, no mensal, o ponto) de uma folha, na ordem da coleta."""
    refs = [r for r, _ in laudos.linhas_da_pagina(con, pagina_id)]
    ids = sorted({int(r[1:].split("p")[0]) for r in refs})
    coletas = {c.id: c for c in _coletas(con, " AND c.id = ANY(%s)", [ids], _limites(con), date.max)}
    saida = []
    for ref in refs:
        partes = ref[1:].split("p")
        c = coletas.get(int(partes[0]))
        if c is None:
            continue  # coleta excluída: a linha fica vazia
        if len(partes) == 1:
            saida.append((c, None))
        else:
            r = next((r for r in c.resultados if r.ordem == int(partes[1])), None)
            if r:
                saida.append((c, r))
    saida.sort(key=lambda x: (x[0].dia, x[0].hora, x[0].id, x[1].ordem if x[1] else 0))
    return saida


def _gerar_mensal(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    tabela = laudos.encaixar(TABELA_MENSAL, modelo)
    celulas, anterior = [], None
    for n, (c, r) in enumerate(_linhas_da_folha(con, pagina_id)[: tabela.linhas]):
        amostra = f"{c.navio} {r.ponto}" if c.navio else r.ponto
        textos = (
            f"{c.dia:%d/%m/%Y}" if c.id != anterior else "",  # a data só na primeira linha da coleta (como no papel)
            amostra, r.ct or "", r.bl or "", PRESENCA.get(r.coliformes or "", ""), PRESENCA.get(r.ecoli or "", ""),
        )
        anterior = c.id
        for i, texto in enumerate(textos):
            celulas.append(tabela.celula(texto, n, i, centro=i != 1, tamanho=8))
    return laudos.preencher(modelo, DEMO_MENSAL, celulas)


# Semanal: medido nos modelos de cada unidade (A4 em pé). Cabeçalho do bloco: data e hora da coleta e quem coletou, data
# e hora da análise e quem analisou; depois a tabela dos pontos.
SEMANAL = {
    ("fq", "Santos"): {"colunas": (37.2, 203.1, 328.5, 454.3, 579.5), "blocos": ((165.7, 248.1, 388.8, 10), (432.2, 514.5, 655.3, 10))},
    ("fq", "TMG"): {"colunas": (37.6, 203.5, 329.0, 454.7, 580.0), "blocos": ((151.0, 246.0, 385.1, 10), (415.3, 510.3, 647.8, 10))},
    ("micro", "Santos"): {"colunas": (37.6, 214.8, 383.2, 569.1), "blocos": ((137.5, 232.6, 679.6, 30),)},
    ("micro", "TMG"): {"colunas": (30.6, 213.2, 376.2, 562.1), "blocos": ((165.7, 248.1, 677.1, 30),)},
}
TITULOS_SEMANAL = {"fq": "Físico-química da água de consumo", "micro": "Microbiológica da água de consumo"}
CABECALHOS_SEMANAL = {"fq": ("Ponto de coleta", "pH", "Cloro livre", "Observações"), "micro": ("Ponto de coleta", "Coliformes totais", "E.coli")}


def _tabelas_semanal(qual: str, unidade: str) -> list[tuple[float, laudos.Tabela]]:
    g = SEMANAL[(qual, unidade)]
    return [(y, laudos.Tabela(g["colunas"], topo, base, n)) for y, topo, base, n in g["blocos"]]


def _gerar_semanal(qual: str, unidade: str) -> Callable[[psycopg.Connection, int, bytes | None], bytes]:
    blocos = _tabelas_semanal(qual, unidade)
    demo = laudos.demonstracao(f"Monitoramento {TITULOS_SEMANAL[qual]} · {unidade}", blocos[0][1], CABECALHOS_SEMANAL[qual])

    def _gerar(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
        celulas = []
        coletas = [c for c, _ in _linhas_da_folha(con, pagina_id)]
        direita = blocos[0][1].colunas[-1]
        for (y, tabela_medida), c in zip(blocos, coletas):
            tabela = laudos.encaixar(tabela_medida, modelo)
            # depois de "Data/ Hora da ...:" (x ~150) e de "Responsável pela ...:" (x ~450), nas linhas do papel
            for linha_y, quando, quem in ((y, f"{c.dia:%d/%m/%Y}  {c.hora}", c.quem),
                                          (y + 27.6, c.analisada_em or "", c.analisada_por or "")):
                celulas.append(laudos.Celula(quando, 152, 300, linha_y - 3, linha_y + 11, centro=False, tamanho=9))
                celulas.append(laudos.Celula(laudo_esterilizacao.primeiro_nome(quem) if quem else "", 454, direita, linha_y - 3,
                                             linha_y + 11, centro=False, tamanho=9))
            # a coleta mensal entra só com os pontos que valem também como semanal (080)
            linhas = c.resultados if c.tipo == "semanal" else [r for r in c.resultados if r.semanal]
            for n, r in enumerate(linhas[: tabela.linhas]):
                if qual == "fq":
                    textos = (r.ponto, _br(r.ph), _br(r.cloro), r.observacao or ("-" if r.ph is not None else ""))
                else:
                    textos = (r.ponto, r.coliformes or "", r.ecoli or "")
                for i, texto in enumerate(textos):
                    celulas.append(tabela.celula(texto, n, i, centro=i != 0, tamanho=8))
        return laudos.preencher(modelo, demo, celulas)

    return _gerar


def _preparar_semanal(qual: str, unidade: str, capacidade: int) -> Callable[[psycopg.Connection], None]:
    def _preparar(con: psycopg.Connection) -> None:
        linhas = con.execute(
            """SELECT c.id, (c.coletada_em AT TIME ZONE 'America/Sao_Paulo')::date FROM app.coletas_agua_consumo c
               WHERE c.excluida_em IS NULL AND c.unidade = %s
                 AND (c.tipo = 'semanal'
                      OR EXISTS (SELECT 1 FROM app.resultados_agua_consumo r WHERE r.coleta_id = c.id AND r.semanal))
               ORDER BY c.coletada_em, c.id""",
            (unidade,),
        ).fetchall()
        laudos.distribuir_linhas(con, f"agua-consumo-{qual}-{unidade}", [(f"c{i}", "", d) for i, d in linhas], capacidade)

    return _preparar


for _u in ("Santos", "TMG", "Navio"):
    laudos.registrar(
        laudos.Laudo(
            nome="agua-consumo-navio" if _u == "Navio" else f"agua-consumo-mensal-{_u}",
            titulo="Água de consumo dos navios" if _u == "Navio" else f"Água de consumo · {_u} · mensal",
            modelo="agua-consumo-mensal", capacidade=TABELA_MENSAL.linhas, contar_sql=CONTAR_SQL, gerar=_gerar_mensal,
            preparar=_preparar_mensal(_u), traco=TABELA_MENSAL,
        )
    )
for _qual in ("fq", "micro"):
    for _u in ("Santos", "TMG"):
        _cap = len(SEMANAL[(_qual, _u)]["blocos"])
        laudos.registrar(
            laudos.Laudo(
                nome=f"agua-consumo-{_qual}-{_u}", titulo=f"{TITULOS_SEMANAL[_qual]} · {_u} · semanal",
                modelo=f"agua-consumo-{_qual}-{_u}", capacidade=_cap, contar_sql=CONTAR_SQL,
                gerar=_gerar_semanal(_qual, _u), preparar=_preparar_semanal(_qual, _u, _cap),
            )
        )
