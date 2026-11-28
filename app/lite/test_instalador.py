"""Instalação e atualização pelo "Abrir LabFlow.exe" (spec 12): assinatura do .exe, limpeza só do que está velho, sem tocar em dados,
e o sfx.txt sem nada que peça administrador. O .exe em si (WinRAR) é testado à mão em montar-exe.ps1."""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lite  # noqa: E402

AQUI = Path(__file__).resolve().parent


def test_sem_registro_nao_atualiza(tmp_path):
    local, raiz = tmp_path / "local", tmp_path / "rede"
    local.mkdir(), raiz.mkdir()
    (raiz / lite.EXE_REDE).write_bytes(b"x" * 10)
    assert lite.exe_da_rede_mais_novo(local, raiz) is None  # desenvolvimento / pacote sem .exe: nunca chama o .exe


def test_exe_igual_nao_atualiza_e_exe_trocado_atualiza(tmp_path):
    local, raiz = tmp_path / "local", tmp_path / "rede"
    local.mkdir(), raiz.mkdir()
    exe = raiz / lite.EXE_REDE
    exe.write_bytes(b"v1" * 100)
    (local / lite.REGISTRO).write_text(json.dumps({"exe": str(exe), "assinatura": lite.assinatura_do_exe(exe)}), encoding="utf-8")
    assert lite.exe_da_rede_mais_novo(local, raiz) is None
    exe.write_bytes(b"v2" * 300)  # trocou o arquivo: tamanho diferente
    assert lite.exe_da_rede_mais_novo(local, raiz) == exe
    exe.unlink()  # rede fora do ar / arquivo sumiu: abre o que já está instalado
    assert lite.exe_da_rede_mais_novo(local, raiz) is None


def test_registro_de_outra_pasta_de_rede_e_ignorado(tmp_path):
    local, raiz, outra = tmp_path / "local", tmp_path / "rede", tmp_path / "outra"
    for p in (local, raiz, outra):
        p.mkdir()
    (raiz / lite.EXE_REDE).write_bytes(b"a")
    (outra / lite.EXE_REDE).write_bytes(b"bb")
    (local / lite.REGISTRO).write_text(json.dumps({"exe": str(outra / lite.EXE_REDE), "assinatura": "0-0"}), encoding="utf-8")
    assert lite.exe_da_rede_mais_novo(local, raiz) is None


def test_limpeza_apaga_so_programas_velhos_e_nunca_dados(tmp_path):
    local = tmp_path / "LabFlowLite"
    atual, velho, antigo = local / "p-abc1234", local / "programa-velho", local / "programa"
    for p in (atual, velho, antigo, local / "data", local / "marca"):
        p.mkdir(parents=True)
        (p / "arq.txt").write_text("x")
    rede_dados = tmp_path / "rede" / "dados"
    rede_dados.mkdir(parents=True)
    (rede_dados / "labflow.dump").write_text("d")
    lite.limpar_programas_antigos(local, atual)
    assert atual.exists() and (atual / "arq.txt").exists()
    assert not velho.exists() and not antigo.exists()
    assert (local / "data" / "arq.txt").exists() and (local / "marca" / "arq.txt").exists()  # banco do PC e marca ficam
    assert (rede_dados / "labflow.dump").read_text() == "d"  # a pasta de rede nem é olhada


def test_limpeza_deixa_pasta_em_uso(tmp_path, monkeypatch):
    local = tmp_path / "LabFlowLite"
    atual, velho = local / "p-abc1234", local / "programa-velho"
    for p in (atual, velho):
        p.mkdir(parents=True)
    real = os.rename

    def recusa(a, b):
        if Path(a).name == "programa-velho":
            raise PermissionError("em uso")
        return real(a, b)

    monkeypatch.setattr(os, "rename", recusa)
    lite.limpar_programas_antigos(local, atual)
    assert velho.exists()  # em uso: fica para a próxima vez, sem apagar nada pela metade


