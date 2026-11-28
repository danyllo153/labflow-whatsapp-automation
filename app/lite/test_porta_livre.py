"""porta_livre escuta só em 127.0.0.1 e pula a porta em que outro app já escuta (no Windows o bind passaria mesmo assim)."""
import socket
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lite  # noqa: E402


def test_pula_porta_ocupada_em_127_0_0_1():
    ocupante = socket.socket()
    ocupante.bind(("127.0.0.1", 0))
    ocupante.listen()
    porta = ocupante.getsockname()[1]
    try:
        assert lite.porta_livre(porta) != porta
    finally:
        ocupante.close()


def test_porta_livre_so_aceita_o_inicio():
    """Não existe mais a opção de escutar em todas as interfaces."""
    import inspect

    assert list(inspect.signature(lite.porta_livre).parameters) == ["inicio"]
