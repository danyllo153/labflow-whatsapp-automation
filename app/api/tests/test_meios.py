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
