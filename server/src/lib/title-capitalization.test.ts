import { describe, it, expect } from 'vitest'
import { fixCapitalization, fixCapitalizationOrNull, fixTitleCapitalization } from './title-capitalization.js'

describe('fixCapitalization', () => {
  it('repara los titulares rotos que se encontraron en produccion', () => {
    expect(fixCapitalization('estudio de ufal reveló amenazas crecientes en tierras indígenas')).toBe(
      'estudio de UFAL reveló amenazas crecientes en tierras indígenas'
    )
    expect(fixCapitalization('conadi y corfo financian proyectos productivos indígenas en chile')).toBe(
      'CONADI y CORFO financian proyectos productivos indígenas en Chile'
    )
    expect(fixCapitalization('consultas indígenas avanzan en coahuila con comunidades reunidas')).toBe(
      'consultas indígenas avanzan en Coahuila con comunidades reunidas'
    )
  })

  it('corrige la sigla capitalizada a medias que dejaba el sentence case del cliente', () => {
    expect(fixCapitalization('Mpf pide acción contra el garimpo')).toBe('MPF pide acción contra el garimpo')
    expect(fixCapitalization('Ong pide justicia para pueblos miskitos')).toBe(
      'ONG pide justicia para pueblos miskitos'
    )
    expect(fixCapitalization('Conadi financia proyectos')).toBe('CONADI financia proyectos')
  })

  it('deja intacto lo que ya esta bien escrito', () => {
    const ok = 'CONADI y CORFO financian proyectos productivos indígenas en Chile'
    expect(fixCapitalization(ok)).toBe(ok)
  })

  it('no toca palabras que apenas contienen una sigla o un toponimo', () => {
    // El riesgo real de un reemplazo ciego: romper texto legitimo.
    expect(fixCapitalization('la delegación chilena viajó')).toBe('la delegación chilena viajó')
    expect(fixCapitalization('comunidades peruanas y bolivianas')).toBe('comunidades peruanas y bolivianas')
    expect(fixCapitalization('cooperación entre organizaciones')).toBe('cooperación entre organizaciones')
    expect(fixCapitalization('el mapuchazo del norte')).toBe('el mapuchazo del norte')
  })

  it('respeta los numerales pegados a una sigla', () => {
    expect(fixCapitalization('acuerdos de COP30 sobre bosques')).toBe('acuerdos de COP30 sobre bosques')
  })

  it('normaliza el articulo de La Araucania', () => {
    expect(fixCapitalization('lluvias dañaron la agricultura en la araucanía')).toBe(
      'lluvias dañaron la agricultura en La Araucanía'
    )
  })

  it('corrige los nombres que TERMINAN en vocal acentuada', () => {
    // El bug que dejo pasar un titular con "canada" en minuscula a produccion
    // el 15-ago-2026:
    // el `\b` de JS no reconoce la acentuada como caracter de palabra, asi que
    // estas cuatro entradas de la lista no coincidian nunca. Los nombres con
    // la tilde en el medio (Mexico, Michoacan) si funcionaban, por eso el
    // defecto era invisible en los tests que habia.
    expect(fixCapitalization('canadá avanzó en reclamación de tierras indígenas')).toBe(
      'Canadá avanzó en reclamación de tierras indígenas'
    )
    expect(fixCapitalization('acuerdo en perú sobre consulta previa')).toBe(
      'acuerdo en Perú sobre consulta previa'
    )
    expect(fixCapitalization('cumbre en panamá reúne a pueblos indígenas')).toBe(
      'cumbre en Panamá reúne a pueblos indígenas'
    )
    expect(fixCapitalization('pueblo guaraní recupera territorio')).toBe(
      'pueblo Guaraní recupera territorio'
    )
    expect(fixCapitalization('producción agrícola indígena en tarapacá')).toBe(
      'producción agrícola indígena en Tarapacá'
    )
  })

  it('no confunde una acentuada con el final de una sigla', () => {
    // Contrapartida del fix: con `\b` la tilde abria un borde falso y "bidé"
    // se convertia en "BIDé". Los lookarounds Unicode lo cierran.
    expect(fixCapitalization('un bidé en la sala')).toBe('un bidé en la sala')
  })

  it('cubre los terminos que faltaban y se publicaron rotos el 15-ago', () => {
    expect(fixCapitalization('semarnat exige consulta indígena en proyecto Xcaret')).toBe(
      'SEMARNAT exige consulta indígena en proyecto Xcaret'
    )
    expect(fixCapitalization('mujeres rurales en mozambique')).toBe('mujeres rurales en Mozambique')
    expect(fixCapitalization('derechos indígenas en india y nepal')).toBe(
      'derechos indígenas en India y Nepal'
    )
    expect(fixCapitalization('funai crea grupo técnico en amazonas')).toBe(
      'FUNAI crea grupo técnico en Amazonas'
    )
  })

  it('normaliza los toponimos de varias palabras', () => {
    expect(fixCapitalization('puente mejora la economía indígena en costa rica')).toBe(
      'puente mejora la economía indígena en Costa Rica'
    )
    expect(fixCapitalization('narcotráfico amenaza la seguridad en rapa nui')).toBe(
      'narcotráfico amenaza la seguridad en Rapa Nui'
    )
  })

  it('normaliza el articulo de La Guajira igual que el de La Araucania', () => {
    expect(fixCapitalization('foro une lideresas wayuu en la guajira')).toBe(
      'foro une lideresas wayuu en La Guajira'
    )
  })

  it('no altera un texto sin coincidencias', () => {
    const t = 'jóvenes defienden su territorio ancestral'
    expect(fixCapitalization(t)).toBe(t)
  })

  it('repara los titulos que el modelo siguio produciendo DESPUES del fix del esquema', () => {
    // Medido en produccion el 14-ago, con la regla reforzada ya desplegada:
    // 3 de 25 historias rastreadas despues del deploy seguian asi. La
    // instruccion del esquema es blanda; esto es el guardarrail duro.
    expect(fixCapitalization('universidad de chile impulsa congreso tecnológico indígena')).toBe(
      'universidad de Chile impulsa congreso tecnológico indígena'
    )
    expect(fixCapitalization('líderes indígenas enfrentan retroceso de derechos en chile')).toBe(
      'líderes indígenas enfrentan retroceso de derechos en Chile'
    )
    expect(fixCapitalization('violencia indígena en brasil creció un 22% en 2025')).toBe(
      'violencia indígena en Brasil creció un 22% en 2025'
    )
  })
})

