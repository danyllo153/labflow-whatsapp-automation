"""APP-004: entrar, sair, quem sou eu, sessão de 30 dias e bloqueio após 5 erros (06 v1.0; 08 A1)."""

SENHA = "Senha-de-teste-1"


def _entrar(cliente, usuario="ana.teste", senha=SENHA):
    return cliente.post("/login", json={"usuario": usuario, "senha": senha})


def test_login_certo_abre_sessao_e_me_responde(cliente, criar_pessoa):
    criar_pessoa(cargo="Operador")
    r = _entrar(cliente)
    assert r.status_code == 200
    assert r.json()["cargo"] == "Operador"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "max-age=2592000" in cookie
    me = cliente.get("/me")
    assert me.status_code == 200
    assert me.json()["usuario"] == "ana.teste"


def test_usuario_aceita_maiusculas_e_espacos(cliente, criar_pessoa):
    criar_pessoa()
    assert _entrar(cliente, usuario="  Ana.Teste ").status_code == 200


def test_senha_errada_e_usuario_inexistente_dao_a_mesma_mensagem(cliente, criar_pessoa):
    criar_pessoa()
    errada = _entrar(cliente, senha="outra")
    inexistente = _entrar(cliente, usuario="ninguem.aqui")
    assert errada.status_code == inexistente.status_code == 401
    assert errada.json() == inexistente.json() == {"detail": "Usuário ou senha incorretos."}


def test_me_sem_login_da_401(cliente):
    assert cliente.get("/me").status_code == 401


def test_cinco_erros_bloqueiam_por_15_minutos(cliente, criar_pessoa, conexao):
    criar_pessoa()
    for _ in range(4):
        assert _entrar(cliente, senha="errada").status_code == 401
    assert conexao.execute("SELECT bloqueado_ate FROM app.credenciais WHERE usuario='ana.teste'").fetchone()[0] is None
    assert _entrar(cliente, senha="errada").status_code == 401  # 5º erro: bloqueia
    bloqueado = _entrar(cliente)  # nem a senha certa entra
    assert bloqueado.status_code == 423
    minutos = conexao.execute(
        "SELECT round(extract(epoch FROM bloqueado_ate - now()) / 60) FROM app.credenciais WHERE usuario='ana.teste'"
    ).fetchone()[0]
    assert minutos == 15
    # passados os 15 minutos, entra
    conexao.execute("UPDATE app.credenciais SET bloqueado_ate = now() - interval '1 minute' WHERE usuario='ana.teste'")
    assert _entrar(cliente).status_code == 200


def test_acerto_zera_as_tentativas(cliente, criar_pessoa, conexao):
    criar_pessoa()
    for _ in range(3):
        _entrar(cliente, senha="errada")
    assert _entrar(cliente).status_code == 200
    assert conexao.execute(
        "SELECT tentativas_erradas FROM app.credenciais WHERE usuario='ana.teste'"
    ).fetchone()[0] == 0


def test_sair_encerra_a_sessao(cliente, criar_pessoa):
    criar_pessoa()
    _entrar(cliente)
    token = cliente.cookies.get("labflow_sessao")
    assert cliente.post("/sair").status_code == 204
    cliente.cookies.set("labflow_sessao", token)  # mesmo reaproveitando o cookie antigo
    assert cliente.get("/me").status_code == 401


def test_sessao_vence_depois_de_30_dias_sem_uso(cliente, criar_pessoa, conexao):
    criar_pessoa()
    _entrar(cliente)
    conexao.execute("UPDATE app.sessoes SET ultimo_uso_em = now() - interval '29 days'")
    assert cliente.get("/me").status_code == 200  # usou: renova
    conexao.execute("UPDATE app.sessoes SET ultimo_uso_em = now() - interval '31 days'")
    assert cliente.get("/me").status_code == 401


def test_acesso_bloqueado_pelo_admin(cliente, criar_pessoa):
    criar_pessoa(ativo=False)
    r = _entrar(cliente)
    assert r.status_code == 403


def test_cargo_vem_de_usuarios_a_cada_chamada(cliente, criar_pessoa, conexao):
    uid = criar_pessoa(cargo="Operador")
    _entrar(cliente)
    conexao.execute("UPDATE usuarios SET cargo = 'Consultor' WHERE id = %s", (uid,))
    assert cliente.get("/me").json()["cargo"] == "Consultor"


def test_no_banco_fica_so_o_hash_do_token(cliente, criar_pessoa, conexao):
    criar_pessoa()
    _entrar(cliente)
    token = cliente.cookies.get("labflow_sessao")
    guardado = conexao.execute("SELECT token_hash FROM app.sessoes").fetchone()[0]
    assert token and guardado != token and len(guardado) == 64


def test_bloquear_acesso_derruba_quem_ja_esta_logado(cliente, criar_pessoa, conexao):
    uid = criar_pessoa()
    _entrar(cliente)
    assert cliente.get("/me").status_code == 200
    conexao.execute("UPDATE app.credenciais SET acesso_ativo = false WHERE usuario_id = %s", (uid,))
    assert cliente.get("/me").status_code == 401
