#!/usr/bin/env python3
"""
Auditoria do workflow do LabFlow exportado do n8n.

Uso:
    python scripts/audit-workflow.py LabFlow.json            # checa estrutura
    python scripts/audit-workflow.py LabFlow.json --public   # checa estrutura + dados sensíveis

Checagens de estrutura (sempre):
    [ERRO]  conexão apontando para um node que não existe
    [ERRO]  node sem nenhuma conexão de entrada (órfão)
    [ERRO]  HTTP Request sem Respond to Webhook depois (execução fica pendurada até timeout)
    [ERRO]  placeholder não resolvido (ex: PRECISA_RESELECIONAR)
    [AVISO] espaço entre "=" e "{{" em expressões (vira texto fixo na mensagem)
    [AVISO] node desativado

Checagens de dados sensíveis (com --public), para o arquivo que vai para o GitHub:
    [ERRO]  ID de planilha do Google, ID de credencial, instanceId,
            pinData preenchido, telefone, e-mail, chave de API em texto puro

Sai com código 1 se houver algum ERRO, e 0 caso contrário.
Só usa a biblioteca padrão do Python (3.8+).
"""

import json
import re
import sys
from collections import defaultdict

# Placeholders usados na versão pública (são permitidos com --public)
PLACEHOLDER_OK = re.compile(r"^[A-Z][A-Z0-9_]*$")

# Placeholders que indicam configuração pendente (nunca deveriam chegar ao servidor)
PLACEHOLDERS_PENDENTES = ["PRECISA_RESELECIONAR"]

# Tipos de node que não precisam de conexão de entrada
TIPOS_GATILHO = ("webhook", "trigger", "stickynote")

# Tipo do node que encerra a resposta do webhook
TIPO_RESPOND = "respondtowebhook"


class Relatorio:
    def __init__(self):
        self.erros = []
        self.avisos = []

    def erro(self, categoria, msg):
        self.erros.append((categoria, msg))

    def aviso(self, categoria, msg):
        self.avisos.append((categoria, msg))

    def imprimir(self):
        for categoria, msg in self.erros:
            print(f"[ERRO]  {categoria}: {msg}")
        for categoria, msg in self.avisos:
            print(f"[AVISO] {categoria}: {msg}")
        print()
        print(f"Resultado: {len(self.erros)} erro(s), {len(self.avisos)} aviso(s)")


def tipo_curto(node):
    """'n8n-nodes-base.httpRequest' -> 'httprequest'"""
    return node.get("type", "").split(".")[-1].lower()


def percorrer_strings(valor, caminho=""):
    """Gera (caminho, texto) para toda string dentro de um dict/list."""
    if isinstance(valor, dict):
        for chave, sub in valor.items():
            yield from percorrer_strings(sub, f"{caminho}.{chave}" if caminho else chave)
    elif isinstance(valor, list):
        for i, sub in enumerate(valor):
            yield from percorrer_strings(sub, f"{caminho}[{i}]")
    elif isinstance(valor, str):
        yield caminho, valor


# ---------------------------------------------------------------------------
# Estrutura
# ---------------------------------------------------------------------------

def montar_grafo(workflow):
    """Retorna (saidas, entradas): dicts nome -> set de nomes."""
    saidas = defaultdict(set)
    entradas = defaultdict(set)
    for origem, tipos in workflow.get("connections", {}).items():
        for ramos in tipos.values():
            for ramo in ramos or []:
                for destino in ramo or []:
                    saidas[origem].add(destino["node"])
                    entradas[destino["node"]].add(origem)
    return saidas, entradas


def descendentes(nome, saidas):
    vistos, pilha = set(), [nome]
    while pilha:
        atual = pilha.pop()
        for proximo in saidas.get(atual, ()):
            if proximo not in vistos:
                vistos.add(proximo)
                pilha.append(proximo)
    return vistos


