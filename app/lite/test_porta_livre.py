"""porta_livre pula a porta em que outro app ja escuta em 127.0.0.1 (no Windows o bind em 0.0.0.0 passaria mesmo assim)."""
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
        assert lite.porta_livre(porta, True) != porta
        assert lite.porta_livre(porta, False) != porta
    finally:
        ocupante.close()
