"""Cria a usuária FICTÍCIA do tour (Marina Lopes, Admin) no banco de TESTE, com a senha do roteiro.

Uso (na pasta app/api): LABFLOW_DB_URL=<banco de teste> python ../tour/preparar.py
Nunca rodar no banco do servidor: os dados do tour são os de demonstração (db/seeds).
"""

import os

import psycopg

from labflow_api.primeiro_admin import preparar_admin
from labflow_api.seguranca import gerar_hash_senha

USUARIO, SENHA = "marina.lopes", "Tour-2026-ok"  # as mesmas do roteiro.mjs (fictícias)

with psycopg.connect(os.environ["LABFLOW_DB_URL"]) as con:
    uid = con.execute(
        "INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000777', 'Marina Lopes', 'Admin') RETURNING id"
    ).fetchone()[0]
    preparar_admin(con, uid, USUARIO)
    con.execute(
        "UPDATE app.credenciais SET senha_hash = %s, trocar_senha = false WHERE usuario_id = %s", (gerar_hash_senha(SENHA), uid)
    )
    con.commit()
print(f"usuária do tour pronta: {USUARIO}")
