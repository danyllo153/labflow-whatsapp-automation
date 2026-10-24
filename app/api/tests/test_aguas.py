"""APP-037: água do processo, baias e linhas (aba Páginas), pendências e os laudos."""

import io
from datetime import datetime

import pytest
from pypdf import PdfReader

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


def em(dia: int, hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, dia, hora, minuto, tzinfo=FUSO)


@pytest.fixture
def agora(monkeypatch):
    def _fixar(quando: datetime):
        monkeypatch.setattr(rotas_turno, "_agora", lambda con: quando)

    _fixar(em(22, 10))
    return _fixar


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista", usuario=None):
        usuario = usuario or f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


def test_agua_do_processo_coleta_resultado_e_situacao(cliente, logado, agora):
    logado()
    r = cliente.post("/aguas/processo", json={"dia": "2026-10-22", "hora": "09:30", "pontos": ["manifold", "camara6"], "observacao": " Esterilizando "})
    assert r.status_code == 201, r.text
    coleta = r.json()["coletas"][0]
    assert (coleta["hora"], coleta["observacao"], coleta["situacao"]) == ("09:30", "Esterilizando", "Aguardando C.T 48h (24/10)")
    assert coleta["pontos"]["camara4"]["coletado"] is False
    url = f"/aguas/processo/{coleta['id']}/resultados"
    assert cliente.put(url, json={"ct": {"camara4": "<1"}}).status_code == 422  # ponto não coletado
    assert cliente.put(url, json={"ct": {"manifold": "abc"}}).status_code == 422
    c = cliente.put(url, json={"ct": {"manifold": "< 1", "camara6": "<1"}}).json()["coletas"][0]
    assert c["pontos"]["manifold"]["ct"] == "<1" and c["situacao"] == "Aguardando B.L 120h (27/10)" and c["resultado_por"]
    agora(em(27, 9))
    assert cliente.get("/aguas/processo").json()["coletas"][0]["situacao"] == "Vence hoje: B.L 120h"
    c = cliente.put(url, json={"bl": {"manifold": "<1", "camara6": "2"}}).json()["coletas"][0]
    assert c["situacao"] == "Concluída"


def test_coleta_de_agua_tem_regras(cliente, logado, agora):
    logado("Coletor")
    assert cliente.post("/aguas/processo", json={"dia": "2026-10-22", "hora": "09:30", "pontos": []}).status_code == 422
    assert cliente.post("/aguas/processo", json={"dia": "2026-10-23", "hora": "09:30", "pontos": ["manifold"]}).status_code == 422  # futuro
    assert cliente.post("/aguas/processo", json={"dia": "2026-10-22", "hora": "9h", "pontos": ["manifold"]}).status_code == 422
    r = cliente.post("/aguas/processo", json={"dia": "2026-10-22", "hora": "08:00", "pontos": ["manifold"]})
    assert r.status_code == 201 and r.json()["pode_lancar"] is False  # o Coletor coleta, mas não lança resultado
    assert cliente.put(f"/aguas/processo/{r.json()['coletas'][0]['id']}/resultados", json={"ct": {"manifold": "<1"}}).status_code == 403


def test_baias_e_linhas_uma_coleta_por_ponto(cliente, logado, agora):
    logado()
    r = cliente.post("/aguas/superficies", json={"tipo": "Baia", "pontos": ["8", "Baia 10"], "dia": "2026-10-22", "hora": "07:10"})
    assert r.status_code == 201, r.text
    coletas = r.json()["coletas"]
    assert sorted(c["ponto"] for c in coletas) == ["08", "10"] and coletas[0]["analisada_em"] == "2026-10-22"
    url = f"/aguas/superficies/{coletas[0]['id']}/resultados"
    c = next(x for x in cliente.put(url, json={"ct_48": "<1"}).json()["coletas"] if x["id"] == coletas[0]["id"])
    assert (c["ct_48"], c["bl_72"], c["situacao"]) == ("<1", None, "Aguardando B.L 72h (25/10)")
    cliente.post("/aguas/superficies", json={"tipo": "Linha", "pontos": ["4"], "dia": "2026-10-22", "hora": "08:16", "analisada_em": "2026-10-23"})
    assert [c["ponto"] for c in cliente.get("/aguas/superficies", params={"tipo": "Linha"}).json()["coletas"]] == ["4"]
    assert cliente.post("/aguas/superficies", json={"tipo": "Linha", "pontos": ["4"], "dia": "2026-10-22", "hora": "08:16", "analisada_em": "2026-10-21"}).status_code == 422


