"""APP-038: branco do dia (controle de meio de cultura e fluxo laminar) e o laudo."""

import io
from datetime import datetime

import pytest
from pypdf import PdfReader

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa, monkeypatch):
    monkeypatch.setattr(rotas_turno, "_agora", lambda con: datetime(2026, 10, 22, 10, tzinfo=FUSO))

    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


def test_sugere_traco_no_pca_sem_agua_e_menor_que_1_com_agua(cliente, logado):
    logado()
    d = cliente.get("/fluxo-laminar", params={"dia": "2026-10-22"}).json()
    assert d["registro"] is None and (d["sugestao"]["osa"], d["sugestao"]["pca"]) == ("<1", "-")
    assert "nenhuma" in d["motivo_pca"]
    cliente.post("/aguas/superficies", json={"tipo": "Baia", "pontos": ["08"], "dia": "2026-10-22", "hora": "07:10"})
    d = cliente.get("/fluxo-laminar", params={"dia": "2026-10-22"}).json()
    assert d["sugestao"]["pca"] == "<1" and d["motivo_pca"].startswith("1 coleta")


def test_preencher_e_o_laudo(cliente, logado):
    logado()
    r = cliente.put("/fluxo-laminar/2026-10-22", json={"capela_ct": "<1", "capela_bl": "<1", "osa": "<1", "pda": "<1", "wort": "", "pca": "<1"})
    assert r.status_code == 200, r.text
    reg = r.json()["registro"]
    assert (reg["wort"], reg["pca"], reg["quem"]) == ("-", "<1", "analista.teste (teste)")
    assert cliente.put("/fluxo-laminar/2026-10-23", json={}).status_code == 422  # amanhã
    pagina = cliente.get("/laudos/fluxo-laminar").json()["paginas"][0]
    assert (pagina["linhas"], pagina["capacidade"]) == (1, 39)
    texto = PdfReader(io.BytesIO(cliente.get(f"/laudos/fluxo-laminar/{pagina['id']}/pdf").content)).pages[0].extract_text()
    assert "22.10.2026" in texto and "analista.teste" in texto
    assert "<1" not in texto  # no dia do plaqueamento nenhuma placa foi lida ainda: a célula fica em branco (25/10)


def test_branco_entra_sozinho_nos_dias_com_analise(cliente, logado):
    """25/10 (APP-067): o dia que teve análise já entra com o branco preenchido (o analista só corrige)."""
    logado()
    cliente.post("/aguas/superficies", json={"tipo": "Linha", "pontos": ["4"], "dia": "2026-10-21", "hora": "08:00"})
    d = cliente.get("/fluxo-laminar", params={"dia": "2026-10-21"}).json()
    assert d["registro"] is not None
    assert (d["registro"]["capela_ct"], d["registro"]["osa"], d["registro"]["pca"]) == ("<1|<1", "<1", "<1")  # a capela tem duas placas (25/10)
    hoje = cliente.get("/fluxo-laminar", params={"dia": "2026-10-22"}).json()
    assert hoje["registro"] is None  # o dia de hoje fica para amanhã, quando já se sabe tudo o que foi plaqueado


