"""LabFlow Lite: roda o app inteiro (API, telas e PostgreSQL) a partir de uma pasta de rede, sem Docker nem servidor.

Como funciona (spec: docs/specs/lims/12-versao-lite.md):
- A pasta de rede (G:) guarda só os DADOS: labflow.dump (cópia do banco), backups, o aviso de quem é o servidor.
- O PC que abre primeiro vira o SERVIDOR: liga um PostgreSQL local (pasta do próprio PC), restaura o banco do G:, liga o app
  e grava o endereço em dados/servidor.json. Os outros PCs só abrem o navegador nesse endereço (modo CLIENTE).
- A cada minuto (se algo mudou) e ao fechar, o servidor grava uma cópia do banco no G:. Backup diário, 30 dias.
- Só biblioteca padrão do Python (as dependências do app ficam no pacote).

Uso (o .bat chama): python lite.py --raiz <pasta do G:> [--sem-navegador] [--porta 8000] [--local <pasta>]
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import getpass
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

EH_WINDOWS = os.name == "nt"
EXE = ".exe" if EH_WINDOWS else ""
SEM_JANELA = 0x08000000 if EH_WINDOWS else 0  # CREATE_NO_WINDOW: psql, pg_dump etc. sem piscar janela preta
BATIMENTO_S = 10  # o servidor "diz que está vivo" a cada 10 s
VENCE_S = 45  # sem sinal há 45 s = servidor caiu
SALVAR_S = 60  # cópia no G: a cada minuto, se mudou
SALVAR_FORCADO_S = 600  # e mesmo sem mudança a cada 10 min
PORTA_PADRAO = 8000
MANTER_BACKUPS = 30
SUPER = "lfadmin"
BANCO = "labflow"
ADMIN_TELEFONE = "5500000000001"  # marcador: o Admin troca depois em Admin > Pessoas


LEIA_ME_MARCA = """MARCA DESTA INSTALAÇÃO (opcional)
Coloque aqui os arquivos e reabra o LabFlow (feche no PC servidor e abra de novo):

  marca.json   o nome e as cores, por exemplo:
               {"nome": "Laboratório de Microbiologia", "cor_principal": "#1f3bb3", "cor_secundaria": "#1e283d"}
               cor principal = botões, links e abas; cor secundária = menu lateral e topo (formato #rrggbb)
  logo.png     a logo (PNG, até 2 MB; aparece no menu e na tela de entrar)
  estilo.css   ajustes de visual (CSS, até 200 KB), aplicados por último

Tudo é opcional: sem estes arquivos fica o visual do LabFlow. Arquivo com erro é ignorado (o resto vale).
Esta pasta fica em "dados": a troca da pasta "instalacao" numa atualização não mexe nela.
"""


def log(msg: str, segredo: bool = False) -> None:
    """Na janela (quando há) e no lite.log. `segredo` (a senha provisória) só vai para a tela, nunca para o arquivo."""
    print(msg, flush=True)
    with contextlib.suppress(Exception):
        if LOCAL is not None and not segredo:
            with open(LOCAL / "lite.log", "a", encoding="utf-8") as f:
                f.write(f"{dt.datetime.now().isoformat(timespec='seconds')} {msg}\n")


LOCAL: Path | None = None
OCULTO = False  # sem a janela preta (da segunda vez em diante em cada PC): avisos em janelinha e o ícone no canto
MARCADOR = "ja-abriu.txt"  # no LOCAL: este PC já abriu o LabFlow uma vez (o .bat abre oculto daí em diante)


def avisar(titulo: str, texto: str, erro: bool = False, esperar: bool = False) -> None:
    """Janelinha do Windows com o aviso, quando o LabFlow roda oculto (na janela preta, o log já mostra)."""
    if not (OCULTO and EH_WINDOWS):
        return
    import ctypes

    estilo = (0x10 if erro else 0x40) | 0x40000 | 0x10000  # ícone de erro/informação, por cima de tudo, em primeiro plano
    mostrar = lambda: ctypes.windll.user32.MessageBoxW(0, texto, titulo, estilo)  # noqa: E731
    mostrar() if esperar else threading.Thread(target=mostrar, daemon=True).start()


def confirmar(titulo: str, texto: str) -> bool:
    if not EH_WINDOWS:
        return True
    import ctypes

    return ctypes.windll.user32.MessageBoxW(0, texto, titulo, 0x4 | 0x20 | 0x40000 | 0x10000) == 6  # Sim/Não; 6 = Sim
INST = Path(__file__).resolve().parents[1]  # <programa>/lite/lite.py -> <programa>
PROGRAMA_VERSAO = (INST / "VERSAO.txt").read_text(encoding="utf-8").strip() if (INST / "VERSAO.txt").exists() else "dev"


# ---------------------------------------------------------------- arquivos do G: -------------------------------------
class Dados:
    """Tudo o que fica na pasta de rede."""

    def __init__(self, raiz: Path) -> None:
        self.dir = raiz / "dados"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.dump = self.dir / "labflow.dump"
        self.novo = self.dir / "labflow.dump.novo"
        self.anterior = self.dir / "labflow.anterior.dump"
        self.info = self.dir / "labflow.info.json"
        self.servidor = self.dir / "servidor.json"
        self.backup = self.dir / "backup"
        self.recuperacao = self.dir / "recuperacao"

    def relogio(self) -> float:
        """Hora do próprio servidor de arquivos (evita diferença de relógio entre os PCs): a data do arquivo que acabo de gravar."""
        p = self.dir / ".relogio"
        try:
            p.write_text(str(time.time()))
            return p.stat().st_mtime
        except OSError:
            return time.time()

    def ler_json(self, caminho: Path) -> dict | None:
        for _ in range(4):
            try:
                return json.loads(caminho.read_text(encoding="utf-8"))
            except FileNotFoundError:
                return None
            except (json.JSONDecodeError, PermissionError, OSError):
                time.sleep(0.3)
        return None

    def escrever_json(self, caminho: Path, dados: dict) -> None:
        for _ in range(5):
            try:
                caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
                return
            except OSError:
                time.sleep(0.3)

    def idade_do_servidor(self) -> float | None:
        try:
            return self.relogio() - self.servidor.stat().st_mtime
        except OSError:
            return None


# ---------------------------------------------------------------- rede ----------------------------------------------
def ips_deste_pc() -> list[str]:
    achados: list[str] = []
    with contextlib.suppress(Exception):
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = item[4][0]
            if not ip.startswith("127.") and ip not in achados:
                achados.append(ip)
    with contextlib.suppress(Exception):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        if not ip.startswith("127.") and ip not in achados:
            achados.insert(0, ip)
    return achados


def porta_livre(inicio: int, todas_as_interfaces: bool) -> int:
    for porta in range(inicio, inicio + 50):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if not EH_WINDOWS:  # como o uvicorn faz; no Windows essa opção deixaria duas escutando na mesma porta
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0" if todas_as_interfaces else "127.0.0.1", porta))
            return porta
        except OSError:
            continue
        finally:
            s.close()
    raise RuntimeError("Nenhuma porta livre perto da 8000.")


def conecta(host: str, porta: int, espera: float = 3.0) -> bool:
    try:
        with socket.create_connection((host, porta), timeout=espera):
            return True
    except OSError:
        return False


def api_viva(porta: int) -> bool:
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{porta}/saude", timeout=3).status == 200
    except Exception:
        return False


# ---------------------------------------------------------------- PostgreSQL local -----------------------------------
class Postgres:
    def __init__(self, local: Path) -> None:
        pasta = os.environ.get("LABFLOW_PG_BIN") or str(INST / "postgres" / "bin")
        self.bin = Path(pasta)
        self.data = local / "data"
        self.local = local
        self.porta = 0
        self.senha_super = ""
        self.senha_web = ""

    def exe(self, nome: str) -> str:
        return str(self.bin / (nome + EXE))

    def env(self) -> dict:
        e = dict(os.environ)
        e.update(PGPASSWORD=self.senha_super, PGHOST="127.0.0.1", PGPORT=str(self.porta), PGUSER=SUPER, PGCLIENTENCODING="UTF8")
        return e

    def run(self, nome: str, *args: str, check: bool = True, banco: str | None = None) -> subprocess.CompletedProcess:
        cmd = [self.exe(nome), *args]
        r = subprocess.run(cmd, env=self.env(), capture_output=True, text=True, encoding="utf-8", errors="replace",
                           stdin=subprocess.DEVNULL, creationflags=SEM_JANELA)
        if check and r.returncode != 0:
            raise RuntimeError(f"{nome} falhou: {(r.stderr or r.stdout).strip()[-800:]}")
        return r

    def sql(self, texto: str, banco: str = BANCO) -> str:
        return self.run("psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", banco, "-c", texto).stdout.strip()

    def arquivo(self, caminho: Path, banco: str = BANCO) -> None:
        self.run("psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", banco, "-f", str(caminho))

    def iniciado(self) -> bool:
        return self.run("pg_ctl", "-D", str(self.data), "status", check=False).returncode == 0

    def iniciar(self) -> None:
        conf = self.data / "lite.conf"
        linhas = [
            f"port = {self.porta}",
            "listen_addresses = '127.0.0.1'",
            "timezone = 'America/Sao_Paulo'",
            "max_connections = 60",
            "shared_buffers = 128MB",
            "log_min_messages = warning",
        ]
        if not EH_WINDOWS:
            linhas.append(f"unix_socket_directories = '{self.local}'")
        conf.write_text("\n".join(linhas) + "\n", encoding="utf-8")
        principal = self.data / "postgresql.conf"
        if "lite.conf" not in principal.read_text(encoding="utf-8", errors="replace"):
            with open(principal, "a", encoding="utf-8") as f:
                f.write("\ninclude_if_exists = 'lite.conf'\n")
        # sem capturar a saída: no Windows o PostgreSQL herda o "cano" e o Python esperaria para sempre (a saída vai pro log)
        r = subprocess.run(
            [self.exe("pg_ctl"), "-D", str(self.data), "-l", str(self.local / "postgres.log"), "-w", "-t", "90", "start"],
            env=self.env(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=0x08000000 if EH_WINDOWS else 0,  # CREATE_NO_WINDOW: o PostgreSQL não recebe o "fechar" da janela
        )
        if r.returncode != 0:
            raise RuntimeError(f"O PostgreSQL não ligou (código {r.returncode}). Veja postgres.log em {self.local}")

    def parar(self) -> None:
        with contextlib.suppress(Exception):
            self.run("pg_ctl", "-D", str(self.data), "-m", "fast", "-w", "-t", "60", "stop", check=False)

    def criar_cluster(self) -> None:
        if self.data.exists():
            shutil.rmtree(self.data, ignore_errors=True)
        pw = self.local / "pw.tmp"
        pw.write_text(self.senha_super, encoding="utf-8")
        base = [self.exe("initdb"), "-D", str(self.data), "-U", SUPER, "-E", "UTF8", "-A", "scram-sha-256", f"--pwfile={pw}"]
        try:
            for extra in (["--locale=C", "--locale-provider=icu", "--icu-locale=pt-BR"], ["--locale=C"]):
                r = subprocess.run(base + extra, capture_output=True, text=True, encoding="utf-8", errors="replace",
                                   stdin=subprocess.DEVNULL, creationflags=SEM_JANELA)
                if r.returncode == 0:
                    return
                shutil.rmtree(self.data, ignore_errors=True)
            raise RuntimeError(f"initdb falhou (código {r.returncode:#x}): {(r.stderr or r.stdout).strip()[-800:]}")
        finally:
            with contextlib.suppress(OSError):
                pw.unlink()

    def preparar_papeis(self) -> None:
        """Papéis que as migrations do bot e do app esperam (como no servidor) e a senha do usuário de rede do app."""
        self.sql(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labflow_app') THEN CREATE ROLE labflow_app NOLOGIN; END IF;
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labflow_leitura') THEN CREATE ROLE labflow_leitura NOLOGIN; END IF;
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labflow_app_web') THEN CREATE ROLE labflow_app_web NOLOGIN; END IF;
            END $$;
            """,
            banco="postgres",
        )

    def fechar_acessos(self) -> None:
        self.sql(f"REVOKE ALL ON DATABASE {BANCO} FROM PUBLIC", banco="postgres")
        self.sql(f"GRANT CONNECT ON DATABASE {BANCO} TO labflow_app_web", banco="postgres")
        self.sql(f"ALTER ROLE labflow_app_web LOGIN PASSWORD '{self.senha_web}'", banco="postgres")

    def url_web(self) -> str:
        return f"postgresql://labflow_app_web:{self.senha_web}@127.0.0.1:{self.porta}/{BANCO}"

    def url_super(self) -> str:
        return f"postgresql://{SUPER}:{self.senha_super}@127.0.0.1:{self.porta}/{BANCO}"

    def dump_valido(self, caminho: Path) -> bool:
        return caminho.exists() and caminho.stat().st_size > 0 and self.run("pg_restore", "-l", str(caminho), check=False).returncode == 0

    def contador_de_escritas(self) -> int:
        valor = self.sql(
            f"SELECT coalesce(sum(tup_inserted + tup_updated + tup_deleted), 0)::bigint FROM pg_stat_database WHERE datname = '{BANCO}'",
            banco="postgres",
        )
        return int(valor or 0)


