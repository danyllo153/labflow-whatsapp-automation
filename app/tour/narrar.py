"""Narração do tour com voz de IA (voz neural pt-BR da Microsoft, pelo edge-tts): um áudio por passo do roteiro.

Uso: python narrar.py falas.json pasta [voz]
  falas.json: lista com a fala de cada passo (gerada do roteiro.mjs pelo workflow)
  gera pasta/fala-NN.mp3 e pasta/duracoes.json ({passo: segundos}), que o gravar.mjs usa para esperar cada fala.
Precisa de internet (roda no GitHub Actions). Voz padrão: pt-BR-FranciscaNeural.
"""

import asyncio
import json
import subprocess
import sys
from pathlib import Path

import edge_tts


def duracao(arquivo: Path) -> float:
    saida = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(arquivo)],
        capture_output=True, text=True, check=True,
    )
    return float(saida.stdout.strip())


async def main() -> None:
    falas = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    pasta = Path(sys.argv[2])
    voz = sys.argv[3] if len(sys.argv) > 3 else "pt-BR-FranciscaNeural"
    pasta.mkdir(parents=True, exist_ok=True)
    duracoes = {}
    for i, fala in enumerate(falas):
        if not fala.strip():
            continue
        arquivo = pasta / f"fala-{i:02d}.mp3"
        await edge_tts.Communicate(fala, voz, rate="+2%").save(str(arquivo))
        duracoes[i] = round(duracao(arquivo), 2)
        print(f"fala {i + 1}/{len(falas)}: {duracoes[i]} s")
    (pasta / "duracoes.json").write_text(json.dumps(duracoes, indent=1), encoding="utf-8")
    print(f"narração: {sum(duracoes.values()) / 60:.1f} min")


if __name__ == "__main__":
    asyncio.run(main())
