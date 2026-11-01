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


@pytest.mark.parametrize("nome, com_traco", [("tab", True), ("howard", False)])  # o Howard não leva o traço (01/11)
def test_folha_impressa_ganha_o_traco_nas_linhas_vazias(cliente, logado, monkeypatch, nome, com_traco):
    paginas = cliente.get(f"/laudos/{nome}").json()["paginas"]
    pagina = next(p for p in paginas if p["linhas"] < p["capacidade"]) if any(p["linhas"] < p["capacidade"] for p in paginas) else None
    riscos = []
    original = laudos.riscar
    monkeypatch.setattr(laudos, "riscar", lambda pdf, r: riscos.append(r) or original(pdf, r))
    alvo = pagina or paginas[0]
    _texto(cliente, nome, alvo["id"])
    assert riscos == []  # folha aberta: sem traço
    assert cliente.post(f"/laudos/{nome}/{alvo['id']}/impresso").status_code == 200
    _texto(cliente, nome, alvo["id"])
    assert (len(riscos) == 1) == (com_traco and alvo["linhas"] < alvo["capacidade"])


def test_laudo_do_embarque_leva_o_item_na_observacao(cliente, logado):
    paginas = cliente.get("/laudos/embarque-fcoj").json()["paginas"]
    assert "Item " in _texto(cliente, "embarque-fcoj", paginas[0]["id"])  # 01/11: o item (e os outros loads) na Observação


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


def test_amostra_sem_numero_da_composta_e_tanque_com_a_data_da_coleta():
    # (id, data, status, resultado, %, campos, criado, composta, load, item, fábrica, origem, rótulo, lotes, tanque, navio, coleta)
    receb = (1, None, "", None, None, None, None, 18, "90009", "9100", "AQA", "recebimento", "load 90009", "1-5", None, None, None)
    emb = (2, None, "", None, None, None, None, 20, "90012", "9200", None, "embarque", "D.SUN 142 linha 5 fase 1", "1-5", None, None, None)
    terra = (3, None, "", None, None, None, None, None, None, None, None, None, None, None, "47", None, date(2026, 10, 26))
    navio = (4, None, "", None, None, None, None, None, None, None, None, None, None, None, "2P", "O.SKY 189", date(2026, 10, 26))
    assert [laudos_analises._amostra(x) for x in (receb, emb, terra, navio)] == [
        "90009 (1-5)", "D.SUN 142 L5 F1 90012 (A1-A5)", "Tanque 47, 26/10/2026", "O.SKY 189 · 2P, 26/10/2026",
    ]


def test_tabela_se_encaixa_nas_linhas_do_modelo_enviado():
    # um modelo de demonstração com as linhas 1,5 pt mais altas (como o Word desenha) e o mesmo topo
    alta = laudos.Tabela(laudos_analises.CA_EMB.colunas, 222.8, 222.8 + 28 * 13.86, 28)
    modelo = laudos.demonstracao("teste", alta, ("a", "b", "c", "d"))()
    encaixada = laudos.encaixar(laudos_analises.CA_EMB, modelo)
    assert (round(encaixada.topo, 0), round(encaixada.base, 0)) == (223, 611)
    assert laudos.encaixar(laudos_analises.CA_EMB, None) == laudos_analises.CA_EMB  # sem modelo: a medida


def test_finalizar_reabrir_e_excluir_a_folha(cliente, logado, conexao):
    paginas = cliente.get("/laudos/howard").json()["paginas"]
    alvo = paginas[0]
    refs = {r for (r,) in conexao.execute("SELECT ref FROM app.laudo_linhas WHERE pagina_id = %s", (alvo["id"],))}
    r = cliente.post(f"/laudos/howard/{alvo['id']}/finalizar")
    assert r.status_code == 200 and next(p for p in r.json()["paginas"] if p["id"] == alvo["id"])["impresso"]
    r = cliente.post(f"/laudos/howard/{alvo['id']}/reabrir")  # editar: volta a "em preenchimento"
    assert not next(p for p in r.json()["paginas"] if p["id"] == alvo["id"])["impresso"]
    cliente.post(f"/laudos/howard/{alvo['id']}/finalizar")
    r = cliente.delete(f"/laudos/howard/{alvo['id']}")
    assert r.status_code == 200 and all(p["id"] != alvo["id"] for p in r.json()["paginas"])  # a folha sai da lista
    nova = conexao.execute("SELECT DISTINCT pagina_id FROM app.laudo_linhas WHERE ref = ANY(%s) AND laudo = 'howard'", (list(refs),)).fetchall()
    assert len(nova) == 1 and nova[0][0] != alvo["id"]  # as linhas foram juntas para uma folha nova
    assert conexao.execute("SELECT 1 FROM app.paginas_laudo WHERE id = %s", (alvo["id"],)).fetchone() is None  # vazia: saiu do banco (01/11)
    assert cliente.get(f"/laudos/howard/{alvo['id']}/pdf").status_code == 404


