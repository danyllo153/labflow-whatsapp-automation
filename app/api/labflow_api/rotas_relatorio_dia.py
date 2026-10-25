"""Relatório do dia (as leituras): o mesmo "relatório do dia" do bot, para ver na tela e copiar o texto.

Spec: docs/comandos.md, seção 15 (modelo do relatório completo, pedido PB18). Reproduz os nodes do bot
"BD · Relatório NFC", "BD · Relatório concentrado", "BD · Leitura finalizada" e "Montar relatório geral" (LabFlow.json),
com uma diferença: o dia é escolhido (hoje ou um dia anterior), em vez de só CURRENT_DATE. Só lê.
Cada linha do relatório vem pronta para a tela (as entradas, com ✅/🚨) e o texto inteiro vem igual ao do WhatsApp.
"""

from datetime import date
from typing import Any

import psycopg
from psycopg.rows import dict_row
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.rotas_analise_recebimento import _hoje

roteador = APIRouter(tags=["relatório do dia"])

NFC_SQL = """
SELECT bloco, amostra, linha, ordem, navio, tanque, lido, nao_ok, contagem, repeticao
FROM vw_relatorio_nfc
WHERE dia = %(dia)s
ORDER BY CASE bloco WHEN 'Tank farm' THEN 1 ELSE 2 END,
         CASE amostra WHEN 'Normal' THEN 1 WHEN 'Stress' THEN 2 ELSE 3 END,
         ordem, navio, length(tanque), tanque
"""

CONCENTRADO_SQL = """
SELECT bloco, linha, onde, load, numero, lotes, composta_id, tanque, data_coleta, lido, resultado, alarme
FROM (
  SELECT CASE vp.origem WHEN 'recebimento' THEN 'Recebimento' ELSE 'Embarque' END AS bloco,
         CASE vp.analise WHEN 'CT' THEN 'C.T 48h' WHEN 'BL72' THEN 'B.L 72h' ELSE 'B.L 120h' END AS linha,
         (CASE WHEN vp.origem = 'embarque'
               THEN n.nome || ' ' || n.viagem || ' linha ' || e.linha || ' fase ' || e.fase
               ELSE '' END)::text AS onde,
         l.numero::text AS load, vp.numero::int AS numero, NULL::int[] AS lotes, NULL::bigint AS composta_id,
         NULL::text AS tanque, NULL::text AS data_coleta,
         (c.id IS NOT NULL) AS lido, c.resultado::text AS resultado, COALESCE(c.alarme, false) AS alarme
  FROM vw_contagens_previstas vp
  JOIN loads l ON l.id = vp.load_id
  LEFT JOIN embarque_amostras ea ON ea.id = vp.embarque_amostra_id
  LEFT JOIN embarques e ON e.id = ea.embarque_id
  LEFT JOIN navios n ON n.id = e.navio_id
  LEFT JOIN vw_contagens c ON c.analise = vp.analise
       AND (   (vp.origem = 'recebimento' AND c.recebimento_lote_id = vp.recebimento_lote_id)
            OR (vp.origem = 'embarque' AND c.embarque_amostra_id = vp.embarque_amostra_id))
  WHERE vp.prevista = %(dia)s

  UNION ALL

  SELECT CASE v.origem WHEN 'recebimento' THEN 'Recebimento' ELSE 'Embarque' END,
         CASE t.tipo WHEN 'TAB' THEN 'TAB' WHEN 'COLIFORMES' THEN 'Coliformes' ELSE 'Howard' END,
         (CASE WHEN v.origem = 'embarque' THEN v.rotulo ELSE '' END)::text,
         v.load::text, NULL::int, v.lotes, t.composta_id, NULL::text, NULL::text,
         (t.status = 'Concluída'),
         COALESCE(t.resultado, CASE WHEN t.percentual IS NOT NULL THEN trim_scale(t.percentual)::text || '%%' END)::text,
         COALESCE(t.resultado = 'Positivo', false) OR COALESCE(t.percentual > limite_howard(t.data_feito), false)
  FROM testes t
  JOIN vw_compostas v ON v.id = t.composta_id
  WHERE (CASE t.tipo WHEN 'TAB' THEN COALESCE(t.leitura_prevista, t.espalhar_prevista + 5)
                     WHEN 'COLIFORMES' THEN COALESCE(t.leitura_prevista, t.espalhar_prevista + 1)
                     ELSE t.data_feito END) = %(dia)s

  UNION ALL

  SELECT 'Tank farm'::text, 'TAB'::text, ''::text, NULL::text, NULL::int, NULL::int[], NULL::bigint,
         co.tanque::text, to_char(co.data_coleta, 'DD/MM/YYYY'),
         (t.status = 'Concluída'), t.resultado::text, COALESCE(t.resultado = 'Positivo', false)
  FROM testes t
  JOIN coletas co ON co.id = t.coleta_id
  WHERE t.tipo = 'TAB' AND co.origem = 'terra'
    AND COALESCE(t.leitura_prevista, t.espalhar_prevista + 5) = %(dia)s
) x
ORDER BY CASE bloco WHEN 'Recebimento' THEN 1 WHEN 'Embarque' THEN 2 ELSE 3 END,
         onde, load, composta_id NULLS LAST, numero NULLS LAST, length(tanque), tanque
"""