describe('fixCapitalizationOrNull', () => {
  it('deja pasar null y cadena vacia sin romper', () => {
    expect(fixCapitalizationOrNull(null)).toBeNull()
    expect(fixCapitalizationOrNull(undefined)).toBeNull()
    expect(fixCapitalizationOrNull('')).toBeNull()
  })

  it('normaliza igual que la version estricta', () => {
    expect(fixCapitalizationOrNull('conadi financia proyectos')).toBe('CONADI financia proyectos')
  })
})

describe('fixTitleCapitalization', () => {
  // El hueco medido el 18-ago-2026: de 200 titulos publicados, **148 (74%)**
  // empezaban en minuscula, dia tras dia, contra la regla de DESIGN.md del
  // 12-jun-2026 ("Titulos en Title Case — NUNCA en minusculas").
  //
  // La causa no era el modelo desobedeciendo: la instruccion del esquema decia
  // "minusculas salvo nombres propios" sin exceptuar la primera letra, y el
  // modelo la cumplia al pie de la letra.

  it('capitaliza la primera letra del titular', () => {
    expect(fixTitleCapitalization('tribunal ambiental inspeccionó un proyecto minero')).toBe(
      'Tribunal ambiental inspeccionó un proyecto minero'
    )
  })

  it('sigue normalizando siglas y toponimos', () => {
    expect(fixTitleCapitalization('proyecto eléctrico en maule preocupa a conadi')).toBe(
      'Proyecto eléctrico en Maule preocupa a CONADI'
    )
  })

  it('no rompe un titular que empieza con sigla', () => {
    expect(fixTitleCapitalization('conadi entregó títulos de dominio')).toBe(
      'CONADI entregó títulos de dominio'
    )
  })

  it('respeta una palabra con mayuscula interna', () => {
    const t = 'iPhone llega a comunidades rurales'
    expect(fixTitleCapitalization(t)).toBe(t)
  })

  it('salta el signo de apertura y capitaliza la primera letra real', () => {
    expect(fixTitleCapitalization('¿quién defiende el territorio?')).toBe(
      '¿Quién defiende el territorio?'
    )
  })

  it('deja intacto un texto sin letras', () => {
    expect(fixTitleCapitalization('2026')).toBe('2026')
  })

  it('no toca un titular que empieza con una cifra', () => {
    // Buscar "la primera letra" a secas saltaba los digitos y capitalizaba la
    // palabra equivocada: «20% del pescado...» se convertia en «20% Del
    // pescado...». Detectado en la simulacion sobre los 2648 titulos
    // publicados, antes de escribir en la base.
    const a = '20% del pescado vendido está mal identificado, alerta ONU'
    expect(fixTitleCapitalization(a)).toBe(a)
    const b = '13% de áreas biodiversas solapadas por proyectos de carbono'
    expect(fixTitleCapitalization(b)).toBe(b)
    expect(fixTitleCapitalization('2026 será el año de la consulta')).toBe(
      '2026 será el año de la consulta'
    )
  })

  it('capitaliza dentro de comillas de apertura', () => {
    expect(fixTitleCapitalization('"citas" al inicio del titular')).toBe(
      '"Citas" al inicio del titular'
    )
  })

  it('no capitaliza el gentilicio usado como adjetivo', () => {
    // En espanol "wayuu", "huilliche" o "pehuenche" van en minuscula cuando
    // funcionan como adjetivo. Capitalizarlos produce "rana Pehuenche".
    expect(fixTitleCapitalization('comunidad huilliche defendió la rana pehuenche')).toBe(
      'Comunidad huilliche defendió la rana pehuenche'
    )
  })

  it('no toca un titular que ya viene bien escrito', () => {
    const t = 'Jóvenes defienden su territorio ancestral'
    expect(fixTitleCapitalization(t)).toBe(t)
  })
})
