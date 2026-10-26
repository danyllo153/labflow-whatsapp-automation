"""076: laudos de TAB, Coliformes, Howard, NFC, Embarque e da contra-amostra (dados fictícios do banco de teste)."""

import io
from datetime import date

import pytest
from pypdf import PdfReader

from labflow_api import laudos, laudos_analises

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa, monkeypatch):
    monkeypatch.setattr(laudos_analises, "DESDE", date(2026, 1, 1))  # os dados de demonstração são de setembro e outubro
    criar_pessoa(usuario="analista.laudos", cargo="Analista")
    assert cliente.post("/login", json={"usuario": "analista.laudos", "senha": SENHA}).status_code == 200


def _texto(cliente, nome, pagina_id):
    pdf = cliente.get(f"/laudos/{nome}/{pagina_id}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF"), pdf.text[:200]
    return PdfReader(io.BytesIO(pdf.content)).pages[0].extract_text()


@pytest.mark.parametrize(
    "nome, esperado",
    [
        ("tab", "2026"),  # a data da análise no cabeçalho
        ("coliformes", "Ausência"),
        ("howard", "%"),
        ("nfc-tanques", "<1|"),
        ("embarque-fcoj", "A1"),
    ],
)
def test_laudo_preenche_sozinho_e_nao_duplica(cliente, logado, nome, esperado):
    r = cliente.get(f"/laudos/{nome}")
    assert r.status_code == 200, r.text
    paginas = r.json()["paginas"]
    assert paginas and all(p["linhas"] <= p["capacidade"] for p in paginas)
    total = sum(p["linhas"] for p in paginas)
    assert sum(p["linhas"] for p in cliente.get(f"/laudos/{nome}").json()["paginas"]) == total  # listar de novo não duplica
    assert esperado in _texto(cliente, nome, paginas[0]["id"])


def test_folha_do_tab_e_do_nfc_nao_misturam_chaves(cliente, logado, conexao):
    cliente.get("/laudos/tab")
    cliente.get("/laudos/nfc-tanques")
    misturadas = conexao.execute(
        "SELECT laudo, pagina_id FROM app.laudo_linhas WHERE laudo IN ('tab', 'nfc-tanques') GROUP BY 1, 2 HAVING count(DISTINCT chave) > 1"
    ).fetchall()
    assert misturadas == []


def test_folha_impressa_ganha_o_traco_nas_linhas_vazias(cliente, logado, monkeypatch):
    paginas = cliente.get("/laudos/howard").json()["paginas"]
    pagina = next(p for p in paginas if p["linhas"] < p["capacidade"]) if any(p["linhas"] < p["capacidade"] for p in paginas) else None
    riscos = []
    original = laudos.riscar
    monkeypatch.setattr(laudos, "riscar", lambda pdf, r: riscos.append(r) or original(pdf, r))
    alvo = pagina or paginas[0]
    _texto(cliente, "howard", alvo["id"])
    assert riscos == []  # folha aberta: sem traço
    assert cliente.post(f"/laudos/howard/{alvo['id']}/impresso").status_code == 200
    _texto(cliente, "howard", alvo["id"])
    assert (len(riscos) == 1) == (alvo["linhas"] < alvo["capacidade"])


def test_contra_amostra_do_recebimento_corrida(cliente, logado, conexao):
    load = conexao.execute("SELECT load_id FROM recebimento_lotes GROUP BY load_id ORDER BY load_id LIMIT 1").fetchone()[0]
    conexao.execute(
        "INSERT INTO arquivo_recebimento (caixa, load_id, lotes, data_arquivada, data_descarte) VALUES (125, %s, '{1,2,3,7}', '2026-10-21', '2026-10-28')",
        (load,),
    )
    paginas = cliente.get("/laudos/contra-recebimento").json()["paginas"]
    texto = _texto(cliente, "contra-recebimento", paginas[0]["id"])
    assert "125" in texto and "1-3,7" in texto and "28/10/2026" in texto


def test_tabela_das_linhas_no_banco(conexao):
    assert conexao.execute("SELECT has_table_privilege('labflow_app_web', 'app.laudo_linhas', 'INSERT')").fetchone()[0]
    assert not conexao.execute("SELECT has_table_privilege('labflow_app_web', 'app.laudo_linhas', 'DELETE')").fetchone()[0]
