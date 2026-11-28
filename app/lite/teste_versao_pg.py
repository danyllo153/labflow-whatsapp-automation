"""Trava de versão do PostgreSQL (27/11), sem PostgreSQL: banco de outra versão principal não liga, nada é apagado, e a Lite
oferece restaurar da cópia da pasta de rede quando o pacote é mais novo. Rodar: python app/lite/teste_versao_pg.py"""
import argparse
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lite  # noqa: E402

tmp = Path(tempfile.mkdtemp(prefix="teste-versao-pg-"))
data = tmp / "data"
data.mkdir()
(data / "PG_VERSION").write_text("17\n")
(data / "dado.txt").write_text("importante")
pg = tmp / "postgres"
(pg / "bin").mkdir(parents=True)

# 1. a trava em si (pacote 16, banco 17)
(pg / "VERSAO.txt").write_text("postgres (PostgreSQL) 16.6\n")
assert lite.major_do_banco(data) == 17 and lite.major_do_pacote(pg / "bin") == 16
try:
    lite.checar_versao_banco(data, pg / "bin")
    raise SystemExit("FALHOU: devia recusar pacote 16 com banco 17")
except RuntimeError as erro:
    assert "PostgreSQL 16" in str(erro) and "PostgreSQL 17" in str(erro) and "pacote certo" in str(erro), erro
    assert "Nada foi alterado nem apagado" in str(erro)
assert (data / "dado.txt").read_text() == "importante", "a trava não pode alterar nem apagar os dados"

(pg / "VERSAO.txt").write_text("postgres (PostgreSQL) 17.12\n")
lite.checar_versao_banco(data, pg / "bin")  # mesma versão principal: passa
(data / "PG_VERSION").unlink()
lite.checar_versao_banco(data, pg / "bin")  # sem banco ainda: passa


# 2. o fluxo da Lite (Servidor.subir_banco): o caso real de 27/11 (cópia do PG17 na rede e pacote com PG16)
def novo_servidor(nome: str, banco: int, pacote: int):
    raiz = tmp / nome
    (raiz / "local").mkdir(parents=True)
    (raiz / "rede" / "dados").mkdir(parents=True)
    (raiz / "pacote" / "bin").mkdir(parents=True)
    (raiz / "pacote" / "VERSAO.txt").write_text(f"postgres (PostgreSQL) {pacote}.1\n")
    lite.LOCAL = raiz / "local"
    srv = lite.Servidor(argparse.Namespace(porta=8000, redefinir_admin=False), lite.Dados(raiz / "rede"), raiz / "local")
    srv.pg.bin = raiz / "pacote" / "bin"
    if banco:
        (srv.pg.data).mkdir()
        (srv.pg.data / "PG_VERSION").write_text(f"{banco}\n")
        (srv.pg.data / "dado.txt").write_text("importante")
    return srv


def tentar(srv):
    try:
        srv.subir_banco()
    except RuntimeError as erro:
        return str(erro)
    raise SystemExit("FALHOU: devia recusar")


# 2a. pacote 16, banco local 17: recusa, sem oferecer restaurar, sem tocar na pasta
srv = novo_servidor("a", banco=17, pacote=16)
srv.dump_do_g = lambda: tmp / "qualquer.dump"
srv.perguntar_restaurar = lambda *a: (_ for _ in ()).throw(SystemExit("FALHOU: não pode oferecer restaurar com pacote mais velho"))
msg = tentar(srv)
assert "PostgreSQL 16" in msg and "PostgreSQL 17" in msg and "Nada foi alterado" in msg
assert (srv.pg.data / "dado.txt").read_text() == "importante" and (srv.pg.data / "PG_VERSION").exists()

# 2b. pacote 17, banco local 16, sem cópia legível na rede: recusa e a pasta fica
srv = novo_servidor("b", banco=16, pacote=17)
srv.dump_do_g = lambda: None
msg = tentar(srv)
assert "PostgreSQL 17" in msg and "PostgreSQL 16" in msg
assert (srv.pg.data / "dado.txt").read_text() == "importante"

# 2c. pacote 17, banco local 16, há cópia, mas a pessoa diz "não": recusa e a pasta fica
srv = novo_servidor("c", banco=16, pacote=17)
srv.dump_do_g = lambda: tmp / "qualquer.dump"
srv.perguntar_restaurar = lambda *a: False
tentar(srv)
assert (srv.pg.data / "dado.txt").read_text() == "importante"

# 2d. pacote 17, banco local 16, há cópia e a pessoa aceita: o banco antigo é RENOMEADO (guardado), nunca apagado
srv = novo_servidor("d", banco=16, pacote=17)
srv.dump_do_g = lambda: tmp / "qualquer.dump"
perguntas = []
srv.perguntar_restaurar = lambda b, p: perguntas.append((b, p)) or True
srv.tratar_versao_do_banco()
assert perguntas == [(16, 17)]
assert not srv.pg.data.exists(), "a pasta do banco antigo deve sair do caminho para o novo ser criado"
guardados = list((tmp / "d" / "local").glob("data-pg16-*"))
assert len(guardados) == 1 and (guardados[0] / "dado.txt").read_text() == "importante", "o banco antigo tem que ficar guardado"

# 2e. cópia na rede que o pacote não consegue ler: mensagem clara e nenhum banco local é tocado (cópia do PG17 com pacote 16)
srv = novo_servidor("e", banco=0, pacote=16)
(srv.dados.dump).write_bytes(b"PGDMP\x01\x10\x00")
srv.dump_do_g = lambda: None  # o pg_restore do pacote não leu
msg = srv.dump_ilegivel()
assert msg and "mais novo" in msg and "Nada foi alterado nem apagado" in msg
assert srv.dados.dump.exists()
try:
    srv.subir_banco()
    raise SystemExit("FALHOU: devia recusar com a cópia ilegível")
except RuntimeError as erro:
    assert "não pôde ser lida" in str(erro)
assert not srv.pg.data.exists(), "não pode criar nem apagar banco local quando a cópia não é legível"

print("teste_versao_pg OK")
