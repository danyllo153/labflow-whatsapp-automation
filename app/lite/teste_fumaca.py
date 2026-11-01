"""Teste de fumaça do pacote do LabFlow Lite no Windows (roda no GitHub Actions depois do montar.ps1).

Simula o uso real numa CÓPIA do pacote (o pacote publicado continua sem dados):
1. PC A abre pelo "Abrir LabFlow com janela.bat": banco do zero, Admin provisório, telas e login.
2. PC B (outro LOCALAPPDATA) abre enquanto A está no ar: vira cliente e não liga outro banco.
3. A fecha (parar.txt): cópia no G: e backup do dia gravados, aviso de servidor apagado.
4. PC B abre: restaura do G: e a senha trocada em A continua valendo.

Uso: python teste_fumaca.py <pasta LabFlow do pacote>
"""

import http.cookiejar
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


def abrir(raiz: Path, local_app: Path, saida: Path, oculto: bool = False) -> subprocess.Popen:
    env = dict(os.environ, LOCALAPPDATA=str(local_app))
    if not oculto:
        env["LABFLOW_LITE_TESTE"] = "1"
    else:
        env.pop("LABFLOW_LITE_TESTE", None)
    return subprocess.Popen(
        ["wscript", str(raiz / "Abrir LabFlow.vbs")] if oculto else ["cmd", "/c", str(raiz / "Abrir LabFlow com janela.bat"), "--sem-navegador"],
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=open(saida, "w", encoding="utf-8"),
        stderr=subprocess.STDOUT,
    )


def esperar(saida: Path, texto: str, segundos: int, proc: subprocess.Popen | None = None) -> str:
    fim = time.time() + segundos
    while time.time() < fim:
        conteudo = saida.read_text(encoding="utf-8", errors="replace") if saida.exists() else ""
        if texto in conteudo:
            return conteudo
        if proc is not None and proc.poll() is not None:
            break
        time.sleep(2)
    print(saida.read_text(encoding="utf-8", errors="replace") if saida.exists() else "(sem saída)")
    for prog in sorted(saida.parent.glob("pc*/LabFlowLite/programa")):
        local_bin = prog / "postgres" / "bin"
        pacote_bin = saida.parent / "G" / "LabFlow" / "instalacao" / "postgres" / "bin"
        faltam = sorted({p.name for p in pacote_bin.iterdir()} - {p.name for p in local_bin.iterdir()})
        print(f"--- {local_bin}: {len(list(local_bin.iterdir()))} arquivos; faltam da instalacao: {faltam[:20]}")
        for py in (sys.executable, str(prog / "python" / "python.exe")):
            r = subprocess.run([py, "-c", f"import subprocess;r=subprocess.run([r'{local_bin / 'initdb.exe'}','--version'],capture_output=True,text=True);print(hex(r.returncode & 0xffffffff),r.stdout,r.stderr)"], capture_output=True, text=True)
            print(f"  initdb --version via {py}: {r.stdout.strip()} {r.stderr.strip()[-300:]}")
    for log in sorted(saida.parent.glob("pc*/LabFlowLite/*.log")):
        print(f"--- {log}")
        print(log.read_text(encoding="utf-8", errors="replace")[-3000:])
    raise SystemExit(f"FALHOU: não apareceu '{texto}'")


def pedir(abridor, url: str, corpo: dict | None = None) -> int:
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dados, headers={"content-type": "application/json"})
    try:
        return abridor.open(req, timeout=20).status
    except urllib.error.HTTPError as erro:
        return erro.code


def fechar(raiz: Path, local_app: Path, proc: subprocess.Popen, saida: Path) -> None:
    (local_app / "LabFlowLite" / "parar.txt").write_text("")
    proc.wait(timeout=180)
    esperar(saida, "Tudo gravado", 5)
    assert not (raiz / "dados" / "servidor.json").exists(), "o aviso de servidor ficou para trás"


