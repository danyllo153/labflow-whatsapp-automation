"""APP-054: funções do banco para o bot gravar esterilização (PB8) e águas, baias e linhas (PB9). Dados fictícios."""

import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
import pytest

QUANDO = "2031-03-10 10:00-03"  # Manhã (08–16) de 10/03 (esterilização)
AGORA = datetime.now().astimezone()  # coletas: não podem ser no futuro, e a mais recente é a que o bot completa


def _pessoa(criar_pessoa, cargo="Analista", usuario=None):
    return criar_pessoa(usuario=usuario or f"{cargo.lower()}.bot", cargo=cargo)


def test_quem_pode_chamar(conexao):
    for papel in ("labflow_app", "labflow_app_web"):
        assert conexao.execute(
            "SELECT has_function_privilege(%s, 'app.bot_registrar_esterilizacao(bigint, text[], text, text, text, timestamptz)', 'EXECUTE')",
            (papel,),
        ).fetchone()[0]
    assert not conexao.execute(
        "SELECT has_function_privilege('labflow_leitura', 'app.bot_coletar_agua(bigint, text[], timestamptz, text)', 'EXECUTE')"
    ).fetchone()[0]


def test_esterilizacao_varios_materiais_no_mesmo_ciclo_e_mesma_linha_do_laudo(conexao, criar_pessoa):
    uid = _pessoa(criar_pessoa)
    linhas = conexao.execute(
        "SELECT tipo, ciclo, turno_id, dia, eficiente, laudo_id FROM app.bot_registrar_esterilizacao(%s, %s, %s, p_quando => %s)",
        (uid, ["Meio", "Frasco", "Meio"], " A1092/26 ", QUANDO),
    ).fetchall()
    assert sorted(l[0] for l in linhas) == ["Frasco", "Meio"]  # repetido não duplica
    assert {(l[1], str(l[3]), l[4]) for l in linhas} == {("A1092/26", "2031-03-10", True)}  # eficiente Sim por padrão
    assert len({l[5] for l in linhas}) == 1  # mesma página do laudo
    manha = conexao.execute("SELECT id FROM app.turnos WHERE nome = 'Manhã'").fetchone()[0]
    assert linhas[0][2] == manha
    # outro registro do mesmo ciclo no dia cai na mesma página
    outra = conexao.execute(
        "SELECT laudo_id FROM app.bot_registrar_esterilizacao(%s, ARRAY['Ponteira'], 'a1092/26', p_quando => %s)", (uid, QUANDO)
    ).fetchone()[0]
    assert outra == linhas[0][5]


def test_madrugada_conta_no_dia_em_que_comecou(conexao, criar_pessoa):
    uid = _pessoa(criar_pessoa)
    linha = conexao.execute(
        "SELECT turno_id, dia FROM app.bot_registrar_esterilizacao(%s, ARRAY['Ponteira'], 'A1', p_quando => '2031-03-11 02:00-03')",
        (uid,),
    ).fetchone()
    nome = conexao.execute("SELECT nome FROM app.turnos WHERE id = %s", (linha[0],)).fetchone()[0]
    assert (nome, str(linha[1])) == ("Madrugada", "2031-03-11")
    tarde = conexao.execute(
        "SELECT turno_id, dia FROM app.bot_registrar_esterilizacao(%s, ARRAY['Ponteira'], 'A2', p_quando => '2031-03-11 23:30-03')",
        (uid,),
    ).fetchone()
    assert conexao.execute("SELECT nome FROM app.turnos WHERE id = %s", (tarde[0],)).fetchone()[0] == "Tarde"


@pytest.mark.parametrize(
    "cargo, tipos, ciclo, descricao, erro",
    [
        ("Coletor", ["Ponteira"], "A1", None, "não pode"),
        ("Analista", ["Ponteira"], "  ", None, "número do ciclo"),
        ("Analista", ["Vidro"], "A1", None, "Material desconhecido"),
        ("Analista", ["Outro"], "A1", None, "Descreva"),
    ],
)
def test_esterilizacao_recusas(conexao, criar_pessoa, cargo, tipos, ciclo, descricao, erro):
    uid = _pessoa(criar_pessoa, cargo)
    with pytest.raises(psycopg.errors.RaiseException, match=erro):
        conexao.execute(
            "SELECT * FROM app.bot_registrar_esterilizacao(%s, %s, %s, p_descricao => %s, p_quando => %s)",
            (uid, tipos, ciclo, descricao, QUANDO),
        )


