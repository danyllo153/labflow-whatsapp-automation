"""Senhas e tokens de sessão.

Spec: 06-api-e-auth.md (v1.0), "Arquitetura": senha em hash argon2; sessão por cookie seguro.
Tarefa: APP-004.
"""

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()


def gerar_hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def senha_confere(senha_hash: str | None, senha: str) -> bool:
    if not senha_hash:
        return False
    try:
        return _hasher.verify(senha_hash, senha)
    except (VerificationError, InvalidHashError):
        return False


def novo_token() -> str:
    """Token aleatório que vai no cookie. No banco fica só o hash dele."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
