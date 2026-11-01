"""Junta o vídeo gravado (tour.webm) com a narração de cada passo no momento certo e gera o tour.mp4.

Uso: python montar.py pasta-da-gravacao [pasta-da-narracao]
  lê tour.webm e linha-do-tempo.json da gravação, e fala-NN.mp3 da narração (sem ela, sai o vídeo sem som).
"""

import json
import subprocess
import sys
from pathlib import Path


def main() -> None:
    gravacao = Path(sys.argv[1])
    narracao = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    dados = json.loads((gravacao / "linha-do-tempo.json").read_text(encoding="utf-8"))
    linha = dados["passos"]
    video = gravacao / "tour.webm"
    total = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)], capture_output=True, text=True, check=True
    ).stdout)
    corte = max(0.0, total - dados["fim"])  # o navegador abrindo, antes do primeiro passo
    entradas = ["-ss", f"{corte:.2f}", "-i", str(video)]
    filtros, rotulos = [], []
    for item in linha:
        fala = narracao / f"fala-{item['passo']:02d}.mp3" if narracao else None
        if fala is None or not fala.exists():
            continue
        k = len(rotulos) + 1
        entradas += ["-i", str(fala)]
        atraso = int(item["inicio"] * 1000) + 250  # um respiro depois da moldura aparecer
        filtros.append(f"[{k}:a]adelay={atraso}|{atraso}[a{k}]")
        rotulos.append(f"[a{k}]")
    saida = gravacao / "tour.mp4"
    comando = ["ffmpeg", "-y", "-v", "error", *entradas]
    codec = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart"]
    if rotulos:
        filtros.append("".join(rotulos) + f"amix=inputs={len(rotulos)}:normalize=0,apad[audio]")
        comando += ["-filter_complex", ";".join(filtros), "-map", "0:v", "-map", "[audio]", *codec, "-c:a", "aac", "-b:a", "160k", "-shortest"]
    else:
        comando += ["-map", "0:v", *codec]
    subprocess.run([*comando, str(saida)], check=True)
    print(f"pronto: {saida}")


if __name__ == "__main__":
    main()
