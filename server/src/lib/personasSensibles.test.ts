import { describe, it, expect } from 'vitest'
import { limpiarAtribucionDeCita, limpiarTextoSobrePersonas, limpiarCampos } from './personasSensibles.js'

// Los casos tienen la forma de los medidos el 6-nov-2026 en las 500 notas más
// recientes, con nombres inventados: el repo es público y la medición se hizo
// con los nombres borrados.

describe('la atribución de la cita no le pone pueblo a la persona', () => {
  it.each([
    ['Ana Ruiz, activista climática indígena', 'Ana Ruiz, activista climática'],
    ['Pedro Soto, líder indígena Mayo-Yoreme', 'Pedro Soto, líder'],
    ['Laura Díaz, docente indígena del Amazonas y miembro del pueblo Mura', 'Laura Díaz, docente del Amazonas'],
    ['Mario Paz, líder kichwa de Sarayaku', 'Mario Paz, líder de Sarayaku'],
    ['Juan Rojas, productor agroecológico mapuche huilliche', 'Juan Rojas, productor agroecológico'],
    ['Rosa Lima, líder shipibo-conibo', 'Rosa Lima, líder'],
    ['Eva Mora, diseñadora afro-indígena', 'Eva Mora, diseñadora'],
    ['Luis Vera, músico e investigador mapuche', 'Luis Vera, músico e investigador'],
    ['Sara Gil, periodista y activista indígena ñomndaa', 'Sara Gil, periodista y activista'],
    ['Ana Ruiz, senadora electa y mujer indígena', 'Ana Ruiz, senadora electa'],
    ['Inés Toro, comediante indígena', 'Inés Toro, comediante'],
    ['Inés Toro, mujer indígena', 'Inés Toro'],
    ['Pablo Ríos, líder indígena Kerambai Dayak de Borneo', 'Pablo Ríos, líder de Borneo'],
    ['Marta Vidal, congresista indígena electa de Ysleta Del Sur Pueblo', 'Marta Vidal, congresista electa de Ysleta Del Sur Pueblo'],
    ['Rosa Lima, referente mapuche y defensora del pueblo mapuche', 'Rosa Lima, referente y defensora del pueblo mapuche'],
    ['Elena Cruz, lideresa indígena cabécar', 'Elena Cruz, lideresa'],
    ['Tomás Leal, dirigente mapuche williche', 'Tomás Leal, dirigente'],
    ['Tomás Leal, joven indígena del Yukon', 'Tomás Leal, joven del Yukon'],
  ])('%s', (antes, despues) => {
    const r = limpiarAtribucionDeCita(antes)
    expect(r.texto).toBe(despues)
    expect(r.cambios.length).toBeGreaterThan(0)
    expect(new Set(r.cambios)).toEqual(new Set(['pertenencia']))
  })

  // Los 16 cargos y oficinas medidos: nombran a los pueblos sin atribuirle
  // etnia a nadie. Son la prueba negativa del candado.
  it.each([
    'Ana Ruiz, ex defensora adjunta para el Medio Ambiente, Servicios Públicos y Pueblos Indígenas de la Defensoría del Pueblo',
    'Pedro Soto, titular de Pueblos Indígenas de Brasil',
    'Laura Díaz, jefa de carrera Pedagogía en Lengua y Cultura Mapuche de la UCT',
    'Juan Rojas, presidente de la Organización de Docentes Indígenas de Misiones',
    'Rosa Lima, integrante del Espacio de Articulación Mapuche y Construcción Política',
    'Ana Ruiz, presidenta electa de la Nación Navajo',
    'Eva Mora, activista indígena de la Coordinadora de Comunidades del Sur',
    'Sara Gil, emprendedora de moda indígena',
    'Pedro Soto, vocero de presos políticos mapuche',
    'Inés Toro, profesional agrícola vinculada al patrimonio mapuche-pehuenche',
    'Pablo Ríos, artesano originario de Cuajinicuilapa',
    'Marta Vidal, que se identifica como mapuche',
    'Organización Mundial de la Salud',
    'Artículo original',
  ])('no toca: %s', (atribucion) => {
    const r = limpiarAtribucionDeCita(atribucion)
    expect(r.texto).toBe(atribucion)
    expect(r.cambios).toEqual([])
  })

  it('una autoridad tradicional la presenta su comunidad: no se toca', () => {
    expect(limpiarAtribucionDeCita('Mario Paz, logko comunitario mapuche').texto).toBe('Mario Paz, logko comunitario mapuche')
    expect(limpiarAtribucionDeCita('Luis Vera, cacique y concejal indígena Guaraní-Kaiowa').cambios).toEqual([])
  })

  it('sin atribución no hay nada que limpiar', () => {
    expect(limpiarAtribucionDeCita(null).texto).toBeNull()
    expect(limpiarAtribucionDeCita('').texto).toBe('')
  })
})