def test_so_o_admin_apaga_a_folha_de_vez_e_as_linhas_nao_voltam(cliente, logado, criar_pessoa, conexao):
    """01/11 (082): a folha sai do banco; as linhas ficam fora do laudo (pagina_id NULL) e não voltam numa folha nova."""
    alvo = cliente.get("/laudos/howard").json()["paginas"][0]
    refs = [r for (r,) in conexao.execute("SELECT ref FROM app.laudo_linhas WHERE pagina_id = %s", (alvo["id"],))]
    assert refs
    assert cliente.post(f"/laudos/howard/{alvo['id']}/apagar").status_code == 403  # o Analista não apaga
    criar_pessoa(usuario="admin.laudos", cargo="Admin")
    cliente.cookies.clear()
    assert cliente.post("/login", json={"usuario": "admin.laudos", "senha": SENHA}).status_code == 200
    cliente.post(f"/laudos/howard/{alvo['id']}/finalizar")
    r = cliente.post(f"/laudos/howard/{alvo['id']}/apagar")
    assert r.status_code == 200, r.text
    assert all(p["id"] != alvo["id"] for p in r.json()["paginas"])
    assert conexao.execute("SELECT 1 FROM app.paginas_laudo WHERE id = %s", (alvo["id"],)).fetchone() is None
    fora = conexao.execute("SELECT pagina_id FROM app.laudo_linhas WHERE laudo = 'howard' AND ref = ANY(%s)", (refs,)).fetchall()
    assert len(fora) == len(refs) and all(p is None for (p,) in fora)
    cliente.get("/laudos/howard")  # listar de novo (distribui as linhas novas) não traz as apagadas de volta
    assert all(p is None for (p,) in conexao.execute("SELECT pagina_id FROM app.laudo_linhas WHERE laudo = 'howard' AND ref = ANY(%s)", (refs,)))


def test_folha_vencida_pelo_rodape_do_modelo_sai_da_lista_e_o_admin_apaga(cliente, logado, criar_pessoa, conexao):
    """01/11: o rodapé do modelo diz o prazo de guarda ("período mínimo de 1 mês"); passado o prazo, a folha finalizada sai
    da lista e o Admin apaga as vencidas de uma vez."""
    from reportlab.pdfgen import canvas

    saida = io.BytesIO()
    c = canvas.Canvas(saida)
    c.drawString(40, 40, "Nota: arquivado por um período mínimo de 1 mês.")
    c.save()
    laudos._GUARDAS.clear()
    uid = criar_pessoa(usuario="admin.guarda", cargo="Admin")
    conexao.execute(
        "INSERT INTO app.modelos_documento (nome, pdf, enviado_por, enviado_em) VALUES (%s, %s, %s, now())"
        " ON CONFLICT (nome) DO UPDATE SET pdf = EXCLUDED.pdf",
        (laudos.LAUDOS["howard"].modelo, saida.getvalue(), uid),
    )
    alvo = cliente.get("/laudos/howard").json()["paginas"][0]
    cliente.post(f"/laudos/howard/{alvo['id']}/finalizar")
    r = cliente.get("/laudos/howard").json()
    assert r["guarda"] == "1 mês" and r["vencidas"] == 0 and any(p["id"] == alvo["id"] for p in r["paginas"])
    conexao.execute("UPDATE app.paginas_laudo SET impresso_em = now() - interval '40 days' WHERE id = %s", (alvo["id"],))
    r = cliente.get("/laudos/howard").json()
    assert r["vencidas"] == 1 and all(p["id"] != alvo["id"] for p in r["paginas"])
    assert cliente.post("/laudos/howard/apagar-vencidas").status_code == 403  # o Analista não apaga
    cliente.cookies.clear()
    assert cliente.post("/login", json={"usuario": "admin.guarda", "senha": SENHA}).status_code == 200
    r = cliente.post("/laudos/howard/apagar-vencidas")
    assert r.status_code == 200 and r.json()["vencidas"] == 0
    assert conexao.execute("SELECT 1 FROM app.paginas_laudo WHERE id = %s", (alvo["id"],)).fetchone() is None


def test_prazo_de_guarda_escrito_no_rodape():
    assert laudos.guarda_do_texto("por um período mínimo de 1 mês.").texto == "1 mês"
    assert laudos.guarda_do_texto("período mínimo de dois\nanos").texto == "2 anos"
    assert laudos.guarda_do_texto("sem prazo") is None
