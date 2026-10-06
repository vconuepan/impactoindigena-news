import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { origenDeImagen, claveDeRotulo, PREFIJO_MEDIO, PREFIJO_COMPUESTA, srcSetDeImagen, varianteWeb, ANCHOS_VARIANTE_WEB, type OrigenImagen } from './story-image'

/**
 * El rotulo de la imagen es una afirmacion sobre quien la hizo, y equivocarla
 * tiene dos costos distintos:
 *
 * - Rotular IA una foto del medio le quita la autoria a quien la tomo, en la
 *   misma pagina que invoca el art. 71 B para citarlo. Es el defecto que habia:
 *   112 de 154 imagenes de la portada del 7-sep-2026.
 * - Rotular «del medio» una imagen de IA es peor todavia: presenta como
 *   fotografia de un hecho real algo que ninguna camara registro.
 *
 * Por eso las dos direcciones se prueban, no solo la que fallaba.
 */

const BUCKET = 'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social'

describe('origenDeImagen distingue las tres cosas que viven en el bucket', () => {
  // URLs con la forma exacta que devuelve /api/homepage, medidas el 7-sep-2026.
  const CASOS: Array<[string, OrigenImagen, string]> = [
    [`${BUCKET}/oghero-11cfa890-1234-4abc-9def-000000000001.jpg`, 'medio', 'foto del medio rehospedada'],
    [`${BUCKET}/oghero-eeefd92b-1234-4abc-9def-000000000002.png`, 'medio', 'la extension no decide nada'],
    [`${BUCKET}/storycard-78790b57-1234-4abc-9def-000000000003.jpg`, 'compuesta', 'tarjeta con marca sobre la del medio'],
    [`${BUCKET}/82b3c4a2-428c-4b2a-8fb8-a27f05a4c6d2-1788347391559.png`, 'ia', 'generada por nosotros: uuid + timestamp'],
    [`${BUCKET}/4db5f83c-3ad3-4c70-9385-40f36176b2df-1788001700853.png`, 'ia', 'idem, otra real'],
    ['https://www.biobiochile.cl/media/2026/09/foto.jpg', 'externa', 'servida por el medio, fuera del bucket'],
  ]

  for (const [url, esperado, porque] of CASOS) {
    it(`${esperado.padEnd(9)} · ${porque}`, () => {
      expect(origenDeImagen(url)).toBe(esperado)
    })
  }

  it('sin imagen devuelve null, que no es lo mismo que «no se pudo clasificar»', () => {
    expect(origenDeImagen(null)).toBeNull()
    expect(origenDeImagen(undefined)).toBeNull()
    expect(origenDeImagen('')).toBeNull()
  })

  it('la cadena de consulta y el fragmento no confunden la clasificacion', () => {
    // Los cache-busters se usan al verificar despliegues en este proyecto.
    expect(origenDeImagen(`${BUCKET}/oghero-abc.jpg?v=2`)).toBe('medio')
    expect(origenDeImagen(`${BUCKET}/storycard-abc.jpg#x`)).toBe('compuesta')
  })

  it('un nombre que solo CONTIENE el prefijo no cuenta: tiene que empezar por el', () => {
    // Una imagen de IA cuyo uuid contuviera la palabra no debe pasar por foto
    // del medio. Se exige prefijo, no coincidencia suelta.
    expect(origenDeImagen(`${BUCKET}/abc-oghero-123.png`)).toBe('ia')
  })
})

describe('cada origen recibe su rotulo, y el rotulo existe en los dos idiomas', () => {
  const PAREJAS: Array<[OrigenImagen, string]> = [
    ['ia', 'storyPage.aiImage'],
    ['medio', 'storyPage.sourceImage'],
    ['compuesta', 'storyPage.composedImage'],
    ['externa', 'storyPage.sourceImage'],
  ]

  for (const [origen, clave] of PAREJAS) {
    it(`${origen.padEnd(9)} → ${clave}`, () => {
      expect(claveDeRotulo(origen)).toBe(clave)
    })
  }

  it('sin imagen no se rotula nada', () => {
    expect(claveDeRotulo(null)).toBeNull()
  })

  it('la de IA es la unica que NO acredita a un medio', () => {
    // Si alguien le pusiera {{publisher}} a la de IA, el rotulo diria que un
    // medio hizo una imagen que no hizo: el defecto original al reves.
    for (const locale of ['es', 'en']) {
      const json = JSON.parse(readFileSync(path.resolve(__dirname, `../locales/${locale}.json`), 'utf8'))
      expect(json.storyPage.aiImage, `${locale}: la etiqueta de IA no debe acreditar a un medio`).not.toContain('{{publisher}}')
    }
  })

  for (const locale of ['es', 'en']) {
    it(`${locale}.json tiene las tres cadenas, y las de credito interpolan el medio`, () => {
      // Una clave que falta no rompe la pagina: i18next imprime la clave cruda,
      // asi que el lector veria «storyPage.sourceImage» donde deberia ir el
      // credito. Falla en silencio, como casi todo lo de esta tanda.
      const json = JSON.parse(readFileSync(path.resolve(__dirname, `../locales/${locale}.json`), 'utf8'))
      for (const clave of ['aiImage', 'sourceImage', 'composedImage']) {
        expect(json.storyPage[clave], `falta storyPage.${clave} en ${locale}.json`).toBeTruthy()
      }
      expect(json.storyPage.sourceImage).toContain('{{publisher}}')
      expect(json.storyPage.composedImage).toContain('{{publisher}}')
    })
  }
})