FINALIZADA_SQL = """
SELECT (SELECT u.nome FROM leituras_finalizadas f LEFT JOIN usuarios u ON u.id = f.usuario_id WHERE f.dia = %(dia)s),
       (SELECT to_char(f.finalizado_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') FROM leituras_finalizadas f WHERE f.dia = %(dia)s),
       (SELECT json_agg(json_build_object(
                 'bloco', CASE WHEN v.origem = 'terra' THEN 'Tank farm' ELSE 'Navio' END,
                 'linha', 'Drop ' || v.dia, 'dia', v.dia, 'tanque', v.tanque, 'navio', v.navio,
                 'coleta', to_char(v.data_coleta, 'DD/MM'), 'ler_ate', to_char(v.leitura_prevista, 'DD/MM'),
                 'drop_hoje', v.drop_previsto = %(dia)s, 'ler_hoje', v.leitura_prevista = %(dia)s,
                 'lido_hoje', (v.resultado_em AT TIME ZONE 'America/Sao_Paulo')::date = %(dia)s,
                 'status', v.status, 'resultado', v.resultado, 'temperaturas', v.temperaturas))
          FROM vw_desvios_drop v
          WHERE v.drop_previsto = %(dia)s
             OR (v.status = 'Em confirmação' AND v.leitura_prevista <= %(dia)s)
             OR (v.resultado_em AT TIME ZONE 'America/Sao_Paulo')::date = %(dia)s),
       (SELECT json_agg(json_build_object(
                 'bloco', CASE WHEN t.origem = 'terra' THEN 'Tank farm' ELSE 'Navio' END,
                 'tanque', t.tanque, 'navio', t.navio, 'frasco', t.frasco,
                 'analise', CASE t.sub_analise WHEN 'CT' THEN 'C.T 48h' WHEN 'BL' THEN CASE t.etapa WHEN 'pre' THEN 'B.L 72h' ELSE 'B.L 120h' END
                            ELSE 'WORT ' || CASE t.metodo WHEN 'Superficie' THEN 'Superfície' ELSE 'Profundidade' END || CASE t.etapa WHEN 'pre' THEN ' 120h' ELSE ' 240h' END END,
                 'aberto_hoje', t.data_abertura = %(dia)s, 'ler_ate', to_char(t.repeticao_prevista, 'DD/MM'),
                 'status', t.status, 'resultado', t.resultado))
          FROM vw_desvios_tanque t
          WHERE (t.status = 'Em repetição' AND t.data_abertura <= %(dia)s)
             OR (t.resultado_em AT TIME ZONE 'America/Sao_Paulo')::date = %(dia)s)
"""


class Entrada(BaseModel):
    texto: str  # "77001 (4-5 ✅, 6 🚨, 7)", "42 ✅", "O.SKY 133 (1C ✅, 4P)"
    alarme: bool = False
    simples: str | None = None  # o mesmo sem as marcas, para o texto do WhatsApp: "77001 (4-7)"


class Linha(BaseModel):
    rotulo: str  # "C.T 48h", "Drop 5", "Desvios", "TAB"
    entradas: list[Entrada]
    lidos: int
    total: int
    situacao: str | None = None  # "ok" / "não ok" (só no completo, quando há o que mostrar)


