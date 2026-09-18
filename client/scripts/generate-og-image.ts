import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import { BRAND, SITE_HOST } from '../src/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

// OG image dimensions (recommended for social sharing)
const WIDTH = 1200;
const HEIGHT = 630;

/*
 * Tokens de DESIGN.md, no colores sueltos.
 *
 * POR QUE EL DOMINIO NO VA ESCRITO A MANO. La imagen que se sirvio hasta el
 * 17-sep-2026 llevaba `impactoindigena.news` pintado encima y el logotipo de
 * la marca anterior: se genero una vez, antes del rebrand, y nadie volvio a
 * correr el script. Como es un PNG estatico, ningun `VITE_SITE_URL` la
 * corrige — quien recibia un enlace del sitio veia la marca vieja aunque el
 * `og:url` ya dijera vocesindigenas.org. Leyendo el host de la configuracion,
 * un cambio de dominio deja de exigir que alguien se acuerde de este archivo.
 */
const PAPER = '#FAFAF8'; // fondo global, blanco calido
const BRAND_800 = '#0D5F3C'; // verde editorial principal
const NEUTRAL_900 = '#1C1917'; // negro calido, texto principal
const NEUTRAL_500 = '#6B645F'; // texto secundario

// Los ocho colores de categoria, en el orden de DESIGN.md
const CATEGORY_COLORS = [
  '#5F7328', // oliva profundo
  '#15803D', // verde bosque
  '#1A6B8A', // pizarra
  '#8A6410', // ocre tierra
  '#B84236', // terracota
  '#7A2733', // granate
  '#8E4585', // ciruela
  '#7A4A2B', // cafe tostado
];

// Fraunces es la display de la marca; Georgia la sigue de cerca en metricas
// (ver el respaldo metrico de client/src/index.css) si el sistema no la tiene.
const DISPLAY = "'Fraunces', Georgia, serif";
const TEXT = "'DM Sans', system-ui, -apple-system, sans-serif";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function generateOgImage() {
  const outputPath = path.join(publicDir, 'images', 'og-image.png');
  const logoPath = path.join(publicDir, 'images', 'logo-horizontal.png');

  // Resize logo large — OG images are displayed small, so fill the space
  const LOGO_WIDTH = 620;
  const logo = await sharp(logoPath)
    .resize({ width: LOGO_WIDTH })
    .toBuffer();

  const logoMeta = await sharp(logo).metadata();
  const logoHeight = logoMeta.height || 210;

  // Center the logo horizontally, position near top
  const logoLeft = Math.round((WIDTH - LOGO_WIDTH) / 2);
  const logoTop = 118;

  // Taglines positioned below logo with tighter spacing
  const taglineY = logoTop + logoHeight + 88;
  const subtitleY = taglineY + 50;
  const urlY = subtitleY + 78;

  // Strip trailing period for display
  const claim = escapeXml(BRAND.claim.replace(/\.$/, ''));
  const claimSupport = escapeXml(BRAND.claimSupport.replace(/\.$/, ''));
  const host = escapeXml(SITE_HOST);

  const textSvg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .tagline {
          font-family: ${DISPLAY};
          font-size: 42px;
          font-weight: 600;
          fill: ${NEUTRAL_900};
        }
        .subtitle {
          font-family: ${TEXT};
          font-size: 26px;
          font-weight: 400;
          fill: ${NEUTRAL_500};
        }
        .url {
          font-family: ${TEXT};
          font-size: 30px;
          font-weight: 600;
          letter-spacing: 0.02em;
          fill: ${BRAND_800};
        }
      </style>
      <text x="${WIDTH / 2}" y="${taglineY}" text-anchor="middle" class="tagline">${claim}</text>
      <text x="${WIDTH / 2}" y="${subtitleY}" text-anchor="middle" class="subtitle">${claimSupport}</text>
      <text x="${WIDTH / 2}" y="${urlY}" text-anchor="middle" class="url">${host}</text>
    </svg>
  `;

  // Color strip top and bottom using the 8 category colors
  const STRIP_HEIGHT = 14;
  const segmentWidth = WIDTH / CATEGORY_COLORS.length;
  const strip = Buffer.from(
    `<svg width="${WIDTH}" height="${STRIP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      ${CATEGORY_COLORS.map((color, i) =>
        `<rect x="${i * segmentWidth}" width="${segmentWidth + 1}" height="${STRIP_HEIGHT}" fill="${color}"/>`
      ).join('\n      ')}
    </svg>`
  );

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: PAPER,
    }
  })
    .composite([
      { input: strip, top: 0, left: 0 },
      { input: strip, top: HEIGHT - STRIP_HEIGHT, left: 0 },
      { input: logo, top: logoTop, left: logoLeft },
      { input: Buffer.from(textSvg), top: 0, left: 0 }
    ])
    .png()
    .toFile(outputPath);

  console.log(`Generated og-image.png (${WIDTH}x${HEIGHT}) for ${SITE_HOST}`);
}

generateOgImage().catch(console.error);