def test_laudo_le_cada_placa_no_seu_dia_e_fecha_a_folha_com_o_traco(cliente, logado, monkeypatch):
    """25/10: OSA/PCA e o C.T. da capela depois de 48 h, PDA e o B.L. da capela depois de 120 h, Wort depois de 240 h;
    capela antiga "<1" sai "<1|<1"; a folha marcada como impressa ganha o traço nas linhas vazias."""
    from labflow_api import laudos, rotas_fluxo_laminar

    logado()
    cliente.put("/fluxo-laminar/2026-10-19", json={"capela_ct": "<1", "capela_bl": "<1", "osa": "<1", "pda": "<1", "wort": "<1", "pca": "-"})
    assert rotas_fluxo_laminar._no_laudo("osa", "<1", datetime(2026, 10, 19).date(), datetime(2026, 10, 22).date()) == "<1"
    assert rotas_fluxo_laminar._no_laudo("pda", "<1", datetime(2026, 10, 19).date(), datetime(2026, 10, 22).date()) == ""
    assert rotas_fluxo_laminar._no_laudo("capela_ct", "<1", datetime(2026, 10, 19).date(), datetime(2026, 10, 22).date()) == "<1|<1"
    assert rotas_fluxo_laminar._no_laudo("wort", "-", datetime(2026, 10, 19).date(), datetime(2026, 10, 22).date()) == "-"

    pagina = cliente.get("/laudos/fluxo-laminar").json()["paginas"][0]
    riscos = []
    original = laudos.riscar  # o traço da folha impressa é do motor (26/10: regra de todo documento)
    monkeypatch.setattr(laudos, "riscar", lambda pdf, r: riscos.append(r) or original(pdf, r))
    cliente.get(f"/laudos/fluxo-laminar/{pagina['id']}/pdf")
    assert riscos == []  # folha aberta: sem traço
    cliente.post(f"/laudos/fluxo-laminar/{pagina['id']}/impresso")
    texto = PdfReader(io.BytesIO(cliente.get(f"/laudos/fluxo-laminar/{pagina['id']}/pdf").content)).pages[0].extract_text()
    assert len(riscos) == 1 and len(riscos[0]) == 1  # impressa: o traço que fecha as linhas vazias
    assert "19.10.2026" in texto and "<1|<1" in texto


def test_pca_com_agua_de_consumo_mensal_e_nao_com_agua_do_processo(cliente, logado):
    """01/11 (Danyllo): PCA = baias, linhas e água de consumo mensal; a água do processo cria a linha, mas sem PCA."""
    logado()
    cliente.post("/aguas/processo", json={"dia": "2026-10-20", "hora": "09:30", "pontos": ["manifold"]})
    r = cliente.post("/aguas/consumo/coletas", json={"unidade": "TMG", "tipo": "mensal", "dia": "2026-10-21", "hora": "08:30"})
    assert r.status_code == 201, r.text
    processo = cliente.get("/fluxo-laminar", params={"dia": "2026-10-20"}).json()
    assert processo["registro"] is not None and (processo["registro"]["wort"], processo["registro"]["pca"]) == ("-", "-")
    consumo = cliente.get("/fluxo-laminar", params={"dia": "2026-10-21"}).json()
    assert consumo["registro"]["pca"] == "<1" and "consumo" in consumo["motivo_pca"]


def test_branco_entra_ao_abrir_o_app_ou_o_laudo_e_ate_30_dias_atras(cliente, logado, monkeypatch):
    """01/11: o cartão das folhas saiu do Início, então o branco só entrava abrindo a aba Branco do dia. Agora entra também
    ao abrir o app (GET /turno) e o laudo, e alcança 30 dias (antes 7)."""
    logado()
    cliente.post("/aguas/superficies", json={"tipo": "Baia", "pontos": ["08"], "dia": "2026-10-10", "hora": "07:10"})
    cliente.put("/fluxo-laminar/2026-10-15", json={})  # um branco já existia antes dos dias que faltam
    cliente.post("/aguas/superficies", json={"tipo": "Linha", "pontos": ["4"], "dia": "2026-10-16", "hora": "08:00"})
    monkeypatch.setattr(rotas_turno, "_agora", lambda con: datetime(2026, 10, 25, 10, tzinfo=FUSO))
    assert cliente.get("/turno").status_code == 200
    pagina = cliente.get("/laudos/fluxo-laminar").json()["paginas"][0]
    assert pagina["linhas"] == 2  # o dia 15 e o 16; o 10 fica de fora (antes do primeiro branco: entraria fora de ordem)
    assert cliente.get("/fluxo-laminar", params={"dia": "2026-10-16"}).json()["registro"]["pca"] == "<1"