class Secao(BaseModel):
    titulo: str  # "" no concentrado; "AMOSTRA NORMAL", "AMOSTRA STRESS", "DROPS" no NFC
    linhas: list[Linha]


class Bloco(BaseModel):
    titulo: str  # "FCOJ — Recebimento", "NFC — Tank farm"...
    secoes: list[Secao]
    alertas: list[str]
    lidos: int
    total: int


class Relatorio(BaseModel):
    dia: date
    hoje: date
    completo: bool
    blocos: list[Bloco]
    lidos: int
    total: int
    alertas: int
    finalizado_por: str | None
    finalizado_as: str | None
    texto: str  # para copiar e mandar no WhatsApp: sem emoji, com "Atenção" no fim quando algo fugiu do normal


# --- montagem (a mesma do node "Montar relatório geral") -------------------------------------------------------------

LIMITE = {"C.T 48h": 200, "B.L 72h": 50, "B.L 120h": 50}
LINHAS_CONC = {
    "Recebimento": ["C.T 48h", "B.L 72h", "B.L 120h", "TAB", "Coliformes"],
    "Embarque": ["C.T 48h", "B.L 72h", "B.L 120h", "Coliformes", "Howard", "TAB"],
}
LINHAS_ANALISE = ["C.T 48h", "B.L 72h", "B.L 120h", "Psicrotróficos 120h", "Psicrotróficos 240h"]
SECOES_NFC = [
    ("Normal", "AMOSTRA NORMAL", LINHAS_ANALISE),
    ("Stress", "AMOSTRA STRESS", LINHAS_ANALISE),
    ("Drops", "DROPS", ["Drop 5", "Drop 10", "Drop 15"]),
]


def _estado(r: dict) -> str:
    return "🚨" if r["alarme"] else ("✅" if r["lido"] else "")


def _faixas(nums: list[int]) -> list[tuple[int, int]]:
    ns, out, i = sorted(set(int(n) for n in nums)), [], 0
    while i < len(ns):
        j = i
        while j + 1 < len(ns) and ns[j + 1] == ns[j] + 1:
            j += 1
        out.append((ns[i], ns[j]))
        i = j + 1
    return out


def _txt_faixa(f: tuple[int, int], pref: str) -> str:
    return f"{pref}{f[0]}" if f[0] == f[1] else f"{pref}{f[0]}-{pref}{f[1]}"


def _lotes(r: dict, pref: str) -> str:
    return ",".join(_txt_faixa(f, pref) for f in _faixas(r["lotes"] or []))


def _tokens_contagem(lista: list[dict], pref: str) -> list[str]:
    """C.T / B.L: "1-5 ✅, 6 🚨, 7-14" (cada trecho com o mesmo estado)."""
    ordem, out, i = sorted(lista, key=lambda r: r["numero"]), [], 0
    while i < len(ordem):
        est, j = _estado(ordem[i]), i
        while j + 1 < len(ordem) and ordem[j + 1]["numero"] == ordem[j]["numero"] + 1 and _estado(ordem[j + 1]) == est:
            j += 1
        txt = _txt_faixa((ordem[i]["numero"], ordem[j]["numero"]), pref)
        out.append(f"{txt} {est}" if est else txt)
        i = j + 1
    return out


def _onde(onde: str, load: str | None) -> str:
    return f"{onde} - {load}" if onde else f"{load}"


def _agrupar(lista: list[dict]) -> list[list[dict]]:
    grupos: dict[str, list[dict]] = {}
    for r in lista:
        grupos.setdefault(f"{r['onde']}|{r['load']}", []).append(r)
    return list(grupos.values())


def _temps(lista: list | None) -> str:
    return ", ".join(f"{t} °C" for t in (lista or []))


def _sem_emoji(texto: str) -> str:
    """"77001 (4-5 ✅, 6 🚨, 7)" -> "77001 (4-5, 6, 7)"; "🚨 TAB POSITIVO ..." -> "TAB POSITIVO ..."."""
    for marca in ("✅ ", "🚨 ", "⚠️ "):
        texto = texto.replace(marca, "")
    for marca in (" ✅", " 🚨", "✅", "🚨", "⚠️"):
        texto = texto.replace(marca, "")
    return texto.strip()


