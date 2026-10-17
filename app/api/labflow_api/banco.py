"""Conexão da API com o PostgreSQL.

O endereço do banco vem SEMPRE da variável de ambiente LABFLOW_DB_URL (nunca senha no repositório).
Spec: docs/specs/lims/06-api-e-auth.md (v1.0), Arquitetura. Tarefa: APP-002.
"""

import os

import psycopg


class BancoNaoConfigurado(RuntimeError):
    """LABFLOW_DB_URL não foi definida."""


def url_do_banco() -> str:
    url = os.environ.get("LABFLOW_DB_URL", "").strip()
    if not url:
        raise BancoNaoConfigurado("Defina a variável de ambiente LABFLOW_DB_URL.")
    return url


def conectar() -> psycopg.Connection:
    """Abre uma conexão nova. Quem chama fecha (use com `with`)."""
    return psycopg.connect(url_do_banco())
