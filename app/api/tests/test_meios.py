"""APP-036: meios de cultura e lotes (lote em uso com período, histórico por CSV e o laudo LAB/090). Lotes fictícios."""

import io
from datetime import date, datetime

import pytest
from pypdf import PdfReader

from labflow_api import rotas_meios
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista", usuario=None):
        usuario = usuario or f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


def _meio(corpo, meio):
    return next(m for m in corpo["meios"] if m["meio"] == meio)


def test_cadastrar_e_escolher_o_lote_em_uso_inclusive_voltar_a_um_antigo(cliente, logado, conexao):
    logado()
    r = cliente.post("/meios", json={"meio": "PDA", "lote": " 1000001 ", "recebido_em": "2025-10-27", "usar": True})
    assert r.status_code == 201, r.text
    cliente.post("/meios", json={"meio": "PDA", "lote": "1000002", "recebido_em": "2026-10-13"})  # chegou, mas fica guardado
    pda = _meio(cliente.get("/meios").json(), "PDA")
    assert [l["lote"] for l in pda["lotes"]] == ["1000002", "1000001"]  # o mais novo primeiro
    assert pda["em_uso"]["lote"] == "1000001"  # em uso não é sempre o mais novo
    novo, antigo = pda["lotes"][0]["id"], pda["lotes"][1]["id"]
    cliente.post(f"/meios/{novo}/usar")
    pda = _meio(cliente.post(f"/meios/{antigo}/usar").json(), "PDA")  # voltou a usar o antigo
    assert pda["em_uso"]["lote"] == "1000001"
    assert len(pda["lotes"][1]["usos"]) == 2 and pda["lotes"][1]["usos"][0]["ate"] is None
    assert conexao.execute("SELECT count(*) FROM app.uso_lote_meio WHERE meio = 'PDA' AND ate IS NULL").fetchone()[0] == 1


def test_lote_em_uso_no_dia(cliente, logado, conexao):
    uid = logado()
    a = rotas_meios._inserir(conexao, uid, "OSA", "2000001", date(2026, 1, 1), "OK", "OK", None)
    b = rotas_meios._inserir(conexao, uid, "OSA", "2000002", date(2026, 3, 1), "OK", "OK", None)
    conexao.execute(
        "INSERT INTO app.uso_lote_meio (meio, lote_meio_id, desde, ate, marcado_por) VALUES ('OSA', %s, %s, %s, %s), ('OSA', %s, %s, NULL, %s)",
        (a, datetime(2026, 1, 2, 8, tzinfo=FUSO), datetime(2026, 3, 5, 10, tzinfo=FUSO), uid, b, datetime(2026, 3, 5, 10, tzinfo=FUSO), uid),
    )
    assert rotas_meios.lote_em_uso(conexao, "OSA", date(2026, 2, 1)) == "2000001"
    assert rotas_meios.lote_em_uso(conexao, "OSA", date(2026, 3, 5)) == "2000002"  # trocou no dia: vale o que entrou
    assert rotas_meios.lote_em_uso(conexao, "OSA", date(2025, 12, 1)) is None


def test_regras_do_cadastro(cliente, logado):
    logado()
    assert cliente.post("/meios", json={"meio": "Ágar", "lote": "1", "recebido_em": "2026-01-01"}).status_code == 422
    assert cliente.post("/meios", json={"meio": "PCA", "lote": "  ", "recebido_em": "2026-01-01"}).status_code == 422
    assert cliente.post("/meios", json={"meio": "PCA", "lote": "1", "recebido_em": "2099-01-01"}).status_code == 422
    assert cliente.post("/meios", json={"meio": "PCA", "lote": "3000001", "recebido_em": "2026-01-01"}).status_code == 201
    assert cliente.post("/meios", json={"meio": "PCA", "lote": "3000001", "recebido_em": "2026-01-01"}).status_code == 409


def test_excluir_so_lote_que_nunca_foi_usado(cliente, logado):
    logado()
    corpo = cliente.post("/meios", json={"meio": "Wort", "lote": "4000001", "recebido_em": "2026-01-01", "usar": True}).json()
    usado = _meio(corpo, "Wort")["lotes"][0]["id"]
    assert cliente.post(f"/meios/{usado}/excluir", json={"motivo": "digitei errado"}).status_code == 422
    errado = _meio(cliente.post("/meios", json={"meio": "Wort", "lote": "4000009", "recebido_em": "2026-01-02"}).json(), "Wort")["lotes"][0]["id"]
    assert cliente.post(f"/meios/{errado}/excluir", json={"motivo": "x"}).status_code == 422
    r = cliente.post(f"/meios/{errado}/excluir", json={"motivo": "digitei errado"})
    assert [l["lote"] for l in _meio(r.json(), "Wort")["lotes"]] == ["4000001"]


def test_importar_o_historico_por_csv(cliente, logado):
    logado("Analista")
    csv = "meio;lote;recebido_em;conservacao;ph;observacao;em_uso\nOSA;5000001;01.11.2021;OK;OK;-;\nOSA;5000002;02.03.2026;OK;OK;-;sim\n"
    assert cliente.put("/meios/importar", content=csv.encode()).status_code == 403  # só o Admin
    logado("Admin")
    assert cliente.put("/meios/importar", content=b"meio;lote;recebido_em\nXYZ;1;01.01.2026\n").json()["erros"] == ["linha 1: meio desconhecido: XYZ"]
    r = cliente.put("/meios/importar", content=csv.encode())
    assert r.json() == {"importados": 2, "ja_existiam": 0, "erros": []}
    assert cliente.put("/meios/importar", content=csv.encode()).json()["ja_existiam"] == 2  # de novo: nada repete
    osa = _meio(cliente.get("/meios").json(), "OSA")
    assert osa["em_uso"]["lote"] == "5000002" and [l["recebido_em"] for l in osa["lotes"]] == ["2026-03-02", "2021-11-01"]


