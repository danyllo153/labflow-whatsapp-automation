"""Permissões por cargo, conferidas no código a cada chamada (nunca no prompt da IA).

Spec: 07-app-pwa.md (v1.0), "Permissões"; 06-api-e-auth.md, "Arquitetura". Tarefa: APP-005.
O cargo vem de `usuarios` na hora (ver dependencias.pessoa_logada): trocar o cargo vale na chamada seguinte.
Cargo desconhecido não pode nada (falha fechada).
"""

from fastapi import Depends, HTTPException, status

from labflow_api.dependencias import PessoaLogada, pessoa_logada

CARGOS = ("Admin", "Operador", "Consultor", "Coletor")

# Ação -> cargos que podem. Detalhes "só a própria coleta" e "só consultas" são conferidos na rota da ação.
ACOES: dict[str, frozenset[str]] = {
    "ver_paginas": frozenset({"Admin", "Operador", "Consultor", "Coletor"}),  # Coletor: só as próprias coletas
    "imprimir_exportar": frozenset({"Admin", "Operador", "Consultor", "Coletor"}),  # Coletor: só as próprias coletas
    "entrar_no_turno": frozenset({"Admin", "Operador", "Coletor"}),
    "encerrar_turno": frozenset({"Admin", "Operador"}),
    "registrar_coleta": frozenset({"Admin", "Operador", "Coletor"}),
    "registrar_analise": frozenset({"Admin", "Operador"}),  # análises, resultados, desvios, estufas, esterilização
    "corrigir_registro": frozenset({"Admin", "Operador", "Coletor"}),  # Coletor: só a própria coleta
    "excluir_registro": frozenset({"Admin", "Operador", "Coletor"}),  # Coletor: só a própria coleta
    "usar_assistente": frozenset({"Admin", "Operador", "Consultor", "Coletor"}),  # Consultor: consultas; Coletor: coletas
    "gerenciar_pessoas": frozenset({"Admin"}),  # nova pessoa, senha provisória, cargo, bloquear acesso
    "configurar_turnos": frozenset({"Admin"}),  # horários padrão, atividades fixas, estufas, reabrir turno
}


def pode(cargo: str, acao: str) -> bool:
    return cargo in ACOES.get(acao, frozenset())


def acoes_do_cargo(cargo: str) -> list[str]:
    return sorted(acao for acao, cargos in ACOES.items() if cargo in cargos)


def exigir(acao: str):
    """Dependência para rotas: `Depends(exigir("gerenciar_pessoas"))` devolve a pessoa logada ou 403."""
    if acao not in ACOES:
        raise ValueError(f"Ação desconhecida: {acao}")

    def _checar(pessoa: PessoaLogada = Depends(pessoa_logada)) -> PessoaLogada:
        if pessoa.trocar_senha:  # 06: troca obrigatória antes de continuar (APP-006)
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Troque sua senha antes de continuar.")
        if not pode(pessoa.cargo, acao):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Seu cargo não permite esta ação.")
        return pessoa

    return _checar