def test_pendencias_do_inicio_trazem_aguas_e_superficies(cliente, logado, agora, conexao):
    uid = logado()
    conexao.execute(
        "INSERT INTO app.paginas_laudo (laudo) VALUES ('agua-processo')"
    )
    pagina = conexao.execute("SELECT max(id) FROM app.paginas_laudo").fetchone()[0]
    # coleta de 3 dias atrás (pelo relógio do banco): o C.T. de 48 h está atrasado
    conexao.execute(
        "INSERT INTO app.coletas_agua_processo (coletada_em, manifold, coletada_por, pagina_id) VALUES (now() - interval '3 days', true, %s, %s)",
        (uid, pagina),
    )
    itens = [i for i in cliente.get("/pendencias-hoje").json()["itens"] if i["bloco"] == "Águas e superfícies"]
    assert [(i["tipo"], i["analise"], i["situacao"]) for i in itens] == [("Água do processo", "C.T 48h", "Atrasado")]


def test_laudos_de_agua_e_de_superficies(cliente, logado, agora):
    logado()
    cliente.post("/aguas/processo", json={"dia": "2026-10-22", "hora": "09:30", "pontos": ["manifold"], "observacao": "Esterilizando"})
    cliente.post("/aguas/superficies", json={"tipo": "Baia", "pontos": ["08"], "dia": "2026-10-22", "hora": "07:10"})
    for nome, esperado in (("agua-processo", "Esterilizando"), ("superficies-Baia", "Baia 08")):
        paginas = cliente.get(f"/laudos/{nome}").json()["paginas"]
        assert len(paginas) == 1, nome
        texto = PdfReader(io.BytesIO(cliente.get(f"/laudos/{nome}/{paginas[0]['id']}/pdf").content)).pages[0].extract_text()
        assert esperado in texto and "22.10.26" in texto, nome
    assert cliente.get("/laudos/superficies-Linha").json()["paginas"] == []


def test_excluir_coleta_pede_motivo(cliente, logado, agora):
    logado()
    c = cliente.post("/aguas/processo", json={"dia": "2026-10-22", "hora": "09:30", "pontos": ["manifold"]}).json()["coletas"][0]
    assert cliente.post(f"/aguas/processo/{c['id']}/excluir", json={"motivo": "x"}).status_code == 422
    assert cliente.post(f"/aguas/processo/{c['id']}/excluir", json={"motivo": "coleta de teste"}).json()["coletas"] == []


def test_corrigir_data_hora_e_pontos_da_agua_e_apagar_resultado(cliente, logado, agora):
    logado()
    c = cliente.post("/aguas/processo", json={"dia": "2026-10-22", "hora": "09:30", "pontos": ["manifold", "camara4"]}).json()["coletas"][0]
    cliente.put(f"/aguas/processo/{c['id']}/resultados", json={"ct": {"manifold": "<1", "camara4": "<1"}})
    r = cliente.put(f"/aguas/processo/{c['id']}", json={"dia": "2026-10-21", "hora": "18:00", "pontos": ["manifold"], "observacao": "Esterilizando"})
    assert r.status_code == 200, r.text
    c = r.json()["coletas"][0]
    assert (c["dia"], c["hora"], c["observacao"]) == ("2026-10-21", "18:00", "Esterilizando")
    assert c["pontos"]["camara4"] == {"coletado": False, "ct": None, "bl": None}  # deixou de ser coletado: sem resultado
    c = cliente.put(f"/aguas/processo/{c['id']}/resultados", json={"ct": {"manifold": ""}}).json()["coletas"][0]
    assert c["pontos"]["manifold"]["ct"] is None  # resultado apagado


def test_corrigir_coleta_de_baia(cliente, logado, agora):
    logado()
    c = cliente.post("/aguas/superficies", json={"tipo": "Baia", "pontos": ["8"], "dia": "2026-10-22", "hora": "07:10"}).json()["coletas"][0]
    r = cliente.put(f"/aguas/superficies/{c['id']}", json={"ponto": "9", "dia": "2026-10-21", "hora": "23:12", "analisada_em": "2026-10-22"})
    assert r.status_code == 200, r.text
    c = r.json()["coletas"][0]
    assert (c["ponto"], c["dia"], c["hora"], c["analisada_em"]) == ("09", "2026-10-21", "23:12", "2026-10-22")
