"""Monta o GIF do painel do Power BI a partir dos prints em docs/img/powerbi/ (01-...png a 09-...png).

Cada página aparece por 2,5 s, em largura de 1280 px. Precisa do Pillow (py -m pip install --user pillow).
Uso: py scripts/gerar-gif-painel.py
"""
from pathlib import Path

from PIL import Image

PASTA = Path(__file__).resolve().parent.parent / "docs" / "img" / "powerbi"
SAIDA = PASTA / "painel.gif"
LARGURA = 1280
TEMPO_MS = 2500

prints = sorted(p for p in PASTA.glob("[0-9][0-9]-*.png"))
if not prints:
    raise SystemExit(f"nenhum print em {PASTA}")

# todas do mesmo tamanho (a primeira manda) e com uma paleta de 256 cores, que é o que o GIF aceita
base = Image.open(prints[0])
altura = round(base.height * LARGURA / base.width)
quadros = []
for p in prints:
    img = Image.open(p).convert("RGB").resize((LARGURA, altura), Image.LANCZOS)
    quadros.append(img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))

quadros[0].save(SAIDA, save_all=True, append_images=quadros[1:], duration=TEMPO_MS, loop=0, optimize=True)
print(f"{SAIDA.name}: {len(quadros)} páginas, {LARGURA}x{altura}, {SAIDA.stat().st_size // 1024} KB")
