"""Primeiro acesso do Admin ao app, rodado UMA vez no servidor (APP-011).

Problema que resolve: a senha provisória é gerada por um Admin já logado (06, "Primeiro acesso"), mas no começo
ninguém tem usuário no app. Este comando dá o usuário curto e uma senha provisória a uma pessoa que JÁ é Admin
no bot (tabela usuarios). Não cria pessoa, não muda cargo e não mexe em tabela do bot: só grava no schema app.

Uso (dentro do container da API):
  python -m labflow_api.primeiro_admin                      lista os Admin do bot (id e nome)
  python -m labflow_api.primeiro_admin <id> <usuario.curto>  define o usuário e mostra a senha provisória
"""

import sys

from labflow_api import banco
from labflow_api.rotas_admin import gerar_senha_provisoria
from labflow_api.seguranca import gerar_hash_senha


def listar_admins(con) -> list[tuple[int, str | None]]:
    return con.execute("SELECT id, nome FROM usuarios WHERE cargo = 'Admin' ORDER BY id").fetchall()


def preparar_admin(con, usuario_id: int, usuario: str) -> str:
    """Define o usuário curto e gera a senha provisória (24 h). Devolve a senha, mostrada uma vez só."""
    usuario = usuario.strip().lower()
    linha = con.execute("SELECT cargo FROM usuarios WHERE id = %s", (usuario_id,)).fetchone()
    if linha is None:
        raise SystemExit("Pessoa não encontrada.")
    if linha[0] != "Admin":
        raise SystemExit("Essa pessoa não é Admin no bot. Use o app (Admin → Pessoas) para os outros cargos.")
    dono = con.execute("SELECT usuario_id FROM app.credenciais WHERE usuario = %s", (usuario,)).fetchone()
    if dono and dono[0] != usuario_id:
        raise SystemExit("Esse usuário já é de outra pessoa.")
    con.execute(
        """
        INSERT INTO app.credenciais (usuario_id, usuario, senha_hash, trocar_senha) VALUES (%s, %s, NULL, true)
        ON CONFLICT (usuario_id) DO UPDATE
          SET usuario = EXCLUDED.usuario, senha_hash = NULL, trocar_senha = true,
              tentativas_erradas = 0, bloqueado_ate = NULL, acesso_ativo = true, atualizado_em = now()
        """,
        (usuario_id, usuario),
    )
    con.execute(
        "UPDATE app.senhas_provisorias SET cancelada_em = now() "
        "WHERE usuario_id = %s AND usada_em IS NULL AND cancelada_em IS NULL",
        (usuario_id,),
    )
    senha = gerar_senha_provisoria()
    con.execute(
        "INSERT INTO app.senhas_provisorias (usuario_id, senha_hash, gerada_por) VALUES (%s, %s, %s)",
        (usuario_id, gerar_hash_senha(senha), usuario_id),
    )
    return senha


def main(argv: list[str]) -> None:
    with banco.conectar() as con:
        if len(argv) == 0:
            print("Admin no bot (id - nome):")
            for i, nome in listar_admins(con):
                print(f"  {i} - {nome or '(sem nome)'}")
            print("Depois rode: python -m labflow_api.primeiro_admin <id> <usuario.curto>")
            return
        if len(argv) != 2 or not argv[0].isdigit():
            raise SystemExit("Uso: python -m labflow_api.primeiro_admin <id> <usuario.curto>")
        senha = preparar_admin(con, int(argv[0]), argv[1])
    print(f"Usuário: {argv[1].strip().lower()}")
    print(f"Senha provisória (vale 24 horas, uma vez só): {senha}")
    print("No primeiro login o app pede uma senha nova (mínimo de 8 caracteres).")


if __name__ == "__main__":
    main(sys.argv[1:])