def test_agua_coleta_e_resultado_em_todos_os_coletados(conexao, criar_pessoa):
    coletor = _pessoa(criar_pessoa, "Coletor")
    analista = _pessoa(criar_pessoa)
    coleta = conexao.execute(
        "SELECT id, manifold, camara4, camara5, pagina_id FROM app.bot_coletar_agua(%s, ARRAY['manifold', 'camara5'], %s)",
        (coletor, AGORA),
    ).fetchone()
    assert coleta[1:4] == (True, False, True) and coleta[4] is not None
    r = conexao.execute(
        "SELECT ct_manifold, ct_camara5, bl_manifold, ct_camara4 FROM app.bot_lancar_agua(%s, %s, '{}')",
        (analista, json.dumps({"todos": "< 1"})),
    ).fetchone()
    assert r == ("<1", "<1", None, None)  # só os coletados; B.L. ainda pendente
    r = conexao.execute(
        "SELECT bl_manifold, bl_camara5, resultado_por FROM app.bot_lancar_agua(%s, '{}', %s)",
        (analista, json.dumps({"manifold": "<1", "camara5": "2"})),
    ).fetchone()
    assert r == ("<1", "2", analista)
    with pytest.raises(psycopg.errors.RaiseException, match="não foi coletado"):
        with conexao.transaction():  # o erro desfaz só este pedaço
            conexao.execute("SELECT * FROM app.bot_lancar_agua(%s, %s, '{}', %s)", (analista, json.dumps({"camara4": "<1"}), coleta[0]))
    with pytest.raises(psycopg.errors.RaiseException, match="Resultado inválido"):
        with conexao.transaction():  # o erro desfaz só este pedaço
            conexao.execute("SELECT * FROM app.bot_lancar_agua(%s, %s, '{}', %s)", (analista, json.dumps({"todos": "muitas"}), coleta[0]))


def test_baias_e_linhas_coleta_e_leituras(conexao, criar_pessoa):
    uid = _pessoa(criar_pessoa)
    pontos = conexao.execute(
        "SELECT ponto, analisada_em FROM app.bot_coletar_superficie(%s, 'Baia', ARRAY['8', 'baia 10'], %s)", (uid, AGORA)
    ).fetchall()
    assert [p[0] for p in pontos] == ["08", "10"] and pontos[0][1] == AGORA.astimezone(ZoneInfo("America/Sao_Paulo")).date()  # o dia em São Paulo (à noite o UTC já virou)
    r = conexao.execute(
        "SELECT ponto, ct_48, bl_72 FROM app.bot_lancar_superficie(%s, 'Baia', '8', %s)", (uid, json.dumps({"ct_48": "<1"}))
    ).fetchone()
    assert r == ("08", "<1", None)
    linha = conexao.execute(
        "SELECT tipo, ponto FROM app.bot_coletar_superficie(%s, 'Linha', ARRAY['4'], %s, p_analisada_em => %s)",
        (uid, AGORA, AGORA.date() + timedelta(days=1)),
    ).fetchone()
    assert linha == ("Linha", "4")
    with pytest.raises(psycopg.errors.RaiseException, match="até 3 dias"):
        with conexao.transaction():  # o erro desfaz só este pedaço
            conexao.execute("SELECT * FROM app.bot_coletar_superficie(%s, 'Linha', ARRAY['4'], %s, p_analisada_em => %s)", (uid, AGORA, AGORA.date() + timedelta(days=9)))
    with pytest.raises(psycopg.errors.RaiseException, match="esperando esse resultado"):
        with conexao.transaction():  # o erro desfaz só este pedaço
            conexao.execute("SELECT * FROM app.bot_lancar_superficie(%s, 'Baia', '998', %s)", (uid, json.dumps({"ct_48": "<1"})))


def test_o_app_ve_o_que_o_bot_gravou(cliente, conexao, criar_pessoa):
    uid = criar_pessoa(usuario="ana.bot", cargo="Analista")
    conexao.execute("SELECT * FROM app.bot_coletar_superficie(%s, 'Baia', ARRAY['12'], now())", (uid,))
    assert cliente.post("/login", json={"usuario": "ana.bot", "senha": "Senha-de-teste-1"}).status_code == 200
    coletas = cliente.get("/aguas/superficies", params={"tipo": "Baia"}).json()["coletas"]
    assert any(c["ponto"] == "12" and c["quem"].startswith("ana.bot") for c in coletas)
