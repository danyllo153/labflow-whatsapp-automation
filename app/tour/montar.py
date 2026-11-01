"""Junta o vídeo gravado (tour.webm) com a narração de cada passo no quadro certo e gera o tour.mp4.

Uso: python montar.py pasta-da-gravacao [pasta-da-narracao]
  lê tour.webm e linha-do-tempo.json da gravação, e fala-NN.mp3 da narração (sem ela, sai o vídeo sem som).

Sincronia: o vídeo do navegador não anda no ritmo do relógio (perde quadros quando a máquina está ocupada), então os tempos
medidos pelo gravar.mjs se afastam do vídeo ao longo da gravação. Por isso cada passo deixa uma marca no canto de baixo à
esquerda (o número do passo em binário, 6 quadradinhos de 8 px) e este script procura no PRÓPRIO vídeo o primeiro quadro
de cada marca. A marca é coberta no vídeo final.
"""

import json
import subprocess
import sys
from pathlib import Path

QUADROS_POR_SEGUNDO = 25
LARGURA, ALTURA = 1280, 720
MARCA = (48, 8)  # 6 quadradinhos de 8 x 8 px
COR_DO_MENU = "0x1e283d"


def inicios_pela_marca(video: Path) -> dict[int, float]:
    """{passo: segundo do vídeo em que a legenda dele apareceu}, lendo a marca quadro a quadro."""
    w, h = MARCA
    bruto = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video), "-vf",
         f"fps={QUADROS_POR_SEGUNDO},crop={w}:{h}:0:{ALTURA - h},scale=6:1:flags=area,format=gray", "-f", "rawvideo", "-"],
        capture_output=True, check=True,
    ).stdout
    inicios: dict[int, float] = {}
    for k in range(len(bruto) // 6):
        bits = bruto[k * 6:(k + 1) * 6]
        n = sum(1 << i for i, b in enumerate(bits) if b > 128)
        if n and (n - 1) not in inicios:
            inicios[n - 1] = k / QUADROS_POR_SEGUNDO
    return inicios


def main() -> None:
    gravacao = Path(sys.argv[1])
    narracao = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    video = gravacao / "tour.webm"
    passos = json.loads((gravacao / "linha-do-tempo.json").read_text(encoding="utf-8"))["passos"]
    inicios = inicios_pela_marca(video)
    faltando = [p["passo"] + 1 for p in passos if p["passo"] not in inicios]
    if faltando:
        print(f"aviso: marca não achada nos passos {faltando}; usando o relógio da gravação neles")
    entradas = ["-i", str(video)]
    filtros = [f"[0:v]drawbox=x=0:y={ALTURA - MARCA[1]}:w={MARCA[0]}:h={MARCA[1]}:color={COR_DO_MENU}:t=fill[v]"]
    rotulos = []
    for item in passos:
        fala = narracao / f"fala-{item['passo']:02d}.mp3" if narracao else None
        if fala is None or not fala.exists():
            continue
        k = len(rotulos) + 1
        entradas += ["-i", str(fala)]
        atraso = int(inicios.get(item["passo"], item["inicio"]) * 1000) + 250  # um respiro depois da moldura aparecer
        filtros.append(f"[{k}:a]adelay={atraso}|{atraso}[a{k}]")
        rotulos.append(f"[a{k}]")
    codec = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart"]
    mapa = ["-map", "[v]"]
    if rotulos:
        filtros.append("".join(rotulos) + f"amix=inputs={len(rotulos)}:normalize=0,apad[audio]")
        mapa += ["-map", "[audio]", "-c:a", "aac", "-b:a", "160k", "-shortest"]
    saida = gravacao / "tour.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", *entradas, "-filter_complex", ";".join(filtros), *mapa, *codec, str(saida)], check=True)
    print(f"pronto: {saida} ({len(inicios)} de {len(passos)} passos sincronizados pela marca)")


if __name__ == "__main__":
    main()