# ---------------------------------------------------------------- o servidor -----------------------------------------
class Servidor:
    def __init__(self, args: argparse.Namespace, dados: Dados, local: Path) -> None:
        self.args = args
        self.dados = dados
        self.local = local
        self.pg = Postgres(local)
        self.token = secrets.token_hex(8)
        self.api: subprocess.Popen | None = None
        self.porta_api = 0
        self.encerrando = threading.Lock()
        self.encerrado = False
        self.parar = threading.Event()
        self.ultimo_contador = -1
        self.ultimo_salvo = 0.0
        self.salvando = threading.Lock()
        self.estado = self._ler_estado()
        self.mudou_desde_inicio = False
        self.falha_avisada = False
        self.icone = None

    # --- estado local (senhas e marcadores; fica só no PC do servidor)
    def _ler_estado(self) -> dict:
        try:
            return json.loads((self.local / "estado.json").read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _gravar_estado(self, **novos) -> None:
        self.estado.update(novos)
        (self.local / "estado.json").write_text(json.dumps(self.estado, indent=1), encoding="utf-8")

    # --- escolha do dump no G:
    def dump_do_g(self) -> Path | None:
        for c in (self.dados.dump, self.dados.novo, self.dados.anterior):
            if self.pg.dump_valido(c):
                return c
        return None

    def subir_banco(self) -> bool:
        """Liga o PostgreSQL local com os dados certos. Devolve True se o banco acabou de ser criado do zero."""
        pg = self.pg
        pg.senha_super = self.estado.get("senha_super") or secrets.token_urlsafe(18)
        pg.senha_web = self.estado.get("senha_web") or secrets.token_urlsafe(18)
        pg.porta = porta_livre(54329, False)
        info = self.dados.ler_json(self.dados.info)
        tem_local = (pg.data / "PG_VERSION").exists()
        grav = self.estado.get("ultimo_gravado_em")
        fechou_limpo = self.estado.get("limpo", True)
        reaproveitar = tem_local and (
            (info is not None and grav == info.get("gravado_em")) or (info is None and self.estado.get("origem") == "zero")
        )
        self._gravar_estado(senha_super=pg.senha_super, senha_web=pg.senha_web, limpo=False)
        if reaproveitar:
            log("Banco deste PC está em dia com o G:. Ligando o PostgreSQL...")
            if not fechou_limpo:
                log("A última sessão não fechou direito: o PostgreSQL local vai se recuperar sozinho (nada se perde).")
            pg.iniciar()
            return False
        if tem_local and not fechou_limpo:
            self._guardar_local_antigo()
        log("Preparando o banco neste PC (primeira vez ou troca de servidor)...")
        pg.criar_cluster()
        pg.iniciar()
        pg.preparar_papeis()
        pg.sql(f"CREATE DATABASE {BANCO}", banco="postgres")
        dump = self.dump_do_g()
        if dump is not None:
            log(f"Restaurando os dados do G: ({dump.name})...")
            pg.run("pg_restore", "-d", BANCO, "--clean", "--if-exists", str(dump))
            self._gravar_estado(origem="g")
            return False
        if info is not None:
            raise RuntimeError("Existe um registro de dados no G: mas nenhuma cópia válida. Procure em dados\\backup e chame o suporte.")
        self._gravar_estado(origem="zero", ultimo_gravado_em=None)
        return True

    def _guardar_local_antigo(self) -> None:
        """Outra sessão gravou no G: depois deste PC cair: guarda o que sobrou aqui, só por segurança."""
        try:
            self.pg.porta = porta_livre(54329, False)
            self.pg.iniciar()
            self.dados.recuperacao.mkdir(parents=True, exist_ok=True)
            destino = self.dados.recuperacao / f"local-{socket.gethostname()}-{dt.datetime.now():%Y%m%d-%H%M%S}.dump"
            self.pg.run("pg_dump", "-Fc", "-f", str(destino), "-d", BANCO)
            log(f"Guardei uma cópia do banco antigo deste PC em {destino.name}.")
        except Exception as erro:  # nunca impede de abrir
            log(f"Não consegui guardar o banco antigo deste PC ({erro}).")
        finally:
            self.pg.parar()

    # --- migrations
    def aplicar_migracoes(self, do_zero: bool) -> None:
        pg = self.pg
        pg.sql("CREATE TABLE IF NOT EXISTS public.lite_migracoes (arquivo text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())")
        feitas = set(pg.sql("SELECT arquivo FROM public.lite_migracoes").splitlines())
        pasta = INST / "migrations"
        pendentes = [f for f in sorted(pasta.glob("[0-9][0-9][0-9]_*.sql")) if not f.name.endswith("_desfazer.sql") and f.name not in feitas]
        if not pendentes:
            return
        if not do_zero:
            log(f"Atualização do programa: {len(pendentes)} mudança(s) no banco. Fazendo uma cópia de segurança antes...")
            self.dados.backup.mkdir(parents=True, exist_ok=True)
            seguro = self.dados.backup / f"antes-de-atualizar-{dt.datetime.now():%Y%m%d-%H%M%S}.dump"
            pg.run("pg_dump", "-Fc", "-f", str(seguro), "-d", BANCO)
        for f in pendentes:
            pg.arquivo(f)
            pg.sql(f"INSERT INTO public.lite_migracoes (arquivo) VALUES ('{f.name}')")
        log(f"Banco atualizado ({len(pendentes)} migration(s)).")

    # --- primeiro Admin
    def primeiro_acesso(self, redefinir: bool) -> None:
        if str(INST / "app") not in sys.path:
            sys.path.insert(0, str(INST / "app"))
        import psycopg

        from labflow_api.primeiro_admin import preparar_admin

        with psycopg.connect(self.pg.url_super()) as con:
            tem = con.execute("SELECT count(*) FROM app.credenciais").fetchone()[0]
            if tem and not redefinir:
                return
            if tem:
                linha = con.execute(
                    "SELECT u.id, c.usuario FROM app.credenciais c JOIN usuarios u ON u.id = c.usuario_id "
                    "WHERE u.cargo = 'Admin' ORDER BY u.id LIMIT 1"
                ).fetchone()
                if linha is None:
                    log("Não achei nenhum Admin para redefinir.")
                    return
                uid, usuario = linha
            else:
                uid = con.execute(
                    "INSERT INTO usuarios (telefone, nome, cargo) VALUES (%s, 'Administrador', 'Admin') RETURNING id",
                    (ADMIN_TELEFONE,),
                ).fetchone()[0]
                usuario = "admin"
            senha = preparar_admin(con, uid, usuario)
            con.commit()
        log("")
        log("=" * 60)
        log("PRIMEIRO ACESSO" if not tem else "SENHA REDEFINIDA")
        log(f"  Usuário: {usuario}")
        log(f"  Senha provisória (vale 24 horas): {senha}", segredo=True)
        with contextlib.suppress(Exception):
            with open(self.local / "lite.log", "a", encoding="utf-8") as f:
                f.write(f"{dt.datetime.now().isoformat(timespec='seconds')}   (senha provisória mostrada só na tela)\n")
        log("  No primeiro login o LabFlow pede uma senha nova.")
        log("  Anote agora: esta senha não aparece de novo.")
        log("=" * 60)
        log("")
        avisar("LabFlow: primeiro acesso" if not tem else "LabFlow: senha redefinida",
               f"Usuário: {usuario}\nSenha provisória (vale 24 horas): {senha}\n\n"
               "No primeiro login o LabFlow pede uma senha nova. Anote agora: esta senha não aparece de novo.")
        if os.environ.get("LABFLOW_LITE_TESTE"):
            print(f"LITE_ADMIN={usuario}:{senha}", flush=True)

    # --- marca da instalação (dados\marca: nome, logo e cores; fica no G:, então passa intacta pelas atualizações)
    def preparar_marca(self) -> Path:
        origem = self.dados.dir / "marca"
        destino = self.local / "marca"
        if not origem.exists():
            with contextlib.suppress(OSError):
                origem.mkdir(parents=True)
                (origem / "LEIA-ME.txt").write_text(LEIA_ME_MARCA, encoding="utf-8-sig")
        shutil.rmtree(destino, ignore_errors=True)
        destino.mkdir(parents=True, exist_ok=True)
        achados = []
        for nome in ("marca.json", "logo.png", "estilo.css"):
            with contextlib.suppress(OSError):
                if (origem / nome).is_file():
                    shutil.copyfile(origem / nome, destino / nome)
                    achados.append(nome)
        if achados:
            log(f"Marca da instalação: {', '.join(achados)}.")
        return destino

    # --- API
    def subir_api(self) -> None:
        self.porta_api = porta_livre(self.args.porta, True)
        env = dict(os.environ)
        env.update(
            LABFLOW_DB_URL=self.pg.url_web(),
            LABFLOW_WEB_DIR=str(INST / "web"),
            LABFLOW_MARCA_DIR=str(self.preparar_marca()),
            LABFLOW_COOKIE_SEGURO="0",  # a rede interna é HTTP (decisão da Lite)
            LABFLOW_DEMONSTRACAO="0",
            PYTHONPATH=str(INST / "app"),
            PYTHONUNBUFFERED="1",
            PYTHONUTF8="1",
            TZ="America/Sao_Paulo",
        )
        saida = open(self.local / "api.log", "a", encoding="utf-8")
        flags = 0x08000000 if EH_WINDOWS else 0  # CREATE_NO_WINDOW
        self.api = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "labflow_api.main:app", "--host", "0.0.0.0", "--port", str(self.porta_api)],
            cwd=str(INST / "app"),
            env=env,
            stdout=saida,
            stderr=subprocess.STDOUT,
            creationflags=flags,
        )
        for _ in range(60):
            if self.api.poll() is not None:
                raise RuntimeError("O app não subiu. Veja o arquivo api.log em " + str(self.local))
            if api_viva(self.porta_api):
                return
            time.sleep(1)
        raise RuntimeError("O app demorou demais para subir.")

    # --- aviso "servidor" no G:
    def conteudo_servidor(self) -> dict:
        return {
            "dono": self.token,
            "pc": socket.gethostname(),
            "ips": ips_deste_pc(),
            "porta": self.porta_api,
            "usuario_windows": getpass.getuser(),
            "inicio": dt.datetime.now().isoformat(timespec="seconds"),
            "versao": PROGRAMA_VERSAO,
        }

    def batimento(self) -> None:
        while not self.parar.wait(BATIMENTO_S):
            atual = self.dados.ler_json(self.dados.servidor)
            if atual is not None and atual.get("dono") != self.token:
                log("Outro PC assumiu o servidor. Encerrando este.")
                avisar("LabFlow", "Outro PC assumiu o LabFlow. Este PC deixou de ser o servidor; abra o LabFlow de novo para entrar.")
                self.parar.set()
                return
            self.dados.escrever_json(self.dados.servidor, self.conteudo_servidor())

    # --- cópia no G:
    def salvar(self, forcar: bool = False) -> bool:
        with self.salvando:
            try:
                contador = self.pg.contador_de_escritas()
                agora = time.time()
                mudou = contador != self.ultimo_contador
                if not forcar and not mudou and agora - self.ultimo_salvo < SALVAR_FORCADO_S:
                    return True
                tmp = self.local / "saida.dump"
                self.pg.run("pg_dump", "-Fc", "-f", str(tmp), "-d", BANCO)
                shutil.copyfile(tmp, self.dados.novo)
                if self.dados.dump.exists():
                    os.replace(self.dados.dump, self.dados.anterior)
                os.replace(self.dados.novo, self.dados.dump)
                gravado_em = dt.datetime.now().isoformat(timespec="seconds") + f"-{secrets.token_hex(3)}"
                self.dados.escrever_json(
                    self.dados.info, {"gravado_em": gravado_em, "por": socket.gethostname(), "versao": PROGRAMA_VERSAO}
                )
                self._gravar_estado(ultimo_gravado_em=gravado_em)
                self.ultimo_contador = contador
                self.ultimo_salvo = agora
                self.backup_do_dia()
                self.falha_avisada = False
                return True
            except Exception as erro:
                log(f"ATENÇÃO: não consegui gravar no G: ({erro}). Tento de novo em instantes; o app continua funcionando.")
                if not self.falha_avisada:  # uma janelinha por sequência de falhas, não a cada minuto
                    self.falha_avisada = True
                    avisar("LabFlow: não consegui gravar no G:", f"{erro}\n\nO LabFlow continua funcionando e tenta de novo a cada minuto. "
                           "Confira o acesso à pasta de rede.", erro=True)
                return False

    def backup_do_dia(self) -> None:
        self.dados.backup.mkdir(parents=True, exist_ok=True)
        hoje = self.dados.backup / f"labflow-{dt.date.today():%Y-%m-%d}.dump"
        if not hoje.exists():
            shutil.copyfile(self.dados.dump, hoje)
        antigos = sorted(self.dados.backup.glob("labflow-*.dump"))
        for velho in antigos[:-MANTER_BACKUPS]:
            with contextlib.suppress(OSError):
                velho.unlink()

    def laco_de_salvar(self) -> None:
        while not self.parar.wait(SALVAR_S):
            self.salvar()

    # --- encerrar
    def encerrar(self) -> None:
        with self.encerrando:
            if self.encerrado:
                return
            self.encerrado = True
        self.parar.set()
        log("Encerrando: gravando tudo no G:...")
        if self.api and self.api.poll() is None:
            with contextlib.suppress(Exception):
                self.api.terminate()
                self.api.wait(timeout=15)
        salvou = self.salvar(forcar=True) if self.pg.iniciado() else False
        self.pg.parar()
        atual = self.dados.ler_json(self.dados.servidor)
        if atual is not None and atual.get("dono") == self.token:
            with contextlib.suppress(OSError):
                self.dados.servidor.unlink()
        self._gravar_estado(limpo=bool(salvou))
        log("Tudo gravado. Pode fechar." if salvou else "ATENÇÃO: o último salvamento no G: falhou; o banco deste PC foi mantido.")

    # --- ciclo completo
    def rodar(self) -> int:
        dados = self.dados
        # reserva o papel de servidor
        try:
            fd = os.open(dados.servidor, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
        except FileExistsError:
            idade = dados.idade_do_servidor()
            anterior = dados.ler_json(dados.servidor) or {}
            meu_e_morto = not anterior.get("iniciando") and anterior.get("pc") == socket.gethostname() and not conecta("127.0.0.1", int(anterior.get("porta") or 0) or 1, 1)
            if idade is not None and idade < VENCE_S and not meu_e_morto:
                return -1  # já existe servidor vivo: o chamador vira cliente
            log("O servidor anterior não respondeu mais (caiu ou foi desligado). Este PC assume.")
        dados.escrever_json(dados.servidor, {"dono": self.token, "pc": socket.gethostname(), "iniciando": True})
        time.sleep(2)
        atual = dados.ler_json(dados.servidor)
        if atual is None or atual.get("dono") != self.token:
            return -1
        try:
            do_zero = self.subir_banco()
            self.aplicar_migracoes(do_zero)
            self.pg.preparar_papeis()
            self.pg.fechar_acessos()
            self.primeiro_acesso(self.args.redefinir_admin)
            self.subir_api()
        except Exception as erro:
            log(f"NÃO FOI POSSÍVEL ABRIR: {erro}")
            avisar("LabFlow: não foi possível abrir", f"{erro}\n\nDetalhes em {self.local / 'lite.log'}", erro=True, esperar=True)
            self.parar.set()
            with contextlib.suppress(Exception):
                self.pg.parar()
            with contextlib.suppress(OSError):
                dados.servidor.unlink()
            return 1
        dados.escrever_json(dados.servidor, self.conteudo_servidor())
        self.salvar(forcar=True)
        threading.Thread(target=self.batimento, daemon=True).start()
        threading.Thread(target=self.laco_de_salvar, daemon=True).start()
        endereco = f"http://127.0.0.1:{self.porta_api}/app/"
        outros = ", ".join(f"http://{ip}:{self.porta_api}/app/" for ip in ips_deste_pc()[:2])
        log("")
        log("=" * 60)
        log("LabFlow no ar neste PC (SERVIDOR).")
        log(f"  Aqui:  {endereco}")
        log(f"  Outros PCs do laboratório: abram o 'Abrir LabFlow' (ou {outros})")
        if OCULTO:
            log("  Rodando oculto: o ícone do LabFlow fica perto do relógio (Abrir, Endereço, Encerrar).")
        else:
            log("  Deixe esta janela ABERTA. Para encerrar: tecle ENTER aqui.")
            log("  Da próxima vez neste PC, o LabFlow abre oculto, com o ícone perto do relógio.")
        log("=" * 60)
        marcar_que_abriu()
        if OCULTO:
            self.icone = iniciar_bandeja(self, endereco, outros)
        if not self.args.sem_navegador:
            abrir_janela(endereco)
        self._esperar_fim()
        self.encerrar()
        if self.icone is not None:
            with contextlib.suppress(Exception):
                self.icone.stop()
        return 0

    def _esperar_fim(self) -> None:
        def ler_enter() -> None:
            try:
                while not self.parar.is_set():
                    linha = sys.stdin.readline()
                    if linha == "":
                        return
                    log("Encerrar o LabFlow? Os outros PCs vão parar de funcionar. Digite S e Enter para confirmar.")
                    if sys.stdin.readline().strip().lower() in ("s", "sim", "y"):
                        self.parar.set()
                        return
            except Exception:
                return

        if sys.stdin is not None and sys.stdin.isatty():
            threading.Thread(target=ler_enter, daemon=True).start()
        sinal = self.local / "parar.txt"
        sinal.unlink(missing_ok=True)
        while not self.parar.is_set():
            if sinal.exists():
                sinal.unlink(missing_ok=True)
                break
            if self.api is not None and self.api.poll() is not None:
                log("O app parou sozinho. Veja o api.log.")
                break
            time.sleep(1)


# ---------------------------------------------------------------- modo cliente -------------------------------------
def modo_cliente(dados: Dados, args: argparse.Namespace) -> int:
    info = dados.ler_json(dados.servidor) or {}
    for _ in range(60):  # o servidor ainda está ligando (alguém abriu segundos antes): espera até 2 minutos
        if not info.get("iniciando"):
            break
        if _ == 0:
            log(f"O LabFlow está sendo aberto no PC {info.get('pc')}. Aguardando...")
        time.sleep(2)
        info = dados.ler_json(dados.servidor) or {}
    porta = int(info.get("porta") or PORTA_PADRAO)
    candidatos = [socket.gethostname() if info.get("pc") == socket.gethostname() else info.get("pc"), *info.get("ips", [])]
    for host in [h for h in candidatos if h]:
        if conecta(host, porta):
            endereco = f"http://{host}:{porta}/app/"
            log(f"O LabFlow já está aberto no PC {info.get('pc')}. Abrindo {endereco}")
            marcar_que_abriu()
            if not args.sem_navegador:
                abrir_janela(endereco)
            return 0
    log("")
    log(f"O LabFlow está aberto no PC {info.get('pc')} (desde {info.get('inicio')}), mas este PC não conseguiu falar com ele.")
    log(f"Provável causa: o firewall/rede bloqueia a porta {porta}. Peça à TI para liberar a porta TCP {porta} de entrada")
    log("no PC servidor, para os PCs do laboratório. Enquanto isso, só um PC usa o LabFlow por vez:")
    log("peça para fechar lá (tecla ENTER na janela do LabFlow) e abra aqui.")
    log("Se o PC servidor caiu ou foi desligado, espere 1 minuto e abra de novo: este PC assume, com os dados gravados.")
    avisar("LabFlow: não conectou", f"O LabFlow está aberto no PC {info.get('pc')}, mas este PC não conseguiu falar com ele "
           f"(porta {porta}).\n\nSe o PC servidor caiu ou foi desligado, espere 1 minuto e abra de novo: este PC assume.\n"
           f"Se acontecer sempre, peça à TI para liberar a porta TCP {porta} no PC servidor.", erro=True, esperar=True)
    return 2


def abrir_janela(endereco: str) -> None:
    """Abre o LabFlow como um programa, em tela cheia (como o F11; o F11 volta para janela): sem barra de endereço nem abas
    (modo aplicativo do Edge, que vem no Windows 10 e 11; senão o do Chrome). Sem nenhum dos dois, abre no navegador."""
    if EH_WINDOWS:
        pastas = [os.environ.get(v, "") for v in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
        candidatos = [Path(p) / "Microsoft" / "Edge" / "Application" / "msedge.exe" for p in pastas if p]
        candidatos += [Path(p) / "Google" / "Chrome" / "Application" / "chrome.exe" for p in pastas if p]
        for exe in candidatos:
            if exe.is_file():
                with contextlib.suppress(OSError):
                    subprocess.Popen([str(exe), f"--app={endereco}", "--start-fullscreen", "--new-window"],
                                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     creationflags=SEM_JANELA)
                    return
    webbrowser.open(endereco)


def marcar_que_abriu() -> None:
    with contextlib.suppress(OSError):
        if LOCAL is not None:
            (LOCAL / MARCADOR).write_text(dt.datetime.now().isoformat(timespec="seconds"), encoding="utf-8")


def iniciar_bandeja(srv: "Servidor", endereco: str, outros: str):
    """O ícone do LabFlow perto do relógio (modo oculto). Sem ele (biblioteca ausente, sessão sem área de trabalho), o
    LabFlow segue funcionando e fecha pelo 'Fechar LabFlow'."""
    try:
        import pystray
        from PIL import Image, ImageDraw

        imagem = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        desenho = ImageDraw.Draw(imagem)
        desenho.ellipse((2, 2, 62, 62), fill=(31, 59, 179))
        desenho.polygon([(26, 13), (38, 13), (38, 28), (50, 50), (14, 50), (26, 28)], fill=(255, 255, 255))

        def encerrar(icone, _item) -> None:
            if confirmar("Encerrar o LabFlow?", "Tudo será gravado no G: e os outros PCs param de usar o LabFlow até alguém "
                                               "abrir de novo.\n\nEncerrar agora?"):
                srv.parar.set()

        menu = pystray.Menu(
            pystray.MenuItem("Abrir o LabFlow", lambda _i, _it: abrir_janela(endereco), default=True),
            pystray.MenuItem("Endereço para os outros PCs", lambda _i, _it: avisar(
                "LabFlow: endereço", f"Neste PC: {endereco}\nOutros PCs: {outros}\n\nOu, nos outros PCs, os dois cliques em Abrir LabFlow.")),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Encerrar o LabFlow", encerrar),
        )
        icone = pystray.Icon("LabFlow", imagem, "LabFlow (servidor deste laboratório)", menu)
        threading.Thread(target=icone.run, daemon=True).start()
        return icone
    except Exception as erro:
        log(f"(sem o ícone perto do relógio: {erro}; para encerrar, use o Fechar LabFlow)")
        return None


# ---------------------------------------------------------------- teste de rede ------------------------------------
def testar_rede(dados: Dados, args: argparse.Namespace) -> int:
    arq = dados.dir / "teste-rede.json"
    ativo = dados.ler_json(arq)
    idade = None
    with contextlib.suppress(OSError):
        idade = dados.relogio() - arq.stat().st_mtime
    if ativo and idade is not None and idade < 600 and ativo.get("pc") != socket.gethostname():
        print(f"Testando a conexão com o PC {ativo['pc']} na porta {ativo['porta']}...")
        for host in [ativo["pc"], *ativo.get("ips", [])]:
            print(f"  {host}: {'OK' if conecta(host, ativo['porta']) else 'FALHOU'}")
        print("Se algum deu OK, este PC consegue usar o LabFlow aberto no outro.")
        return 0
    porta = porta_livre(args.porta, True)
    manipulador = __import__("http.server").server
    servidor = manipulador.ThreadingHTTPServer(("0.0.0.0", porta), manipulador.SimpleHTTPRequestHandler)
    dados.escrever_json(arq, {"pc": socket.gethostname(), "ips": ips_deste_pc(), "porta": porta})
    print(f"Este PC ({socket.gethostname()}) está ESCUTANDO na porta {porta} por 10 minutos.")
    print("Agora rode 'Testar rede' nos outros PCs do laboratório. Tecle Ctrl+C aqui para parar.")
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    try:
        time.sleep(600)
    except KeyboardInterrupt:
        pass
    servidor.shutdown()
    arq.unlink(missing_ok=True)
    return 0


# ---------------------------------------------------------------- principal ----------------------------------------
def main() -> int:
    global LOCAL, OCULTO
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--raiz", required=True, help="pasta do LabFlow no G: (a que tem a pasta dados)")
    ap.add_argument("--local", help="pasta de trabalho deste PC")
    ap.add_argument("--porta", type=int, default=PORTA_PADRAO)
    ap.add_argument("--sem-navegador", action="store_true")
    ap.add_argument("--redefinir-admin", action="store_true", help="gera nova senha provisória para o primeiro Admin")
    ap.add_argument("--testar-rede", action="store_true")
    ap.add_argument("--oculto", action="store_true", help="sem a janela preta: ícone perto do relógio e avisos em janelinha")
    args = ap.parse_args()
    OCULTO = args.oculto

    if EH_WINDOWS:
        base = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "LabFlowLite"
    else:
        base = Path.home() / ".labflow-lite"
    LOCAL = Path(args.local) if args.local else base
    LOCAL.mkdir(parents=True, exist_ok=True)
    dados = Dados(Path(args.raiz).resolve())

    if args.testar_rede:
        return testar_rede(dados, args)

    print(f"LabFlow Lite {PROGRAMA_VERSAO}")
    srv = Servidor(args, dados, LOCAL)
    if EH_WINDOWS:
        import ctypes

        tipo = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_uint)

        def tratar(evento: int) -> int:
            if evento in (0, 1):  # Ctrl+C / Ctrl+Break: encerra pelo caminho normal
                srv.parar.set()
                return 1
            srv.encerrar()  # fechou a janela, saiu do Windows ou desligou: o Windows dá poucos segundos
            os._exit(0)

        manter = tipo(tratar)
        ctypes.windll.kernel32.SetConsoleCtrlHandler(manter, 1)
    else:
        signal.signal(signal.SIGTERM, lambda *_: srv.parar.set())
        signal.signal(signal.SIGINT, lambda *_: srv.parar.set())

    codigo = srv.rodar()
    if codigo == -1:
        return modo_cliente(dados, args)
    return codigo


if __name__ == "__main__":
    sys.exit(main())