def test_instalacao_grava_registro_e_marca_de_pronto(tmp_path, monkeypatch):
    local, raiz = tmp_path / "local", tmp_path / "rede"
    local.mkdir(), raiz.mkdir()
    exe = raiz / lite.EXE_REDE
    exe.write_bytes(b"exe")
    programa = tmp_path / "local" / "p-abc1234"
    programa.mkdir()
    chamadas = []
    monkeypatch.setattr(lite, "INST", programa)
    monkeypatch.setattr(lite, "criar_atalho", lambda p, r: chamadas.append((p, r)) or True)
    monkeypatch.setattr(lite, "log", lambda *a, **k: None)
    lite.registrar_instalacao(exe, local)
    assert chamadas == [(programa, raiz)]
    reg = json.loads((local / lite.REGISTRO).read_text(encoding="utf-8"))
    assert reg["assinatura"] == lite.assinatura_do_exe(exe) and reg["exe"] == str(exe)
    assert (programa / "pronto.txt").exists()
    assert lite.exe_da_rede_mais_novo(local, raiz) is None  # recém instalado: nada a atualizar


def test_sfx_sem_administrador_e_so_na_pasta_do_usuario():
    sfx = (AQUI / "sfx.txt").read_text(encoding="ascii")
    comandos = "\n".join(l for l in sfx.splitlines() if not l.startswith(";"))
    assert r"Path=%LOCALAPPDATA%\LabFlowLite\p-{{HASH}}" in comandos.splitlines()
    for proibido in ("RequireAdmin", "ProgramFiles", "HKLM", "reg add", "sc create", "netsh", "-ExecutionPolicy", "Bypass", ".vbs", "dados"):
        assert proibido.lower() not in comandos.lower().replace("pronto.txt", ""), proibido
    assert "pythonw.exe" in comandos and "--instalado-por" in comandos  # sem janela preta
    # o Presetup só mexe na pasta DESTA versão (nenhuma variável vinda do usuário além do %LOCALAPPDATA% do Windows)
    presetup = next(l for l in comandos.splitlines() if l.startswith("Presetup="))
    assert presetup.count("p-{{HASH}}") == 3 and "pronto.txt" in presetup and "labflow" not in presetup.replace("LabFlowLite", "").lower()


def test_montar_exe_nao_leva_dados_nem_pede_bypass():
    ps = (AQUI / "montar-exe.ps1").read_text(encoding="ascii")
    assert r'"-x*\dados"' in ps and "-sfx" in ps
    assert not (AQUI / "pacote").glob("*.bat") or not list((AQUI / "pacote").glob("*.bat"))
    assert not list((AQUI / "pacote").glob("*.vbs"))


def test_argumentos_do_atalho_com_exe_na_raiz_da_unidade():
    script = Path("C:/prog/lite/lite.py")
    normal = lite.argumentos_do_atalho(script, Path("X:/LabFlow"))
    assert normal.endswith('--oculto') and normal.count('"') == 4
    com_barra = lite.argumentos_do_atalho(script, Path("G:" + chr(92)))
    assert com_barra.endswith("G:" + chr(92) + '." --oculto'), com_barra  # a aspa final nao pode ser escapada pela barra
    assert com_barra.count('"') == 4 and (chr(92) + '"') not in com_barra


def test_caminho_mais_longo_e_limite(tmp_path):
    programa = tmp_path / "p-abc1234"
    fundo = programa / "postgres" / "bin"
    fundo.mkdir(parents=True)
    (fundo / "libpq.dll").write_text("x")
    (programa / "a.txt").write_text("x")
    tamanho, quem = lite.caminho_mais_longo(programa)
    assert quem == fundo / "libpq.dll" and tamanho == len(str(fundo / "libpq.dll"))
    assert lite.checar_caminho(programa) is None  # curto: segue


def test_caminho_longo_gera_mensagem_clara(tmp_path, monkeypatch):
    programa = tmp_path / "p-abc1234"
    (programa / "bin").mkdir(parents=True)
    (programa / "bin" / "libpq.dll").write_text("x")
    monkeypatch.setattr(lite, "LIMITE_CAMINHO", 10)
    msg = lite.checar_caminho(programa)
    assert msg and "longo demais" in msg and "TI" in msg and str(programa) in msg and "260" in msg


def test_nome_da_pasta_do_programa_so_aceita_hash_curto():
    assert lite.NOME_PROGRAMA.match("p-0a1b2c3") and not lite.NOME_PROGRAMA.match("p-../x") and not lite.NOME_PROGRAMA.match("p-0a1b2c3d")


def test_limpeza_nao_toca_pasta_fora_do_padrao(tmp_path):
    local = tmp_path / "LabFlowLite"
    atual, estranha = local / "p-abc1234", local / "p-dados"
    for p in (atual, estranha):
        p.mkdir(parents=True)
    lite.limpar_programas_antigos(local, atual)
    assert estranha.exists()
