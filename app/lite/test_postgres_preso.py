"""PostgreSQL esquecido de uma abertura anterior: é parado antes de ligar, e a pasta do programa antigo só é apagada sem processo dentro.
Sem postgres de verdade, sem porta, sem o LOCALAPPDATA real: o processo "vivo" é um sleep do próprio teste."""
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lite  # noqa: E402


INICIO = 1_700_000_000


def _pid_file(data: Path, pid: int, pasta: Path | None = None) -> None:
    data.mkdir(parents=True, exist_ok=True)
    (data / "postmaster.pid").write_text(f"{pid}\n{pasta or data}\n{INICIO}\n54329\n", encoding="utf-8")


def _falso(monkeypatch, vivos: dict):
    """vivos: pid -> caminho do exe. Simula também o pg_ctl: chamadas registradas; 'stop' tira o pid da tabela (se `obedece`)."""
    chamadas = []
    monkeypatch.setattr(lite, "imagem_do_processo", lambda pid: vivos.get(pid))
    monkeypatch.setattr(lite, "inicio_do_processo", lambda pid: INICIO + 2 if pid in vivos else None)

    def run(cmd, **kw):
        chamadas.append(cmd)
        modo = cmd[cmd.index("-m") + 1]
        if modo in estado["obedece"]:
            vivos.clear()
        return subprocess.CompletedProcess(cmd, 0, "", "")

    estado = {"obedece": ("fast", "immediate")}
    monkeypatch.setattr(lite.subprocess, "run", run)
    monkeypatch.setattr(lite.time, "sleep", lambda *_: None)
    return chamadas, estado


def test_postgres_vivo_para_esta_data_e_parado_com_fast(tmp_path, monkeypatch):
    data = tmp_path / "data"
    exe = tmp_path / "p-velho" / "postgres" / "bin" / "postgres.exe"
    _pid_file(data, 4242)
    chamadas, _ = _falso(monkeypatch, {4242: exe})
    assert lite.parar_postgres_esquecido(data, "pg_ctl-padrao") is True
    assert len(chamadas) == 1 and chamadas[0][-1] == "stop" and "fast" in chamadas[0] and str(data) in chamadas[0]


def test_fast_que_nao_resolve_cai_para_immediate(tmp_path, monkeypatch):
    data = tmp_path / "data"
    _pid_file(data, 4242)
    chamadas, estado = _falso(monkeypatch, {4242: tmp_path / "postgres.exe"})
    estado["obedece"] = ("immediate",)
    assert lite.parar_postgres_esquecido(data, "pg_ctl-padrao") is True
    assert [c[c.index("-m") + 1] for c in chamadas] == ["fast", "immediate"]


def test_que_nao_para_devolve_false(tmp_path, monkeypatch):
    data = tmp_path / "data"
    _pid_file(data, 4242)
    chamadas, estado = _falso(monkeypatch, {4242: tmp_path / "postgres.exe"})
    estado["obedece"] = ()
    assert lite.parar_postgres_esquecido(data, "pg_ctl-padrao") is False
    pg = lite.Postgres(tmp_path)
    try:
        pg.liberar_data()
    except RuntimeError as erro:
        assert "não quis parar" in str(erro)
    else:
        raise AssertionError("devia recusar ligar")


def test_pid_morto_ou_outro_processo_ou_outra_pasta_nao_mexe(tmp_path, monkeypatch):
    data = tmp_path / "data"
    _pid_file(data, 4242)
    chamadas, _ = _falso(monkeypatch, {})  # PID morto
    assert lite.parar_postgres_esquecido(data, "x") is True and chamadas == []
    chamadas, _ = _falso(monkeypatch, {4242: tmp_path / "chrome.exe"})  # PID reaproveitado por outro programa
    assert lite.parar_postgres_esquecido(data, "x") is True and chamadas == []
    _pid_file(data, 4242, pasta=tmp_path / "outra-data")  # postgres de outra pasta data
    chamadas, _ = _falso(monkeypatch, {4242: tmp_path / "postgres.exe"})
    assert lite.parar_postgres_esquecido(data, "x") is True and chamadas == []
    (data / "postmaster.pid").unlink()  # sem arquivo
    assert lite.postgres_vivo_do_data(data) is None


def test_subir_banco_para_o_esquecido_antes_de_ligar(tmp_path, monkeypatch):
    ordem = []
    pg = lite.Postgres(tmp_path)
    monkeypatch.setattr(pg, "liberar_data", lambda: ordem.append("liberar"))
    monkeypatch.setattr(pg, "iniciar", lambda: ordem.append("iniciar"))
    import inspect

    fonte = inspect.getsource(lite.Servidor.subir_banco)
    assert fonte.index("pg.liberar_data()") < fonte.index("self.tratar_versao_do_banco()") < fonte.index("pg.iniciar()")


def test_nao_apaga_programa_antigo_com_postgres_vivo(tmp_path, monkeypatch):
    local = tmp_path / "LabFlowLite"
    antigo = local / "programa"
    atual = local / "p-novo1"
    for p in (antigo, atual):
        (p / "postgres" / "bin").mkdir(parents=True)
    _pid_file(local / "data", 4242)
    exe = antigo / "postgres" / "bin" / "postgres.exe"
    chamadas, estado = _falso(monkeypatch, {4242: exe})
    estado["obedece"] = ()  # não para
    monkeypatch.setattr(lite, "NOME_PROGRAMA", lite.NOME_PROGRAMA)
    lite.limpar_programas_antigos(local, atual)
    assert antigo.exists() and atual.exists()  # nada renomeado nem apagado
    assert not list(local.glob("apagar-*"))


