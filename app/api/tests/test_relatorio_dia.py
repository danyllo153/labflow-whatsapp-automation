"""Relatório do dia (as leituras): o mesmo relatório do bot (docs/comandos.md, seção 15), com o dia escolhido. Dados fictícios."""

from datetime import timedelta

import pytest

from labflow_api.rotas_relatorio_dia import montar

SENHA = "Senha-de-teste-1"


@pytest.fixture
def hoje(conexao):
    return conexao.execute("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date").fetchone()[0]


def _logar(cliente, criar_pessoa, cargo="Analista"):
    usuario = f"{cargo.lower()}.relatorio"
    criar_pessoa(usuario=usuario, cargo=cargo)
    cliente.cookies.clear()
    assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200


def _gravar(cliente, url, pedido):
    r = cliente.post(url, json={**pedido, "previa": False})
    assert r.status_code == 200, r.text
    return r.json()


def test_relatorio_mostra_as_leituras_de_hoje_e_o_texto_do_bot(cliente, criar_pessoa, hoje):
    _logar(cliente, criar_pessoa)
    coleta = {"origem": "terra", "tanques": "9951, 9952", "data": str(hoje - timedelta(days=2))}
    _gravar(cliente, "/analises/tanques/coleta", coleta)
    _gravar(cliente, "/analises/tanques/analise", {**coleta, "frasco": "Normal"})

    r = cliente.get("/relatorio-do-dia")
    assert r.status_code == 200, r.text
    rel = r.json()
    assert rel["dia"] == str(hoje) and rel["texto"].startswith(f"*Relatório do dia {hoje:%d/%m/%Y}*")
    tank = next(b for b in rel["blocos"] if b["titulo"] == "NFC — Tank farm")
    normal = next(s for s in tank["secoes"] if s["titulo"] == "AMOSTRA NORMAL")
    ct = next(l for l in normal["linhas"] if l["rotulo"] == "C.T 48h")
    assert {"9951", "9952"} <= {e["texto"] for e in ct["entradas"]}
    assert "C.T 48h: " in rel["texto"] and "Lidas: " in rel["texto"]

    # lida: entra com ✅ e aparece no completo; a outra fica de fora do completo
    leitura = next(l for l in cliente.get("/analises/tanques/leituras", params={"busca": "9951"}).json()
                   if l["tanque"] == "9951" and l["analise"] == "C.T 48h")
    _gravar(cliente, "/analises/tanques/placas", {"itens": [{"analise_id": leitura["analise_id"], "etapa": leitura["etapa"], "placas": "<1, <1, <1"}]})
    rel = cliente.get("/relatorio-do-dia", params={"completo": True}).json()
    tank = next(b for b in rel["blocos"] if b["titulo"] == "NFC — Tank farm")
    ct = next(l for s in tank["secoes"] if s["titulo"] == "AMOSTRA NORMAL" for l in s["linhas"] if l["rotulo"] == "C.T 48h")
    textos = [e["texto"] for e in ct["entradas"]]
    assert "9951 ✅" in textos and "9952" not in textos and ct["situacao"] == "ok"
    assert "— completo*" in rel["texto"] and "9951 — ok" in rel["texto"]
    assert not any(m in rel["texto"] for m in ("✅", "🚨", "⚠️", "📋"))


def test_relatorio_de_outro_dia_e_dia_sem_nada(cliente, criar_pessoa, hoje):
    _logar(cliente, criar_pessoa, "Consultor")
    r = cliente.get("/relatorio-do-dia", params={"dia": str(hoje - timedelta(days=4000))})
    assert r.status_code == 200, r.text
    assert r.json()["blocos"] == [] and "Nenhuma leitura prevista" in r.json()["texto"]


def test_montar_concentrado_alarmes_e_faixas(hoje):
    base = {"onde": "", "load": "77001", "lotes": None, "composta_id": None, "tanque": None, "data_coleta": None}
    conc = [
        {**base, "bloco": "Recebimento", "linha": "C.T 48h", "numero": n, "lido": n < 7, "resultado": "250" if n == 6 else "<10", "alarme": n == 6}
        for n in (4, 5, 6, 7)
    ] + [{**base, "bloco": "Recebimento", "linha": "TAB", "numero": None, "lotes": [6, 7, 8], "composta_id": 1, "lido": True,
          "resultado": "Positivo", "alarme": True}]
    blocos, texto, lidos, total, alertas = montar(hoje, False, [], conc, {})
    assert "C.T 48h: 77001 (4-7)" in texto and "TAB: 77001 (6-8)" in texto
    assert texto.endswith("*Atenção:*\n- C.T 48h ≥ 200 — 77001: lote 6 = 250\n- TAB POSITIVO — 77001 (6-8)")
    assert (lidos, total, alertas) == (4, 5, 2) and [b.titulo for b in blocos] == ["FCOJ — Recebimento"]
    assert blocos[0].secoes[0].linhas[0].entradas[0].texto == "77001 (4-5 ✅, 6 🚨, 7)"  # na tela, as marcas continuam
    _, texto, *_ = montar(hoje, True, [], conc, {"finalizado_por": "Ana", "finalizado_as": "16:40"})
    assert "C.T 48h: 77001 (4-6) — não ok" in texto and "B.L 72h: -" in texto
    assert "Ainda há 1 leitura por fazer" in texto and "finalizada por Ana às 16:40.\n\n*Atenção:*" in texto