def checar_estrutura(workflow, rel):
    nodes = {n["name"]: n for n in workflow.get("nodes", [])}
    saidas, entradas = montar_grafo(workflow)

    # 1. Conexões para nodes inexistentes
    for origem, destinos in saidas.items():
        if origem not in nodes:
            rel.erro("conexão", f"conexão saindo de '{origem}', que não existe")
        for destino in destinos:
            if destino not in nodes:
                rel.erro("conexão", f"'{origem}' aponta para '{destino}', que não existe")

    # 2. Nodes órfãos (sem entrada)
    for nome, node in nodes.items():
        if any(t in tipo_curto(node) for t in TIPOS_GATILHO):
            continue
        if not entradas.get(nome):
            rel.erro("órfão", f"'{nome}' não recebe nenhuma conexão")

    # 3. HTTP Request sem Respond to Webhook depois
    for nome, node in nodes.items():
        if tipo_curto(node) != "httprequest":
            continue
        tipos_depois = {tipo_curto(nodes[d]) for d in descendentes(nome, saidas) if d in nodes}
        if TIPO_RESPOND not in tipos_depois:
            rel.erro("sem resposta", f"'{nome}' não tem Respond to Webhook depois")

    # 4. Placeholders pendentes e 5. espaço antes de {{
    for nome, node in nodes.items():
        for caminho, texto in percorrer_strings(node.get("parameters", {})):
            for ph in PLACEHOLDERS_PENDENTES:
                if ph in texto:
                    rel.erro("placeholder", f"'{nome}' ainda tem {ph} em {caminho}")
            if re.match(r"^=\s+\{\{", texto):
                rel.aviso("espaço", f"'{nome}' tem espaço antes de {{{{ em {caminho}")

    # 6. Nodes desativados
    for nome, node in nodes.items():
        if node.get("disabled"):
            rel.aviso("desativado", f"'{nome}' está desativado")


# ---------------------------------------------------------------------------
# Dados sensíveis (--public)
# ---------------------------------------------------------------------------

RE_PLANILHA_URL = re.compile(r"docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)")
RE_ID_LONGO = re.compile(r"^[A-Za-z0-9_-]{40,}$")
RE_TELEFONE = re.compile(r"(?<!\d)55\d{10,11}(?!\d)|\d{10,13}@s\.whatsapp\.net")
RE_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})?")


def checar_sensiveis(workflow, rel):
    if workflow.get("meta", {}).get("instanceId"):
        rel.erro("sensível", "meta.instanceId presente (identifica a instalação do n8n)")

    if workflow.get("pinData"):
        nomes = ", ".join(workflow["pinData"].keys())
        rel.erro("sensível", f"pinData preenchido em: {nomes} (pode conter mensagens reais)")

    for node in workflow.get("nodes", []):
        nome = node["name"]

        for tipo_cred, cred in (node.get("credentials") or {}).items():
            cid = str(cred.get("id", ""))
            if cid and not PLACEHOLDER_OK.match(cid):
                rel.erro("sensível", f"'{nome}' tem ID real de credencial ({tipo_cred})")

        for caminho, texto in percorrer_strings(node.get("parameters", {})):
            for m in RE_PLANILHA_URL.finditer(texto):
                if not PLACEHOLDER_OK.match(m.group(1)):
                    rel.erro("sensível", f"'{nome}' tem URL de planilha real em {caminho}")
            if caminho.endswith("documentId.value") and RE_ID_LONGO.match(texto):
                rel.erro("sensível", f"'{nome}' tem ID de planilha real em {caminho}")
            if RE_TELEFONE.search(texto):
                rel.erro("sensível", f"'{nome}' parece ter um telefone em {caminho}")
            if "@s.whatsapp.net" not in texto:
                for email in RE_EMAIL.findall(texto):
                    rel.erro("sensível", f"'{nome}' tem e-mail ({email}) em {caminho}")

        # Chave de API em texto puro em headers de HTTP Request
        headers = node.get("parameters", {}).get("headerParameters", {}).get("parameters", [])
        for h in headers:
            nome_h = str(h.get("name", "")).lower()
            valor = str(h.get("value", ""))
            if nome_h in ("apikey", "authorization", "x-api-key") and valor and not valor.startswith("="):
                rel.erro("sensível", f"'{nome}' tem {h.get('name')} em texto puro (use uma Credencial)")


# ---------------------------------------------------------------------------

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    publico = "--public" in sys.argv
    if len(args) != 1:
        print(__doc__)
        sys.exit(2)

    caminho = args[0]
    try:
        with open(caminho, encoding="utf-8") as f:
            workflow = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"[ERRO]  não foi possível ler {caminho}: {e}")
        sys.exit(1)

    print(f"Auditando {caminho} ({len(workflow.get('nodes', []))} nodes)"
          f"{' — modo público' if publico else ''}\n")

    rel = Relatorio()
    checar_estrutura(workflow, rel)
    if publico:
        checar_sensiveis(workflow, rel)
    rel.imprimir()
    sys.exit(1 if rel.erros else 0)


if __name__ == "__main__":
    main()