def montar(dia: date, completo: bool, nfc: list[dict], conc: list[dict], fin: dict[str, Any]) -> tuple[list[Bloco], str, int, int, int]:
    visivel = (lambda r: r["lido"]) if completo else (lambda r: True)
    desvios = fin.get("desvios") or []
    desvios_tanque = fin.get("desvios_tanque") or []
    drops_nao_ok = {(d["bloco"], d["linha"], d["tanque"], d["navio"] or "") for d in desvios if d["drop_hoje"]}
    blocos: list[Bloco] = []

    # ---------------- FCOJ ----------------
    for bloco, linhas_do_bloco in LINHAS_CONC.items():
        pref, palavra = ("A", "amostra") if bloco == "Embarque" else ("", "lote")
        alertas: list[str] = []
        linhas: list[Linha] = []
        for linha in linhas_do_bloco:
            todas = [r for r in conc if r["bloco"] == bloco and r["linha"] == linha]
            lista = [r for r in todas if visivel(r)]
            entradas: list[Entrada] = []
            if linha in LIMITE:
                for g in _agrupar(lista):
                    rot = _onde(g[0]["onde"], g[0]["load"])
                    alarmes = sorted((r for r in g if r["alarme"]), key=lambda r: r["numero"])
                    juntas = ", ".join(_txt_faixa(f, pref) for f in _faixas([r["numero"] for r in g]))
                    entradas.append(Entrada(texto=f"{rot} ({', '.join(_tokens_contagem(g, pref))})", alarme=bool(alarmes), simples=f"{rot} ({juntas})"))
                    if alarmes:
                        valores = ", ".join(f"{palavra} {pref}{r['numero']} = {str(r['resultado']).replace('.', ',')}" for r in alarmes)
                        alertas.append(f"🚨 {linha} ≥ {LIMITE[linha]} — {rot}: {valores}")
            elif linha == "Howard":
                for r in lista:
                    rot = f"{_onde(r['onde'], r['load'])} ({_lotes(r, pref)})"
                    entradas.append(Entrada(texto=f"{rot}: {r['resultado']}{' 🚨' if r['alarme'] else ''}", alarme=r["alarme"]))
                    if r["alarme"]:
                        alertas.append(f"🚨 Howard acima do limite — {rot}: {r['resultado']}")
            else:  # TAB e Coliformes: uma composta por parêntese, "(1-5 ✅)(6-10 🚨)"
                for g in _agrupar(lista):
                    rot = _onde(g[0]["onde"], g[0]["load"])
                    par = "".join(f"({_lotes(r, pref)}{' ' + _estado(r) if _estado(r) else ''})" for r in g)
                    positivas = [r for r in g if r["alarme"]]
                    entradas.append(Entrada(texto=f"{rot} {par}", alarme=bool(positivas)))
                    if positivas:
                        alertas.append(f"🚨 {linha} POSITIVO — {rot} " + "".join(f"({_lotes(r, pref)})" for r in positivas))
            situacao = ("não ok" if any(r["alarme"] for r in lista) else "ok") if completo and lista else None
            linhas.append(Linha(rotulo=linha, entradas=entradas, lidos=sum(r["lido"] for r in todas), total=len(todas), situacao=situacao))
        total = sum(l.total for l in linhas)
        if total:
            blocos.append(Bloco(titulo=f"FCOJ — {bloco}", secoes=[Secao(titulo="", linhas=linhas)], alertas=alertas,
                                lidos=sum(l.lidos for l in linhas), total=total))

    # ---------------- NFC ----------------
    def nao_ok(r: dict) -> bool:
        return r["nao_ok"] or (r["bloco"], r["linha"], r["tanque"], r["navio"] or "") in drops_nao_ok

    def rotulo_nfc(r: dict) -> str:
        nome = f"{r['tanque']} (repetição)" if r["repeticao"] else r["tanque"]
        if nao_ok(r):
            return f"{nome} 🚨" + (f" ({r['contagem']})" if r["contagem"] else "")
        return f"{nome} ✅" if r["lido"] else nome

    def entradas_nfc(lista: list[dict], bloco: str) -> list[Entrada]:
        if bloco == "Tank farm":
            return [Entrada(texto=rotulo_nfc(r), alarme=nao_ok(r)) for r in lista]
        por_navio: dict[str, list[dict]] = {}
        for r in lista:
            por_navio.setdefault(r["navio"] or "sem navio", []).append(r)
        return [Entrada(texto=f"{navio} ({', '.join(rotulo_nfc(r) for r in rs)})", alarme=any(nao_ok(r) for r in rs))
                for navio, rs in por_navio.items()]

    for bloco in ("Tank farm", "Navio"):
        alertas = []
        secoes: list[Secao] = []
        for amostra, titulo, linhas_sec in SECOES_NFC:
            linhas = []
            for linha in linhas_sec:
                todas = [r for r in nfc if r["bloco"] == bloco and r["amostra"] == amostra and r["linha"] == linha]
                vis = [r for r in todas if visivel(r)]
                situacao = ("não ok" if any(nao_ok(r) for r in vis) else "ok") if completo and vis else None
                linhas.append(Linha(rotulo=linha, entradas=entradas_nfc(vis, bloco), lidos=sum(r["lido"] for r in todas),
                                    total=len(todas), situacao=situacao))
                for r in todas:
                    if r["nao_ok"]:
                        navio = f" ({r['navio']})" if r["navio"] else ""
                        rep = ", repetição" if r["repeticao"] else ""
                        alertas.append(f"🚨 {linha} NÃO OK — tanque {r['tanque']}{navio} ({amostra}{rep}): {r['contagem'] or 'acima do limite'}")
            if amostra == "Stress":
                dts = [d for d in desvios_tanque if d["bloco"] == bloco]
                if dts:
                    def _dt(d: dict) -> str:
                        navio = f" ({d['navio']})" if d["navio"] else ""
                        if d["status"] == "Em repetição":
                            fim = f"(em repetição{', ler até ' + d['ler_ate'] if d['ler_ate'] else ''})"
                        else:
                            fim = "🚨 repetição não ok" if d["resultado"] == "Não ok" else "✅ repetição ok"
                        return f"{d['tanque']}{navio} {d['analise']} {d['frasco']} {fim}"
                    linhas.append(Linha(rotulo="Desvios de tanque", lidos=0, total=0,
                                        entradas=[Entrada(texto=_dt(d), alarme=d["resultado"] == "Não ok") for d in dts]))
                    for d in dts:
                        if d["aberto_hoje"]:
                            navio = f" ({d['navio']})" if d["navio"] else ""
                            alertas.append(f"⚠️ Desvio criado do tanque {d['tanque']}{navio} ({d['analise']}, {d['frasco']}): repetição com o frasco de arquivo")
            if amostra == "Drops":
                do_bloco = [d for d in desvios if d["bloco"] == bloco]
                for d in do_bloco:
                    if d["drop_hoje"]:
                        navio = f" ({d['navio']})" if d["navio"] else ""
                        alertas.append(f"🚨 Drop D{d['dia']} NÃO OK — tanque {d['tanque']}{navio} (coleta {d['coleta']}): desvio aberto, ler até {d['ler_ate']}")
                leituras = [d for d in do_bloco if d["ler_hoje"] or d["lido_hoje"] or (d["status"] == "Em confirmação" and not d["drop_hoje"])]
                if leituras or do_bloco:
                    def _dd(d: dict) -> Entrada:
                        nome = f"{d['tanque']} D{d['dia']}"
                        if d["status"] != "Concluído":
                            return Entrada(texto=f"{nome} (ler até {d['ler_ate']})")
                        if d["resultado"] == "Confirmado":
                            return Entrada(texto=f"{nome} 🚨 confirmou em {_temps(d['temperaturas'])}", alarme=True)
                        return Entrada(texto=f"{nome} ✅ não confirmado")
                    mostrar = [d for d in leituras if not completo or d["status"] == "Concluído"]
                    linhas.append(Linha(rotulo="Desvios", entradas=[_dd(d) for d in mostrar], total=len(leituras),
                                        lidos=sum(d["status"] == "Concluído" for d in leituras)))
                for d in leituras:
                    if d["resultado"] == "Confirmado":
                        alertas.append(f"🚨 Desvio CONFIRMADO — drop D{d['dia']} do tanque {d['tanque']} (coleta {d['coleta']}) em {_temps(d['temperaturas'])}")
                if bloco == "Tank farm":
                    tabs = [r for r in conc if r["bloco"] == "Tank farm" and r["linha"] == "TAB"]
                    ents = []
                    for r in (r for r in tabs if visivel(r)):
                        est = _estado(r)
                        ents.append(Entrada(texto=f"{r['tanque']} (coleta {str(r['data_coleta'])[:5]}){' ' + est if est else ''}", alarme=r["alarme"]))
                    linhas.append(Linha(rotulo="TAB", entradas=ents, lidos=sum(r["lido"] for r in tabs), total=len(tabs)))
                    for r in tabs:
                        if r["alarme"]:
                            alertas.append(f"🚨 TAB POSITIVO — tanque {r['tanque']} (coleta {str(r['data_coleta'])[:5]})")
            secoes.append(Secao(titulo=titulo, linhas=linhas))
        total = sum(l.total for s in secoes for l in s.linhas)
        extra = any(l.rotulo.startswith("Desvios") for s in secoes for l in s.linhas)
        if total or extra:
            blocos.append(Bloco(titulo=f"NFC — {bloco}", secoes=secoes, alertas=alertas,
                                lidos=sum(l.lidos for s in secoes for l in s.linhas), total=total))

    # ---------------- texto para copiar e mandar no WhatsApp (sem emoji, 25/10) ----------------
    # O emoji chegava quebrado ("�") ao compartilhar: as linhas levam só os números e o que fugiu do normal vai para
    # "Atenção", no fim da mensagem. Na tela, o ✅/🚨 das entradas continua (vira marca colorida).
    partes = [f"*Relatório do dia {dia:%d/%m/%Y}{' — completo' if completo else ''}*"]
    atencao: list[str] = []
    for b in blocos:
        partes += ["", f"*{b.titulo}*"]
        for s in b.secoes:
            if s.titulo:
                partes += ["", s.titulo]
            for l in s.linhas:
                if l.rotulo == "Desvios de tanque":
                    partes += ["", f"{l.rotulo}: {', '.join(_sem_emoji(e.texto) for e in l.entradas)}"]
                    continue
                sep = ", " if b.titulo == "NFC — Tank farm" or l.rotulo.startswith("Desvios") else "; "
                celula = sep.join((e.simples or _sem_emoji(e.texto)) for e in l.entradas) or "-"
                if l.situacao:
                    celula += f" — {l.situacao}"
                partes.append(f"{l.rotulo}: {celula}")
        atencao += [_sem_emoji(a) for a in b.alertas]
    lidos, total = sum(b.lidos for b in blocos), sum(b.total for b in blocos)
    n_alarmes = sum(1 for b in blocos for a in b.alertas if a.startswith("🚨"))
    if not total:
        partes += ["", "Nenhuma leitura prevista para este dia."]
    else:
        partes += ["", f"Lidas: {lidos} de {total}."]
        if completo and total > lidos:
            falta = total - lidos
            partes.append(f"Ainda há {falta} leitura{'' if falta == 1 else 's'} por fazer: este relatório traz só o que já foi lido.")
    if fin.get("finalizado_por"):
        partes.append(f"Leitura do dia finalizada por {fin['finalizado_por']} às {fin['finalizado_as']}.")
    if atencao:
        partes += ["", "*Atenção:*"] + [f"- {a}" for a in atencao]
    return blocos, "\n".join(partes), lidos, total, n_alarmes


@roteador.get("/relatorio-do-dia", response_model=Relatorio)
def relatorio_do_dia(
    dia: date | None = Query(default=None),
    completo: bool = Query(default=False),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Relatorio:
    """As leituras de um dia (hoje, se não disser) nos quatro blocos, como o "relatório do dia" do bot."""
    hoje = _hoje(con)
    dia = dia or hoje
    p = {"dia": dia}
    cur = con.cursor(row_factory=dict_row)
    nfc = cur.execute(NFC_SQL, p).fetchall()
    conc = cur.execute(CONCENTRADO_SQL, p).fetchall()
    por, as_, desvios, desvios_tanque = con.execute(FINALIZADA_SQL, p).fetchone()
    fin = {"finalizado_por": por, "finalizado_as": as_, "desvios": desvios, "desvios_tanque": desvios_tanque}
    blocos, texto, lidos, total, alertas = montar(dia, completo, [r for r in nfc if r["linha"]], [r for r in conc if r["linha"]], fin)
    return Relatorio(dia=dia, hoje=hoje, completo=completo, blocos=blocos, lidos=lidos, total=total, alertas=alertas,
                     finalizado_por=por, finalizado_as=as_, texto=texto)