def test_laudo_tem_uma_folha_por_meio_com_33_linhas(cliente, logado):
    logado()
    cliente.post("/meios", json={"meio": "PCA", "lote": "6000001", "recebido_em": "2026-01-21"})
    cliente.post("/meios", json={"meio": "OSA", "lote": "6000002", "recebido_em": "2026-03-02"})
    pca = cliente.get("/laudos/meios-PCA").json()
    assert [(p["linhas"], p["capacidade"]) for p in pca["paginas"]] == [(1, 33)]
    texto = PdfReader(io.BytesIO(cliente.get(f"/laudos/meios-PCA/{pca['paginas'][0]['id']}/pdf").content)).pages[0].extract_text()
    assert "6000001" in texto and "21.01.2026" in texto and "6000002" not in texto  # o OSA vai na folha dele
    assert cliente.get("/laudos/nao-existe").status_code == 404


def test_corrigir_desde_quando_o_lote_esta_em_uso(cliente, logado, monkeypatch):
    """O lote marcado hoje já era usado antes (ex.: carga do histórico): a data volta, e os dias antigos ganham o lote."""
    from labflow_api import rotas_turno

    monkeypatch.setattr(rotas_turno, "_agora", lambda con: datetime(2031, 5, 20, 10, tzinfo=FUSO))
    logado()
    cliente.post("/meios", json={"meio": "OSA", "lote": "9000001", "recebido_em": "2026-01-02", "usar": True})
    lotes = _meio(cliente.get("/meios").json(), "OSA")["lotes"]
    cliente.post("/meios", json={"meio": "OSA", "lote": "9000002", "recebido_em": "2026-01-03"})
    novo = next(l["id"] for l in _meio(cliente.get("/meios").json(), "OSA")["lotes"] if l["lote"] == "9000002")
    cliente.post(f"/meios/{novo}/usar")
    assert cliente.put("/meios/OSA/em-uso-desde", json={"desde": "2031-05-21"}).status_code == 422  # depois de hoje
    r = cliente.put("/meios/OSA/em-uso-desde", json={"desde": "2031-05-10"})
    assert r.status_code == 200, r.text
    assert _meio(r.json(), "OSA")["em_uso"]["desde"].startswith("10/05/2031")
    assert lotes  # o primeiro lote continua no histórico
    # o anterior começou "agora" (hoje de verdade, antes de 2031): voltar para antes dele é recusado
    r = cliente.put("/meios/OSA/em-uso-desde", json={"desde": "2020-01-01"})
    assert r.status_code == 422 and "lote anterior" in r.json()["detail"]
    assert cliente.put("/meios/PCA/em-uso-desde", json={"desde": "2031-05-10"}).status_code == 404  # sem lote em uso


def test_lote_em_uso_do_dia_depois_da_correcao(cliente, logado, conexao, monkeypatch):
    from labflow_api import rotas_turno

    monkeypatch.setattr(rotas_turno, "_agora", lambda con: datetime(2031, 5, 20, 10, tzinfo=FUSO))
    logado()
    cliente.post("/meios", json={"meio": "Wort", "lote": "WRT-1", "recebido_em": "2026-01-02", "usar": True})
    cliente.put("/meios/Wort/em-uso-desde", json={"desde": "2031-05-01"})
    assert rotas_meios.lote_em_uso(conexao, "Wort", date(2031, 5, 3)) == "WRT-1"
    assert rotas_meios.lote_em_uso(conexao, "Wort", date(2025, 12, 31)) is None  # nenhum lote recebido até o dia


def test_sem_marcacao_no_dia_vale_o_ultimo_lote_recebido_ate_ele(cliente, logado, conexao):
    """Antes da marcação (carga do histórico), o laudo usa o último lote recebido até aquele dia; depois, o marcado."""
    logado()
    for lote, recebido in (("PCA-1", "2026-03-01"), ("PCA-2", "2026-08-01"), ("PCA-3", "2026-09-15")):
        cliente.post("/meios", json={"meio": "PCA", "lote": lote, "recebido_em": recebido})
    p2 = next(l["id"] for l in _meio(cliente.get("/meios").json(), "PCA")["lotes"] if l["lote"] == "PCA-2")
    cliente.post(f"/meios/{p2}/usar")  # marcado agora: o PCA-3 chegou, mas o em uso continua o PCA-2
    assert rotas_meios.lote_em_uso(conexao, "PCA", date(2026, 5, 10)) == "PCA-1"
    assert rotas_meios.lote_em_uso(conexao, "PCA", date(2026, 8, 20)) == "PCA-2"
    assert rotas_meios.lote_em_uso(conexao, "PCA", date(2026, 9, 20)) == "PCA-3"  # sem marcação: o último recebido
    hoje = datetime.now(FUSO).date()
    assert rotas_meios.lote_em_uso(conexao, "PCA", hoje) == "PCA-2"  # com marcação: o marcado