describe('el contrato con el servidor, que es quien bautiza los objetos', () => {
  const servidor = path.resolve(__dirname, '../../../server/src/lib')

  it('el servidor sigue usando los dos prefijos que el cliente reconoce', () => {
    // Logica duplicada entre quien sube y quien rotula. Si alguien renombra el
    // objeto en el servidor y este test no existiera, el rotulo falso volveria
    // en silencio: la pagina seguiria viendose bien y diciendo lo que no es.
    const storyCard = readFileSync(path.join(servidor, 'storyCard.ts'), 'utf8')
    expect(storyCard, 'storyCard.ts dejo de usar el prefijo de la imagen del medio').toContain(`\`${PREFIJO_MEDIO}`)
    expect(storyCard, 'storyCard.ts dejo de usar el prefijo de la tarjeta compuesta').toContain(`\`${PREFIJO_COMPUESTA}`)

    const imageStorage = readFileSync(path.join(servidor, 'imageStorage.ts'), 'utf8')
    expect(imageStorage, 'imageStorage.ts dejo de usar el prefijo de la imagen del medio').toContain(`\`${PREFIJO_MEDIO}`)
  })

  it('la generacion de imagenes NO usa esos prefijos, o toda imagen de IA pasaria por foto ajena', () => {
    const imageGen = readFileSync(path.join(servidor, 'imageGen.ts'), 'utf8')
    expect(imageGen).not.toContain(PREFIJO_MEDIO)
    expect(imageGen).not.toContain(PREFIJO_COMPUESTA)
  })
})

describe('srcSetDeImagen — las variantes web que el servidor guarda junto a cada imagen', () => {
  const r2 = 'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/storycard-abc.jpg'

  it('deriva las dos variantes por convencion, siempre .jpg', () => {
    expect(varianteWeb(r2, 800)).toBe('https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/storycard-abc-w800.jpg')
    expect(varianteWeb('https://pub-x.r2.dev/social/oghero-1.png', 1200)).toBe('https://pub-x.r2.dev/social/oghero-1-w1200.jpg')
    expect(srcSetDeImagen(r2)).toBe(
      'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/storycard-abc-w800.jpg 800w, ' +
        'https://pub-9cecf62dfd8c4e5e9b7b30b54cc1acba.r2.dev/social/storycard-abc-w1200.jpg 1200w',
    )
  })

  it('una imagen externa, sin imagen o fuera de social/ no tiene srcset: va solo en src', () => {
    expect(srcSetDeImagen('https://media.biobiochile.cl/foto.jpg')).toBeNull()
    expect(srcSetDeImagen('https://pub-x.r2.dev/homepage.json')).toBeNull()
    expect(srcSetDeImagen('https://pub-x.r2.dev/social/sin-extension')).toBeNull()
    expect(srcSetDeImagen(null)).toBeNull()
    expect(srcSetDeImagen(undefined)).toBeNull()
  })

  it('el contrato con el servidor: mismos anchos, mismo sufijo, misma extension', () => {
    // El servidor bautiza las variantes y el cliente las adivina. Si uno cambia
    // sin el otro, cada tarjeta pediria una URL inexistente: un 404 por imagen,
    // en silencio, y el sitio volveria a servir los originales de 300-500 KB.
    const servidor = readFileSync(
      path.resolve(__dirname, '../../../server/src/lib/imagen-variantes.ts'),
      'utf8',
    )
    expect(servidor).toContain(`ANCHOS_VARIANTE_WEB = [${ANCHOS_VARIANTE_WEB.join(', ')}] as const`)
    expect(servidor).toContain('`-w${ancho}.jpg`')
    expect(servidor).toContain(String.raw`/\.(jpe?g|png|webp|gif)$/i`)
    expect(servidor).toContain(String.raw`/\.r2\.dev\/social\/[^/?#]+$/i`)
  })
})
