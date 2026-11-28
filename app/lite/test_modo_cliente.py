"""LabFlow aberto em OUTRO PC: o aviso é claro e este PC não tenta conectar em nada (a Lite só escuta em 127.0.0.1)."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lite  # noqa: E402


def preparar(tmp_path, monkeypatch, pc: str):
    dados = lite.Dados(tmp_path)
    dados.servidor.write_text(f'{{"pc": "{pc}", "porta": 8000, "inicio": "2026-11-27T10:00:00"}}', encoding="utf-8")
    chamadas, linhas, janelas = [], [], []
    monkeypatch.setattr(lite, "conecta", lambda *a, **k: chamadas.append(a) or True)
    monkeypatch.setattr(lite, "log", lambda msg, segredo=False: linhas.append(msg))
    monkeypatch.setattr(lite, "avisar", lambda *a, **k: janelas.append(a))
    monkeypatch.setattr(lite, "abrir_janela", lambda endereco: janelas.append(endereco))
    return dados, chamadas, linhas, janelas


def test_aberto_em_outro_pc_avisa_e_nao_conecta(tmp_path, monkeypatch):
    dados, chamadas, linhas, janelas = preparar(tmp_path, monkeypatch, "OUTRO-PC-DO-LAB")
    assert lite.modo_cliente(dados, argparse.Namespace(sem_navegador=False)) == 2
    assert chamadas == [], "não pode tentar conectar em outro PC"
    texto = "\n".join(linhas)
    assert "OUTRO-PC-DO-LAB" in texto and "Encerrar" in texto and "um PC por vez" in texto
    assert any("OUTRO-PC-DO-LAB" in str(j) for j in janelas)  # a janelinha de aviso
    assert not any(str(j).startswith("http") for j in janelas), "não pode abrir o navegador em endereço de outro PC"


def test_aberto_neste_pc_so_traz_a_janela(tmp_path, monkeypatch):
    dados, chamadas, linhas, janelas = preparar(tmp_path, monkeypatch, lite.socket.gethostname())
    assert lite.modo_cliente(dados, argparse.Namespace(sem_navegador=False)) == 0
    assert chamadas == [("127.0.0.1", 8000, 1)]
    assert janelas == ["http://127.0.0.1:8000/app/"]
