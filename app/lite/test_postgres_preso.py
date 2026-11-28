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


def test_postgres_duvidoso_conta_como_em_uso_e_a_pasta_antiga_fica(tmp_path, monkeypatch):
    local = tmp_path / "LabFlowLite"
    antigo = local / "programa"
    atual = local / "p-novo1"
    for p in (antigo, atual):
        p.mkdir(parents=True)
    (local / "data").mkdir()
    (local / "data" / "postmaster.pid").write_text("4242\n", encoding="utf-8")  # sem linha 2: não dá para provar
    chamadas = _sem_pg_ctl(monkeypatch, {4242: tmp_path / "fora" / "postgres.exe"})
    lite.limpar_programas_antigos(local, atual)
    assert antigo.exists() and chamadas == []


# ---------------------------------------------------------------- API filha: morre junto, órfã, religar ---------------
import os  # noqa: E402
import time  # noqa: E402

import pytest  # noqa: E402


def test_api_sai_sozinha_quando_o_pai_some(tmp_path):
    """O filho roda o VIGIA_DO_PAI (com um 'uvicorn' falso que só dorme); matando o pai (criado aqui), ele precisa sair."""
    (tmp_path / "uvicorn").mkdir()
    (tmp_path / "uvicorn" / "__main__.py").write_text("import time\ntime.sleep(120)\n", encoding="utf-8")
    (tmp_path / "uvicorn" / "__init__.py").write_text("", encoding="utf-8")
    pai = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"])
    env = dict(os.environ, LABFLOW_PAI_PID=str(pai.pid), PYTHONPATH=str(tmp_path))
    filho = subprocess.Popen([sys.executable, "-c", lite.VIGIA_DO_PAI, "x:app"], env=env)
    try:
        time.sleep(2)
        assert filho.poll() is None  # com o pai vivo, segue rodando
        pai.kill()
        pai.wait()
        assert filho.wait(timeout=15) == 0
    finally:
        for p in (pai, filho):
            if p.poll() is None:
                p.kill()


@pytest.mark.skipif(os.name != "nt", reason="Job Object é do Windows")
def test_job_object_aceita_o_filho():
    filho = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        assert lite.prender_ao_job(filho) is True
    finally:
        filho.kill()


def test_api_orfa_da_propria_instalacao_e_encerrada_e_de_outro_dono_nao(tmp_path, monkeypatch):
    local = tmp_path / "LabFlowLite"
    mortos, no_ar = [], {8000: 111, 8001: 222}
    monkeypatch.setattr(lite, "conecta", lambda h, porta, espera=3.0: porta in no_ar)
    monkeypatch.setattr(lite, "pid_que_escuta", lambda porta: no_ar.get(porta))
    imagens = {111: local / "p-abc1234" / "python" / "python.exe", 222: tmp_path / "Outro" / "python.exe"}
    monkeypatch.setattr(lite, "imagem_do_processo", lambda pid: imagens.get(pid))

    def matar(pid):
        mortos.append(pid)
        for porta, p in list(no_ar.items()):
            if p == pid:
                del no_ar[porta]

    monkeypatch.setattr(lite, "matar_processo", matar)
    monkeypatch.setattr(lite.time, "sleep", lambda *_: None)
    de_outros = lite.encerrar_api_orfa(local, 8000)
    assert mortos == [111]  # só a da própria instalação
    assert de_outros == [8001]  # a outra não foi tocada


def _servidor_falso(tmp_path, monkeypatch, tempo):
    srv = lite.Servidor.__new__(lite.Servidor)
    srv.local = tmp_path
    srv.quedas = []
    srv.porta_api = 8000
    srv.api = subprocess.CompletedProcess([], 3)
    srv.api.returncode = 3
    subidas = []
    srv.subir_api = lambda porta=None: subidas.append(porta)
    srv.dados = type("D", (), {"servidor": tmp_path / "s.json", "escrever_json": lambda *a: None})()
    srv.conteudo_servidor = lambda: {}
    monkeypatch.setattr(lite.time, "monotonic", lambda: tempo[0])
    monkeypatch.setattr(lite, "LOCAL", tmp_path)
    return srv, subidas


def test_api_que_cai_religa_ate_3_vezes_em_10_minutos_e_registra_o_codigo(tmp_path, monkeypatch):
    tempo = [1000.0]
    srv, subidas = _servidor_falso(tmp_path, monkeypatch, tempo)
    assert [srv.religar_api() for _ in range(4)] == [True, True, True, False]
    assert subidas == [8000, 8000, 8000]  # mantém a mesma porta
    texto = (tmp_path / "lite.log").read_text(encoding="utf-8")
    assert "código de saída 3" in texto and "tentativa 3 de 3" in texto and "desistindo" in texto
    tempo[0] += 601  # passou a janela de 10 minutos: volta a religar
    assert srv.religar_api() is True


def test_falha_ao_religar_conta_como_tentativa(tmp_path, monkeypatch):
    srv, subidas = _servidor_falso(tmp_path, monkeypatch, [5.0])

    def quebra(porta=None):
        raise RuntimeError("O app não subiu")

    srv.subir_api = quebra
    assert [srv.religar_api() for _ in range(4)] == [True, True, True, False]
    assert "Não consegui religar o app" in (tmp_path / "lite.log").read_text(encoding="utf-8")
