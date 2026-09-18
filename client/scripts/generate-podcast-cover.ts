import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

/*
 * La caratula del podcast.
 *
 * POR QUE EXISTE. Hasta el 17-sep-2026 el feed no declaraba `itunes:image`, y
 * Apple Podcasts RECHAZA un feed sin caratula: no es un detalle estetico, es la
 * condicion para estar en el directorio. El resto del feed estaba bien formado.
 *
 * LAS REGLAS DE APPLE, que mandan sobre cualquier preferencia de diseno:
 * cuadrada, entre 1400x1400 y 3000x3000, JPEG o PNG, espacio de color RGB.
 * Y una que no esta escrita pero decide: **se ve a 55 px en un telefono**, asi
 * que solo sobreviven un simbolo y dos palabras. Nada de bajadas ni URLs.
 */
const SIZE = 3000;

// Tokens de DESIGN.md
const BRAND_800 = '#0D5F3C'; // verde editorial principal
const GOLD = '#D9A226'; // el anillo del emblema, para la linea divisoria

const DISPLAY = "'Fraunces', Georgia, serif";

async function generatePodcastCover() {
  const outputPath = path.join(publicDir, 'images', 'podcast-cover.jpg');
  const emblemPath = path.join(publicDir, 'images', 'logo-sello.svg');

  const EMBLEM = Math.round(SIZE * 0.44);
  const emblem = await sharp(emblemPath, { density: 600 })
    .resize({ width: EMBLEM })
    .toBuffer();

  const emblemLeft = Math.round((SIZE - EMBLEM) / 2);
  const emblemTop = Math.round(SIZE * 0.14);

  const rulerY = emblemTop + EMBLEM + Math.round(SIZE * 0.075);
  const rulerW = Math.round(SIZE * 0.2);

  const line1Y = rulerY + Math.round(SIZE * 0.115);
  const line2Y = line1Y + Math.round(SIZE * 0.125);

  const textSvg = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .marca {
          font-family: ${DISPLAY};
          font-size: ${Math.round(SIZE * 0.125)}px;
          font-weight: 700;
          fill: #FFFFFF;
        }
        .marca-it {
          font-family: ${DISPLAY};
          font-size: ${Math.round(SIZE * 0.125)}px;
          font-weight: 700;
          font-style: italic;
          fill: #FFFFFF;
        }
      </style>
      <rect x="${(SIZE - rulerW) / 2}" y="${rulerY}" width="${rulerW}" height="${Math.round(SIZE * 0.004)}" fill="${GOLD}"/>
      <text x="${SIZE / 2}" y="${line1Y}" text-anchor="middle" class="marca">Voces</text>
      <text x="${SIZE / 2}" y="${line2Y}" text-anchor="middle" class="marca-it">Indígenas</text>
    </svg>
  `;

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: BRAND_800,
    }
  })
    .composite([
      { input: emblem, top: emblemTop, left: emblemLeft },
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ])
    // toColourspace('srgb') explicito: Apple exige RGB y rechaza CMYK.
    .toColourspace('srgb')
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toFile(outputPath);

  console.log(`Generated podcast-cover.jpg (${SIZE}x${SIZE})`);
}

generatePodcastCover().catch(console.error);
