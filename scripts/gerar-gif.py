"""Monta um GIF a partir dos prints de uma pasta (arquivos 01-...png, 02-...png, em ordem).

Prints de tamanhos diferentes não são esticados: cada um é centralizado num quadro do tamanho do maior,
com o fundo da cor do canto do próprio print, e depois o GIF todo é reduzido para a largura pedida.
Precisa do Pillow (py -m pip install --user pillow).

Uso:
  py scripts/gerar-gif.py docs/img/powerbi docs/img/powerbi/painel.gif
  py scripts/gerar-gif.py docs/img/bot docs/img/bot/bot.gif --largura 900 --tempo 4000
"""
import argparse
from pathlib import Path

from PIL import Image

args = argparse.ArgumentParser(description="GIF a partir de prints numerados")
args.add_argument("pasta", type=Path)
args.add_argument("saida", type=Path)
args.add_argument("--largura", type=int, default=1280, help="largura final em px (padrão 1280)")
args.add_argument("--tempo", type=int, default=2500, help="tempo de cada print em ms (padrão 2500)")
a = args.parse_args()

prints = sorted(a.pasta.glob("[0-9][0-9]-*.png"))
if not prints:
    raise SystemExit(f"nenhum print 01-...png em {a.pasta}")

imagens = [Image.open(p).convert("RGB") for p in prints]
largura = max(i.width for i in imagens)
altura = max(i.height for i in imagens)
escala = a.largura / largura
quadros = []
for img in imagens:
    fundo = Image.new("RGB", (largura, altura), img.getpixel((2, 2)))
    fundo.paste(img, ((largura - img.width) // 2, (altura - img.height) // 2))
    fundo = fundo.resize((a.largura, round(altura * escala)), Image.LANCZOS)
    # o GIF aceita 256 cores por quadro
    quadros.append(fundo.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))

quadros[0].save(a.saida, save_all=True, append_images=quadros[1:], duration=a.tempo, loop=0, optimize=True)
print(f"{a.saida.name}: {len(quadros)} prints, {quadros[0].width}x{quadros[0].height}, {a.saida.stat().st_size // 1024} KB")