def main() -> None:
    pacote = Path(sys.argv[1]).resolve()
    # pasta comum (herda as permissões normais, como o %LOCALAPPDATA% de verdade); o mkdtemp do Windows dá acesso só ao
    # dono, e o initdb, que roda com permissões reduzidas, não consegue ler as DLLs lá
    trabalho = Path(os.environ.get("RUNNER_TEMP") or tempfile.gettempdir()) / f"lite-fumaca-{os.getpid()}"
    trabalho.mkdir(parents=True)
    raiz = trabalho / "G" / "LabFlow"
    shutil.copytree(pacote, raiz)
    marca = raiz / "dados" / "marca"
    marca.mkdir(parents=True)
    (marca / "marca.json").write_text(json.dumps({"nome": "Laboratório Exemplo", "cor_principal": "#0a7c4a"}), encoding="utf-8")
    pc_a, pc_b = trabalho / "pcA", trabalho / "pcB"
    pc_a.mkdir()
    pc_b.mkdir()

    # 1. PC A: do zero
    saida_a = trabalho / "a.txt"
    a = abrir(raiz, pc_a, saida_a)
    texto = esperar(saida_a, "LabFlow no ar", 600, a)
    usuario, senha = next(l for l in texto.splitlines() if l.startswith("LITE_ADMIN=")).split("=", 1)[1].split(":", 1)
    info = json.loads((raiz / "dados" / "servidor.json").read_text(encoding="utf-8"))
    base = f"http://127.0.0.1:{info['porta']}"
    web = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    assert pedir(web, base + "/saude") == 200
    assert pedir(web, base + "/app/") == 200, "telas não abriram"
    marca_lida = json.loads(urllib.request.urlopen(base + "/marca", timeout=20).read())
    assert marca_lida["nome"] == "Laboratório Exemplo" and marca_lida["cor_principal"] == "#0a7c4a", marca_lida
    assert pedir(web, base + "/login", {"usuario": usuario, "senha": senha}) == 200, "login com a senha provisória"
    assert pedir(web, base + "/trocar-senha", {"nova_senha": "SenhaDoTeste123"}) == 204, "troca de senha"
    print("1 ok: PC A abriu do zero, marca lida, login e troca de senha")

    # 2. PC B enquanto A está no ar: cliente
    saida_b = trabalho / "b.txt"
    b = abrir(raiz, pc_b, saida_b)
    b.wait(timeout=600)
    esperar(saida_b, "já está aberto", 5)
    assert not (pc_b / "LabFlowLite" / "data").exists(), "o cliente não pode ligar outro banco"
    print("2 ok: PC B virou cliente")

    # 3. A fecha
    fechar(raiz, pc_a, a, saida_a)
    dados = raiz / "dados"
    assert (dados / "labflow.dump").stat().st_size > 0
    assert list((dados / "backup").glob("labflow-*.dump")), "sem backup do dia"
    print("3 ok: A fechou e gravou no G:")

    # 4. B vira servidor com os dados do G:
    saida_b2 = trabalho / "b2.txt"
    b2 = abrir(raiz, pc_b, saida_b2)
    texto = esperar(saida_b2, "LabFlow no ar", 600, b2)
    assert "Restaurando os dados do G:" in texto
    info = json.loads((raiz / "dados" / "servidor.json").read_text(encoding="utf-8"))
    web = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    assert pedir(web, f"http://127.0.0.1:{info['porta']}/login", {"usuario": usuario, "senha": "SenhaDoTeste123"}) == 200
    fechar(raiz, pc_b, b2, saida_b2)
    print("4 ok: B restaurou do G: e a senha nova vale")

    # 5. B de novo pelo atalho Abrir LabFlow.vbs: já abriu uma vez, então abre OCULTO (sem janela nenhuma)
    assert (pc_b / "LabFlowLite" / "ja-abriu.txt").exists(), "o marcador de 'já abriu' não foi gravado"
    oculto = abrir(raiz, pc_b, trabalho / "b3.txt", oculto=True)
    oculto.wait(timeout=60)  # o wscript devolve o controle logo
    fim = time.time() + 300
    while time.time() < fim:
        info = json.loads((raiz / "dados" / "servidor.json").read_text(encoding="utf-8")) if (raiz / "dados" / "servidor.json").exists() else {}
        if info.get("porta") and pedir(urllib.request.build_opener(), f"http://127.0.0.1:{info['porta']}/saude") == 200:
            break
        time.sleep(3)
    else:
        print((pc_b / "LabFlowLite" / "lite.log").read_text(encoding="utf-8", errors="replace")[-3000:])
        raise SystemExit("FALHOU: o modo oculto não subiu")
    (pc_b / "LabFlowLite" / "parar.txt").write_text("")
    fim = time.time() + 180
    while (raiz / "dados" / "servidor.json").exists() and time.time() < fim:
        time.sleep(2)
    assert not (raiz / "dados" / "servidor.json").exists(), "o modo oculto não fechou pelo Fechar LabFlow"
    log_b = (pc_b / "LabFlowLite" / "lite.log").read_text(encoding="utf-8", errors="replace")
    assert "Rodando oculto" in log_b and "Tudo gravado" in log_b.split("Rodando oculto")[-1]
    print("5 ok: pelo atalho .vbs, da segunda vez abriu oculto e fechou pelo Fechar LabFlow")

    # 6. a senha provisória não fica gravada no lite.log
    log_a = (pc_a / "LabFlowLite" / "lite.log").read_text(encoding="utf-8", errors="replace")
    assert senha not in log_a and "senha provisória mostrada só na tela" in log_a
    print("6 ok: a senha provisória não está no log")
    print("TESTE DE FUMAÇA OK")


if __name__ == "__main__":
    main()
