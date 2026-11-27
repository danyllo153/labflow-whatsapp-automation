"""Teste do icone gerado da logo (imagem FICTICIA: circulo em cima e um retangulo como texto embaixo; nunca a logo real).
Uso: python -m pytest app/lite/test_icone_marca.py"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lite  # noqa: E402


def _logo(pasta: Path, tam=(300, 424), fundo=(0, 0, 0, 0)) -> None:
    im = Image.new("RGBA", tam, fundo)
    d = ImageDraw.Draw(im)
    d.ellipse((20, 10, tam[0] - 20, tam[0]), fill=(240, 160, 30, 255))
    d.rectangle((10, tam[0] + 30, tam[0] - 10, tam[1] - 10), fill=(30, 40, 80, 255))
    im.save(pasta / "logo.png")


def test_so_o_simbolo_quadrado_e_centralizado(tmp_path):
    _logo(tmp_path)  # circulo de 260 px no topo; retangulo (o "nome") a partir de y=330
    assert lite.gerar_icone_da_logo(tmp_path)
    ico = Image.open(tmp_path / "icone.ico")
    assert sorted(ico.info["sizes"]) == [(16, 16), (32, 32), (48, 48), (256, 256)]
    png = Image.open(tmp_path / "icone.png")
    assert png.size == (512, 512)
    assert png.getpixel((256, 256))[3] > 0 and png.getpixel((2, 2))[3] == 0
    cor_nome = (30, 40, 80, 255)
    assert all(png.getpixel((256, y)) != cor_nome for y in range(0, 512, 8)), "o nome nao pode aparecer no icone"


def test_fundo_branco_tambem_recorta(tmp_path):
    _logo(tmp_path, (300, 424), (255, 255, 255, 255))
    assert lite.gerar_icone_da_logo(tmp_path)
    png = Image.open(tmp_path / "icone-512.png")
    assert all(png.getpixel((256, y)) != (30, 40, 80, 255) for y in range(0, 512, 8))


def test_sem_separacao_usa_a_logo_inteira(tmp_path):
    im = Image.new("RGBA", (200, 300), (0, 0, 0, 0))
    ImageDraw.Draw(im).rectangle((10, 10, 190, 290), fill=(30, 40, 80, 255))
    im.save(tmp_path / "logo.png")
    assert lite.gerar_icone_da_logo(tmp_path)
    png = Image.open(tmp_path / "icone.png")
    assert png.getpixel((256, 256)) == (30, 40, 80, 255)


def test_sem_logo_ou_com_erro_apaga_e_devolve_falso(tmp_path):
    (tmp_path / "icone.ico").write_bytes(b"velho")
    assert not lite.gerar_icone_da_logo(tmp_path)
    assert not (tmp_path / "icone.ico").exists()
    (tmp_path / "logo.png").write_bytes(b"nao e imagem")
    assert not lite.gerar_icone_da_logo(tmp_path)


def test_logo_enorme_cai_no_neutro(tmp_path):
    Image.new("RGBA", (4500, 20), (255, 0, 0, 255)).save(tmp_path / "logo.png")  # acima de 4000 px de lado, mas leve
    assert not lite.gerar_icone_da_logo(tmp_path)
    assert not (tmp_path / "icone.ico").exists()


def test_arquivo_acima_de_2_mb_cai_no_neutro(tmp_path):
    _logo(tmp_path)
    with open(tmp_path / "logo.png", "ab") as f:
        f.write(b"0" * (2 * 1024 * 1024 + 1))
    assert not lite.gerar_icone_da_logo(tmp_path)