def test_para_o_postgres_e_so_depois_apaga_o_programa_antigo(tmp_path, monkeypatch):
    local = tmp_path / "LabFlowLite"
    antigo = local / "programa"
    atual = local / "p-novo1"
    for p in (antigo, atual):
        (p / "postgres" / "bin").mkdir(parents=True)
    _pid_file(local / "data", 4242)
    chamadas, _ = _falso(monkeypatch, {4242: antigo / "postgres" / "bin" / "postgres.exe"})
    lite.limpar_programas_antigos(local, atual)
    assert chamadas and "fast" in chamadas[0]
    assert not antigo.exists() and atual.exists()


def test_postgres_de_dentro_da_pasta_atual_nao_e_tocado_pela_limpeza(tmp_path, monkeypatch):
    local = tmp_path / "LabFlowLite"
    antigo = local / "programa"
    atual = local / "p-novo1"
    for p in (antigo, atual):
        p.mkdir(parents=True)
    _pid_file(local / "data", 4242)
    chamadas, _ = _falso(monkeypatch, {4242: atual / "postgres" / "bin" / "postgres.exe"})
    lite.limpar_programas_antigos(local, atual)
    assert chamadas == [] and not antigo.exists()


def test_parar_espera_sair_e_forca_se_preciso(tmp_path, monkeypatch):
    data = tmp_path / "data"
    pg = lite.Postgres(tmp_path)
    _pid_file(data, 4242)
    chamadas, estado = _falso(monkeypatch, {4242: tmp_path / "postgres.exe"})
    monkeypatch.setattr(pg, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0, "", ""))  # o "fast" normal não surte efeito
    assert pg.parar() is True
    assert [c[c.index("-m") + 1] for c in chamadas][0] == "fast"


def _sem_pg_ctl(monkeypatch, vivos):
    chamadas, _ = _falso(monkeypatch, vivos)
    return chamadas


def test_sem_linha_2_desiste_e_nao_chama_pg_ctl(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir()
    (data / "postmaster.pid").write_text("4242\n", encoding="utf-8")
    chamadas = _sem_pg_ctl(monkeypatch, {4242: tmp_path / "postgres.exe"})
    assert lite.postgres_vivo_do_data(data) is None
    assert lite.parar_postgres_esquecido(data, "x") is True and chamadas == []
    assert lite.postgres_vivo_duvidoso(data) is True


def test_postgres_fora_da_pasta_da_lite_nao_e_parado(tmp_path, monkeypatch):
    lite_dir = tmp_path / "LabFlowLite"
    data = lite_dir / "data"
    _pid_file(data, 4242)  # a linha 2 aponta para o data da Lite
    fora = tmp_path / "outro-programa" / "postgres.exe"
    chamadas = _sem_pg_ctl(monkeypatch, {4242: fora})
    assert lite.postgres_vivo_do_data(data) is None
    assert lite.parar_postgres_esquecido(data, "x") is True and chamadas == []
    pg = lite.Postgres(lite_dir)
    try:
        pg.liberar_data()
    except RuntimeError as erro:
        assert "ocupado" in str(erro) and "Reinicie" in str(erro)
    else:
        raise AssertionError("devia recusar com mensagem clara")
    assert chamadas == []


def test_inicio_que_nao_bate_nao_e_parado(tmp_path, monkeypatch):
    data = tmp_path / "data"
    _pid_file(data, 4242)
    chamadas = _sem_pg_ctl(monkeypatch, {4242: tmp_path / "postgres.exe"})
    monkeypatch.setattr(lite, "inicio_do_processo", lambda pid: INICIO + 3600)  # PID reaproveitado, bem depois
    assert lite.postgres_vivo_do_data(data) is None
    assert lite.parar_postgres_esquecido(data, "x") is True and chamadas == []
    monkeypatch.setattr(lite, "inicio_do_processo", lambda pid: None)
    assert lite.postgres_vivo_do_data(data) is None


def test_pg_ctl_so_de_dentro_da_pasta_da_lite(tmp_path, monkeypatch):
    data = tmp_path / "data"
    _pid_file(data, 4242)
    chamadas = _sem_pg_ctl(monkeypatch, {4242: tmp_path / "postgres.exe"})
    (tmp_path / ("pg_ctl" + lite.EXE)).write_text("")
    assert lite.parar_postgres_esquecido(data, "pg_ctl-do-pacote") is True
    assert chamadas[0][0] == str(tmp_path / ("pg_ctl" + lite.EXE))
    (tmp_path / ("pg_ctl" + lite.EXE)).unlink()
    _pid_file(data, 4242)
    chamadas2 = _sem_pg_ctl(monkeypatch, {4242: tmp_path / "postgres.exe"})
    assert lite.parar_postgres_esquecido(data, "pg_ctl-do-pacote") is True
    assert chamadas2[0][0] == "pg_ctl-do-pacote"
