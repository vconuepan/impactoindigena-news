"""
Genera las piezas de marca de Impacto Indígena News desde dos fuentes:

  - `estrella-grupo.png` (esta carpeta): la estrella de Impacto Indígena, recortada el
    25-nov-2026 de `impactoindigena/public/logo-horizontal.png` (4662x2336), con el fondo
    transparente y los pétalos blancos del centro intactos. Es el mismo signo que usa
    impactoindigena.legal.
  - `public/fonts/LibreCaslonDisplay/libre-caslon-display.woff2`: la letra del logotipo,
    la misma de «Impacto Indígena Legal» (OFL).

Decisión del director, 25-nov-2026: «News» en el verde del medio (`#0D5F3C`), no en el
dorado de .legal: el dorado da 2,66:1 sobre la cabecera blanca y el verde 7,72:1. Sobre
fondo oscuro «News» va en `#A7E3BF` (5,3:1 sobre el verde del boletín, 12:1 sobre el pie).

Uso, desde la raíz del repo:

    python3 client/scripts/marca/generar-marca.py

Escribe en `client/public/` y `client/public/images/`. Después correr
`npm run images:og --prefix client`, que arma la imagen para redes con el logotipo nuevo.
Requiere Pillow y fontTools (con brotli para leer el woff2).
"""
import io
import os

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PUBLICO = os.path.join(RAIZ, 'public')
IMAGENES = os.path.join(PUBLICO, 'images')
ESTRELLA = Image.open(os.path.join(os.path.dirname(__file__), 'estrella-grupo.png')).convert('RGBA')

TINTA = (28, 25, 23)        # neutral-900, negro cálido de DESIGN.md
VERDE = (13, 95, 60)        # brand-800
BLANCO = (255, 255, 255)
VERDE_CLARO = (167, 227, 191)  # #A7E3BF, «News» sobre fondo oscuro

NOMBRE = 'Impacto Indígena '
ACENTO = 'News'


def fuente(tamano: int) -> ImageFont.FreeTypeFont:
    f = TTFont(os.path.join(PUBLICO, 'fonts', 'LibreCaslonDisplay', 'libre-caslon-display.woff2'))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, tamano)


def estrella(lado: int) -> Image.Image:
    return ESTRELLA.resize((lado, lado), Image.LANCZOS)


def recortar(im: Image.Image, margen: int) -> Image.Image:
    caja = im.getbbox()
    im = im.crop(caja)
    out = Image.new('RGBA', (im.width + 2 * margen, im.height + 2 * margen), (0, 0, 0, 0))
    out.paste(im, (margen, margen), im)
    return out


def horizontal(tinta, acento, tamano=220) -> Image.Image:
    """Estrella + «Impacto Indígena News» en una línea, fondo transparente.
    Proporción tomada de .legal: la estrella mide ~1,9 veces el cuerpo de la letra."""
    f = fuente(tamano)
    lado = int(tamano * 1.9)
    hueco = int(tamano * 0.30)
    medida = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    ancho_nombre = medida.textlength(NOMBRE, font=f)
    ancho_total = lado + hueco + int(ancho_nombre + medida.textlength(ACENTO, font=f)) + 40
    alto = lado + 40
    im = Image.new('RGBA', (ancho_total, alto), (0, 0, 0, 0))
    im.paste(estrella(lado), (0, 20), estrella(lado))
    d = ImageDraw.Draw(im)
    # Línea base: la altura de mayúscula queda centrada respecto de la estrella.
    asc, _ = f.getmetrics()
    cap = f.getbbox('I')[3] - f.getbbox('I')[1]
    base = 20 + lado // 2 + cap // 2
    x = lado + hueco
    d.text((x, base), NOMBRE, font=f, fill=tinta, anchor='ls')
    d.text((x + ancho_nombre, base), ACENTO, font=f, fill=acento, anchor='ls')
    return recortar(im, 8)


def cuadrado(lado: int, fondo=None, margen=0.08) -> Image.Image:
    im = Image.new('RGBA', (lado, lado), fondo or (0, 0, 0, 0))
    interior = int(lado * (1 - 2 * margen))
    e = estrella(interior)
    off = (lado - interior) // 2
    im.paste(e, (off, off), e)
    return im


def guardar(im: Image.Image, *ruta):
    destino = os.path.join(*ruta)
    im.save(destino, optimize=True)
    print('escrito', os.path.relpath(destino, RAIZ), im.size)


def main():
    # Logotipo horizontal: claro (cabecera, JSON-LD, og-image) y blanco (boletín, carruseles).
    guardar(horizontal(TINTA, VERDE), IMAGENES, 'logo-horizontal.png')
    guardar(horizontal(BLANCO, VERDE_CLARO), IMAGENES, 'logo-horizontal-blanco.png')
    # Emblema: tarjetas sin foto, widget incrustado, cabecera del sitio.
    guardar(cuadrado(512), IMAGENES, 'logo-no-text-square.png')
    guardar(cuadrado(192, margen=0.0), IMAGENES, 'logo-estrella.png')
    # Íconos. Apple no admite transparencia: fondo blanco.
    guardar(cuadrado(180, fondo=(255, 255, 255, 255)), PUBLICO, 'apple-touch-icon.png')
    guardar(cuadrado(192), PUBLICO, 'android-chrome-192x192.png')
    guardar(cuadrado(512), PUBLICO, 'android-chrome-512x512.png')
    guardar(cuadrado(32, margen=0.0), PUBLICO, 'favicon-32x32.png')
    guardar(cuadrado(16, margen=0.0), PUBLICO, 'favicon-16x16.png')
    ico = cuadrado(64, margen=0.0)
    ico.save(os.path.join(PUBLICO, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    print('escrito public/favicon.ico (16, 32, 48)')


if __name__ == '__main__':
    main()