describe('títulos, resúmenes y posts no le ponen pueblo a una persona', () => {
  it.each([
    ['El comunero mapuche Juan Rojas fue detenido en Ercilla.', 'El comunero Juan Rojas fue detenido en Ercilla.'],
    ['Según la lideresa indígena Ana Ruiz, la consulta no se hizo.', 'Según la lideresa Ana Ruiz, la consulta no se hizo.'],
    ['La muestra del artista yanomami Davi Ruiz llega a Lima.', 'La muestra del artista Davi Ruiz llega a Lima.'],
    ['Lo dijo el mapuche Juan Rojas en la audiencia.', 'Lo dijo Juan Rojas en la audiencia.'],
    ['Mapuche leader Juan Rojas said the land was taken.', 'Leader Juan Rojas said the land was taken.'],
    ['The protest was led by Indigenous activist Jane Doe.', 'The protest was led by activist Jane Doe.'],
    ['Cuatro hombres fueron condenados por el asesinato del líder indígena kichwa Juan Rojas.', 'Cuatro hombres fueron condenados por el asesinato del líder Juan Rojas.'],
  ])('%s', (antes, despues) => {
    const r = limpiarTextoSobrePersonas(antes)
    expect(r.texto).toBe(despues)
    expect(r.cambios).toEqual(['pertenencia'])
  })

  it.each([
    'La comunidad mapuche Pedro Rojas presentó su plan de manejo.',
    'El pueblo wayuu demanda agua para La Guajira.',
    'El werken mapuche Juan Rojas habló en la ceremonia.',
    'Mujeres indígenas Quechua marchan en Lima.',
    'Leyes clave protegen a niños indígenas en Estados Unidos y Canadá.',
    'El Ministerio de los Pueblos Indígenas de Brasil anunció fondos.',
    'Comunidades indígenas de Nariño denuncian minas antipersonal.',
    // Falsos positivos de la primera versión, medidos el 6-nov sobre las 500:
    // no son personas, o la palabra con mayúscula es un lugar o un pueblo.
    'Juzgado ordena protección policial en disputa Mapuche en Neuquén',
    'Organizaciones exigen justicia para el pueblo Garífuna en Honduras',
    'Respaldo internacional fortalece defensa indígena Ngäbe-Buglé',
    'Los pescadores indígenas Baniwa en la Amazonía conviven con nutrias gigantes.',
    'La cooperativa mapuche huilliche Rayen Sur elabora pastas con hongos silvestres.',
    'Participaron agrupaciones folclóricas, incluido el grupo mapuche Rayen Sur.',
    'Destaca el documental indígena Mundurukuyü sobre la vida de la comunidad.',
    'Bangsamoro, región con población indígena Moro en Filipinas.',
  ])('no toca: %s', (texto) => {
    const r = limpiarTextoSobrePersonas(texto)
    expect(r.texto).toBe(texto)
    expect(r.cambios).toEqual([])
  })

  it('una cita no se reescribe por la pertenencia', () => {
    const cita = 'Como comunero mapuche Juan Rojas lo vio todo'
    expect(limpiarTextoSobrePersonas(cita, { esCita: true }).texto).toBe(cita)
  })

  it('un post conserva sus saltos de línea', () => {
    const r = limpiarTextoSobrePersonas('El comunero mapuche Juan Rojas fue liberado.\n\n#PueblosIndígenas #Chile')
    expect(r.texto).toBe('El comunero Juan Rojas fue liberado.\n\n#PueblosIndígenas #Chile')
  })
})

describe('menores y víctimas, por su rol (art. 33, Ley 19.733)', () => {
  it('quita el nombre de la niña en una nota de violencia', () => {
    const r = limpiarTextoSobrePersonas('La niña Ana Ruiz, de 12 años, fue atacada en su comunidad.')
    expect(r.texto).toBe('La niña, de 12 años, fue atacada en su comunidad.')
    expect(r.cambios).toEqual(['menor'])
  })

  it('quita el nombre de la víctima de un delito sexual', () => {
    const r = limpiarTextoSobrePersonas('La víctima Ana Ruiz denunció la violación ante la fiscalía.')
    expect(r.texto).toBe('La víctima denunció la violación ante la fiscalía.')
    expect(r.cambios).toEqual(['victima'])
  })

  it('sin delito ni violencia, «la niña» con su nombre no se toca', () => {
    const texto = 'La niña Ana Ruiz ganó el concurso de poesía en mapudungun.'
    expect(limpiarTextoSobrePersonas(texto).texto).toBe(texto)
  })

  it('lo que no sabe editar lo cuenta como sospecha, sin tocar el texto', () => {
    const texto = 'Juan Rojas, de 15 años, fue detenido tras la protesta.'
    const r = limpiarTextoSobrePersonas(texto)
    expect(r.texto).toBe(texto)
    expect(r.sospechas).toBe(1)
  })
})

describe('limpiarCampos, para el punto de escritura', () => {
  it('limpia cada campo según su clase y resume sin texto', () => {
    const { registro, resumen } = limpiarCampos(
      {
        title: 'El comunero mapuche Juan Rojas fue liberado',
        quote: 'Como comunero mapuche Juan Rojas lo vio todo',
        quoteAttribution: 'Ana Ruiz, activista climática indígena',
        relevance: 7,
      },
      { texto: ['title'], citas: ['quote'], atribuciones: ['quoteAttribution'] },
    )
    expect(registro.title).toBe('El comunero Juan Rojas fue liberado')
    expect(registro.quote).toBe('Como comunero mapuche Juan Rojas lo vio todo')
    expect(registro.quoteAttribution).toBe('Ana Ruiz, activista climática')
    expect(registro.relevance).toBe(7)
    expect(resumen.hubo).toBe(true)
    expect(Object.keys(resumen.campos).sort()).toEqual(['quoteAttribution', 'title'])
    expect(JSON.stringify(resumen)).not.toMatch(/Rojas|Ruiz/)
  })

  it('sin nada que limpiar devuelve el mismo contenido', () => {
    const { registro, resumen } = limpiarCampos({ title: 'Comunidad recupera tierras' }, { texto: ['title'] })
    expect(registro).toEqual({ title: 'Comunidad recupera tierras' })
    expect(resumen.hubo).toBe(false)
  })
})
