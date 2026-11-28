"""Trava de regressão (decisão de 27/11: um PC só, sem rede): o código da Lite não pode escutar fora do 127.0.0.1.
Rodar: python app/lite/teste_so_local.py"""
import re
import sys
from pathlib import Path

aqui = Path(__file__).resolve().parent


def sem_comentarios(texto: str) -> str:
    return "\n".join(l for l in texto.splitlines() if not l.strip().startswith(("#", "rem ", "REM ", "'")))


fonte = (aqui / "lite.py").read_text(encoding="utf-8")
codigo = sem_comentarios(fonte)
assert "0.0.0.0" not in codigo, "lite.py não pode escutar em 0.0.0.0"
assert re.search(r'"--host",\s*ENDERECO_LOCAL', codigo) and re.search(r'ENDERECO_LOCAL\s*=\s*"127\.0\.0\.1"', codigo), (
    "o uvicorn precisa subir com --host 127.0.0.1"
)
assert "LABFLOW_BIND_HOST=ENDERECO_LOCAL" in codigo, "a API precisa saber que escuta só em loopback (ela recusa subir sem isso)"
assert "listen_addresses = '127.0.0.1'" in codigo, "o PostgreSQL precisa escutar só em 127.0.0.1"
for sobra in ("testar_rede", "ips_deste_pc", "testar-rede", "todas_as_interfaces"):
    assert sobra not in codigo, f"{sobra} não pode voltar: a Lite não usa a rede"
pacote = aqui / "pacote"
assert not list(pacote.glob("Testar rede*")), "o pacote não tem mais o teste de rede"
for bat in pacote.glob("*.bat"):
    txt = bat.read_text(encoding="utf-8", errors="replace").lower()
    assert "executionpolicy" not in txt and "-bypass" not in txt and "powershell" not in txt, f"PowerShell/Bypass em {bat.name}"
    assert "0.0.0.0" not in txt and "netsh" not in txt and "firewall" not in sem_comentarios(txt), f"{bat.name} mexe em rede/firewall"
# nada de regra de firewall em nenhum script que o laboratório roda
for arq in [*pacote.glob("*.bat"), *pacote.glob("*.vbs"), aqui / "lite.py"]:
    assert "netsh" not in arq.read_text(encoding="utf-8", errors="replace").lower(), f"{arq.name} não pode criar regra de firewall"
print("teste_so_local OK")
sys.exit(0)
