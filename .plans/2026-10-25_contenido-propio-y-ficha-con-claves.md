# Contenido propio firmado y ficha con claves

Plan · 2026-10-25 · repo `vocesindigenas` · estado: **aprobado por el director, sin ejecutar**

---

## RESUMEN EJECUTIVO

### Decisiones del director (25-oct-2026, literales)

> «Sí: abrimos la capa de contenido propio firmado y enriquecemos la ficha. Prepara el plan
> por tandas.»

Y, por aceptación de la recomendación que acompañaba a esa pregunta:

- La ficha diaria sigue siendo **curaduría** y pasa de tarjeta a **nota con claves**.
- Lo propio (**editorial y explicadores**) lo **firma Venancio Coñuepán**; la ficha lleva
  «Redacción Voces Indígenas con IA» y un recuadro de método por pieza.
- Los ocho indicadores del Trust Project se adoptan **como diseño**, con la fórmula
  «inspirado en». **No se postula** ni se escribe ninguna afiliación (regla 6 de lenguaje).

### Propósito

Que una nota de Voces deje de ser un resumen de 45 palabras más una justificación de puntaje,
y que el sitio tenga por fin lo que lleva meses prometiendo: una voz propia, firmada, con
método declarado.

### Dónde estamos (medido en vivo el 25-oct-2026)

| Dato | Valor | Fuente |
|---|---|---|
| Resumen por nota | 40-70 palabras por prompt; media real 45 | `prompts/assess.ts`, API pública (100 últimas) |
| Texto del artículo que ve el modelo al analizar | **primeros 4.000 caracteres** | `config.assess.contentMaxLength` |
| Modelo que redacta la ficha | tier `medium` (`gpt-5.4-mini` por defecto) | `config.assess.modelTier` |
| «Citas» que no son cita (`Artículo original`) | 41 de 100 | API pública |
| Notas desde la búsqueda de Google News | 59 de 100 | API pública |
| Publicadas con relevancia bajo 6 | 30 de 100 | API pública |
| Editoriales publicadas | **0**; la página promete una «en camino» desde el 3-may-2026 (`a438d7f`) | `GET /api/editorials` |
| Guías | 6, escritas a mano en React, sin fecha, autor ni referencias | `client/src/pages/FpicPage.tsx` y pares |
| Metodología | dice «Cinco temas» con ocho temas vivos, y «No hacemos reportería original» | `/methodology` |
| Firma humana en el sitio | ninguna | — |
| Candados reutilizables | cita · cifra · identidad · pueblo, en código | `server/src/lib/storyCarouselGuards.ts` |
| Costo medido de una pieza desde el artículo fuente | US$0,0019–0,0021 (carrusel, 3,3–3,8 k tokens de entrada) | memoria `project-carrusel-noticia` |
| Arreglo del año futuro | **en `origin/main`** (`dce4526`); la memoria decía «sin empujar» y envejeció | `git log origin/main` |

### Los movimientos

1. **M1 · La ficha pasa de tarjeta a nota con claves.** Cuatro claves fijas, 250-400 palabras,
   redactadas desde el texto fuente completo y no desde sus primeros 4.000 caracteres, con los
   candados del carrusel aplicados en el punto de escritura, y un recuadro «¿Cómo hicimos esta
   nota?» que dice la verdad: si hubo o no revisión humana.
2. **M2 · La editorial existe de verdad.** Firmada por Venancio, una por semana, escrita desde
   sus notas y no generada desde «las ocho mejores noticias de la semana», que es lo que hace
   hoy el botón. Es la vía más corta al indicador 2 del Trust Project y la que menos código
   necesita.
3. **M3 · Las guías se vuelven explicadores vivos.** Del código a la base, con fecha, autor,
   referencias y registro de cambios; nuevos explicadores sobre temas que el pipeline muestra
   que se repiten; enlace desde los ocho temas y no desde dos.
4. **M4 · Trust Project como diseño.** Rótulo de género en cada pieza, política de correcciones
   visible y con historial, declaración de origen local, método por pieza, metodología al día.
5. **M5 · La mezcla de fuentes cambia la cara del sitio sin escribir nada.** Menos peso a la
   búsqueda de Google News, umbral efectivo más alto, medido antes y después.

### Lo que NO se hace

- No se reproduce el artículo fuente. Chile no tiene excepción de prensa; el art. 71 B es la
  única puerta y los Términos §7 prometen «no reproducimos las notas completas». La nota con
  claves es **hechos en palabras propias**; la cita sigue siendo una y breve.
- No se infiere ni se registra la calidad indígena de nadie. El candado `identidad` del
  carrusel ya lo impide y se hereda tal cual.
- No se corre ningún `db:migrate*`. Las migraciones salen como SQL y las aplica el director.
- No se empuja a `main` sin orden del director. Cada tanda se commitea con pathspec.
- No se postula al Trust Project ni se usa su sello.
- No se baja de la ficha el enlace, el título original ni el autor de la fuente: son las tres
  menciones que el 71 B exige y que ya estaban.

### La acción siguiente, una sola

**Tanda A, ítem 1: medir en base local con tres noticias reales qué sale de la nota con claves
antes de tocar un solo prompt de producción.** Igual que el carrusel: se arma el prompt, se
pasa por los candados, se mide costo y se leen las tres notas. Lo que esa prueba diga decide
la forma del ítem 2.

---

## DESARROLLO COMPLETO

### 0 · Por qué hoy la ficha es pobre, con la causa en el código

La sensación del director tiene cuatro causas verificables, y tres están en el código:

1. **El prompt pide poco.** «Resumen (40-70 palabras)» en `server/src/prompts/assess.ts` y en el
   `.describe()` de `assessResultSchema` en `server/src/schemas/llm.ts`. El modelo cumple: media
   de 45.
2. **El modelo lee poco.** `config.assess.contentMaxLength = 4000`. Un reportaje de Mongabay de
   12.000 caracteres entra cortado a un tercio. Lo que no leyó no lo puede contar.
3. **Lo que sigue al resumen no es contexto, es scoring.** `relevanceReasons` y `antifactors`
   son viñetas de evaluación («Alto impacto legal: …», «Artículo de opinión: …»), y la página
   las muestra como «Por qué importa» y «Consideraciones». Es la hoja de cálculo del
   evaluador, puesta donde el lector espera la historia.
4. **El modelo inventa cuando le falta texto.** «En 2027» era el defecto del año futuro, ya
   arreglado en `origin/main`. «Preservar enfermedades originarias» en la nota del Senado
   mexicano de hoy no se contrastó contra la fuente; queda como ítem de verificación (A4).

La cuarta causa no está en el código: 59 de 100 notas vienen de la búsqueda de Google News, y
una nota de MVS Noticias sobre créditos de Finabien se ve pobre porque **lo es**, aunque se
redacte mejor. M5 ataca eso.

### 1 · M1 · La nota con claves

**Forma de la pieza** (estilo Ex-Ante, medido en su nota del 25-oct: cuatro claves, unas 600
palabras, bajada, firma institucional):

| Bloque | Qué es | Largo |
|---|---|---|
| Bajada | Qué pasó, en una frase, con el pueblo nombrado si el medio lo nombra | 25-40 palabras |
| **Qué pasó** | Los hechos del artículo, en palabras propias; una sola cita breve con su autor | 80-120 |
| **Por qué importa a los pueblos** | El mecanismo concreto: qué derecho, territorio, recurso o decisión toca | 60-100 |
| **Contexto** | Lo que el lector necesita para entender, tomado del artículo y de las guías propias, nunca de memoria del modelo sin respaldo | 60-100 |
| **Qué sigue** | Plazos, instancias, decisiones pendientes que el artículo nombra | 30-60 |
| Recuadro de método | «¿Cómo hicimos esta nota?» | fijo |

Total 250-400 palabras. Los bloques de scoring (`relevanceReasons`, `antifactors`,
`relevanceCalculation`) **no desaparecen**: bajan a un desplegable «Cómo la evaluamos», que es
el indicador 5 del Trust Project hecho interfaz.

**Dónde va el texto.** Campo nuevo `Story.body` (markdown) y `Story.bodyEn`, más
`Story.bodyMethod` (enum: `ia_sin_revision` | `ia_revisada` | `humana`) y
`Story.bodyReviewedBy` (texto libre, nombre de quien revisó). `summary` **no cambia de
significado**: sigue siendo la entradilla de 40-70 palabras que usan las tarjetas, el RSS, el
boletín y la meta description. El cuerpo es otro campo, para que nada aguas abajo se rompa.

**Quién lo escribe y con qué.** Una etapa nueva del pipeline, después de `Assess` y antes de
`Select`, o dentro de `Assess` con un segundo turno: se decide en A1 midiendo. Argumentos:

- Dentro de `Assess` ahorra una lectura del artículo, pero el prompt de assess ya pide once
  campos y la regla de `prompting.md` es no acumular contradicciones.
- Etapa aparte (`draftBody`) permite usar **el artículo completo** (límite propio, 12.000
  caracteres a medir) y un modelo distinto, y correr solo sobre lo que `Select` va a publicar,
  que es la mitad de lo analizado. **Es la opción recomendada**: menos tokens totales y un
  prompt con una sola tarea.

**Candados en el punto de escritura**, heredados de `lib/storyCarouselGuards.ts` y aplicados
al markdown del cuerpo, párrafo por párrafo:

| Candado | Regla | Qué pasa si falla |
|---|---|---|
| `cita` | Todo texto entre comillas está letra por letra en `sourceContent` | Se quita la comilla y pasa a estilo indirecto; se registra |
| `cifra` | Todo grupo de dígitos del cuerpo está en el original | **No se escribe el cuerpo**; la ficha sale como hoy y el panel lo marca |
| `identidad` / `pueblo` | «indígena» y el nombre del pueblo solo si el artículo lo dice | Igual que `cifra` |
| `año futuro` | `lib/future-year.ts`, ya en main | Igual que hoy en el resumen |
| `agencia` | La bajada no abre con el medio ni con la plataforma de sujeto | Test de unidad sobre el prompt y sobre tres cuerpos reales |

La regla de este repo (`.context/llm-analysis.md`): una instrucción al modelo es blanda; lo
binario va en código. El prompt pide las reglas igual, los candados las hacen cumplir.

**Derecho de autor.** El cuerpo cuenta hechos; los hechos no están protegidos, la expresión sí.
El prompt lo dice como restricción de contenido («no reproduzcas frases del artículo fuera de
la cita») y el candado `cita` lo mide por la vía contraria: lo que va entre comillas tiene que
estar en el original, y lo que no está entre comillas no puede ser una copia. Para esto se
agrega un **candado de solapamiento**: ningún tramo de 12 palabras seguidas del cuerpo, fuera
de la cita, coincide con el original. Es el espejo de la regla de cita.

**Costo.** Se mide en A1, no se estima. Referencia: el carrusel, con la misma materia prima y
el tier `medium`, costó US$0,002 por pieza. Con artículo completo y 400 palabras de salida será
más; la cifra real decide si corre sobre todo lo seleccionado o solo sobre relevancia ≥ 7.

**Recuadro «¿Cómo hicimos esta nota?».** Texto fijo por valor de `bodyMethod`, en los dos
idiomas, sin «IA» en el cuerpo (regla heredada de `voz-venancio.ts`: la declaración va en
línea fija, no dentro del texto):

- `ia_sin_revision`: «Un modelo de lenguaje leyó el artículo de [medio] y redactó esta nota
  con las cuatro claves de Voces. Nadie la revisó antes de publicarla; si encuentras un error,
  [corrígenos] y lo publicaremos.»
- `ia_revisada`: lo mismo más «La revisó [nombre] antes de publicarla.»
- `humana`: «Esta nota la escribió [nombre] a partir de [fuentes]. Un modelo de lenguaje ayudó
  a ordenar el borrador.»

La honestidad del primer caso es el punto: BioBío declara que el periodista revisó. Voces, en
la ficha diaria, no tiene periodista, y decirlo vale más que callarlo.

### 2 · M2 · La editorial firmada

**Lo que hay.** Modelo `Editorial` (título, contenido markdown, `draft|published`), rutas admin
con `generate`, `publish`, `unpublish` y texto para LinkedIn, página pública `/voces-indigenas`
y detalle, y un `textarea` editable en el panel. Funciona de punta a punta y nunca se usó.

**Lo que está mal y hay que cambiar antes de publicar la primera:**

1. `prompts/editorial.ts` genera la columna **desde las ocho noticias de mayor relevancia de la
   semana**, con una identidad escrita a mano que no es la verificada: habla de Impacto
   Indígena (2023), del IRI y de asesorías a Codelco y BHP. La voz verificada está en
   `prompts/voz-venancio.ts`, destilada del corpus 2013-2026, y se construyó justamente porque
   los otros prompts tenían un posicionamiento en vez de una voz. El prompt de editorial pasa a
   usar `VOZ_VENANCIO_ADN`, `VOZ_VENANCIO_EVITAR` y `REGLAS_FUNDACION`, y a **partir de las notas
   del director**, no de las noticias.
2. El flujo pasa a ser: el director escribe o dicta sus notas en el panel → el modelo ordena un
   borrador en su voz → el director edita en el `textarea` → publica. El botón «generar» sin
   notas se deshabilita: una editorial generada sola desde titulares no es una editorial
   firmada, es el problema que M2 quiere resolver.
3. `Editorial` gana `authorName`, `method` (misma enum que la ficha) y `sources` (markdown libre).
   La página pública muestra firma, fecha, método y fuentes: indicadores 2, 4 y 5.
4. Página de autor `/autor/venancio-conuepan`: trayectoria, pertenencia, vínculos
   institucionales **con las reglas de la casa** (la afiliación a GSDA es de la Fundación y es
   «miembro asociado»; nada se infla). Enlazada desde cada editorial y explicador.
5. Candado de agencia también acá: la primera frase no abre con «Celebro», «En Voces…» ni la
   Fundación (`VOZ_VENANCIO_EVITAR` ya lo pide; el test lo mide).

**La primera editorial** es trabajo del director, no del plan. El plan deja el panel listo y
retira de la página pública el «la primera editorial está en camino» en cuanto haya una.

### 3 · M3 · Guías y explicadores

**Lo que hay.** Seis guías como componentes React (`FpicPage.tsx`, etc.), con JSON-LD de autor
`Organization`, sin fecha, sin referencias, sin registro de cambios. La de Consulta Previa tiene
1.074 palabras y es buena de contenido; le falta todo lo que el Trust Project mide.

**Lo que cambia:**

1. Modelo nuevo `Guide` (slug, título, cuerpo markdown, `authorName`, `publishedAt`,
   `updatedAt`, `sources` markdown, `changelog` JSON de `{fecha, qué cambió}`, `status`). Las
   seis se migran con un script que **convierte lo que hay**, no lo que se declara: se extrae el
   texto de cada TSX y se compara palabra por palabra con lo que sirve producción antes de
   borrar el componente. Las rutas no cambian.
2. Panel admin de guías con el mismo `textarea` de la editorial y los mismos campos de método.
3. Explicadores nuevos (estilo BBC Mundo: 1.500-2.000 palabras, intertítulos, fuentes citadas
   con enlace): el director elige el tema desde el panel, donde una vista nueva muestra **qué
   temas se repiten** en lo publicado de los últimos 30 días (conteo por `titleLabel`
   normalizado y por pueblo nombrado, sin inferir nada sobre personas). El modelo arma un
   borrador desde las notas que el director selecciona; el director edita y firma.
4. `STORY_GUIDES` en `StoryPage.tsx` deja de ser una tabla a mano para dos temas y pasa a
   consultar las guías publicadas por tema (`Guide.issueSlugs`), así cada nota de los ocho temas
   enlaza a su contexto. Es, además, lo que alimenta la clave «Contexto» de M1 sin que el modelo
   invente desde memoria.

### 4 · M4 · Trust Project como diseño

| Indicador | Hoy | Qué entrega este plan | Ítem |
|---|---|---|---|
| 1 Buenas prácticas | Metodología, Fundación KM, sin publicidad, código abierto | Financiamiento explícito en `/about`; política de correcciones | B9, B10 |
| 2 Experiencia del periodista | Ninguna firma | Editorial y explicadores firmados; página de autor | B6, B7 |
| 3 Etiquetas | «Generado por IA», imágenes rotuladas | Rótulo de género en la pieza: Noticia curada · Explicador · Editorial · Guía; la pseudo-cita deja de parecer cita | A3, B11 |
| 4 Referencias | Enlace al original | Guías y explicadores con fuentes; cuerpo con una sola cita verificable | B5, B8 |
| 5 Métodos | Pipeline explicado, desactualizado | Metodología a ocho temas y con la capa propia; recuadro de método por pieza | A2, B4 |
| 6 De origen local | Nada | Declaración de lugar y pertenencia en `/about` y en la página de autor | B7 |
| 7 Voces diversas | Es la misión | Mezcla de fuentes medida y corregida | B12 |
| 8 Comentarios útiles | Formulario | Política de correcciones visible, correcciones publicadas y fechadas en la pieza | B10 |

**Política de correcciones.** Página `/correcciones` con la política en cuatro líneas y una
lista de rectificaciones (fecha, pieza, qué decía, qué dice). En la pieza corregida, una línea
al pie. Hoy el formulario de comentarios ya tiene categoría «Error»: la política cierra el
circuito que el formulario abre.

**La metodología cambia de texto.** «No hacemos reportería original» pasa a: «Las noticias son
curaduría: cada una enlaza a su original. Lo propio, editoriales, explicadores y guías, va
firmado y declara sus fuentes y su método.» Y «Cinco temas» pasa a ocho. Es copy de dirección:
el plan lo redacta, el director lo aprueba antes de que entre.

### 5 · M5 · Mezcla de fuentes

Sin escribir una línea de contenido, lo que más cambia la cara del sitio:

1. Medir por fuente, por relevancia y por tema las últimas 500 publicadas (script, salida en
   `.plans/`), para tener el antes.
2. Opciones, con su efecto medido en simulación antes de aplicar: subir `selection.relevanceMin`
   de 5 a 6 (saca al 30 % de hoy) · poner `minPreRating` propio al feed de Google News ·
   bajar `selection.ratio`. Son variables de entorno y campos de `Issue`/`Feed`, no código.
3. Decisión técnica mía con el dato en la mano; el director ve el antes y el después.

### 6 · Spec y documentación

- `.specs/story-pipeline.allium`: campos `body`, `body_en`, `body_method`, `body_reviewed_by`
  en `Story`; regla `DraftBody` entre `Assess` y `Select` (o dentro de `Assess`, según A1), con
  sus `ensures` y los invariantes de candado: `BodyQuotesAreVerbatim`, `BodyFiguresAreSourced`,
  `BodyNamesNoPeopleTheSourceDidNot`, `BodyDoesNotCopyTheSource`.
- Spec nueva `.specs/own-content.allium`: `Editorial` y `Guide`, estados, firma obligatoria para
  publicar, método obligatorio, changelog inmutable.
- `.context/story-pipeline.md`, `.context/llm-analysis.md`, `.context/public-website.md`:
  campos, etapa, rutas nuevas. `.context/README.md` y `CLAUDE.md`: fila nueva para
  `own-content.md`.
- Migraciones: SQL a mano según `.context/database-migrations.md`; las aplica el director.

### 7 · Pendientes numerados, por tandas

**Criterio de agrupación: por quién desbloquea.** A se arregla sin decisión de nadie; B es
decisión técnica mía, con fundamento; C necesita que el director decida, y se dice qué.

#### Tanda A · sin decisión de nadie

| # | Ítem | Archivos | Hecho significa |
|---|---|---|---|
| A1 | **Medir la nota con claves** con tres noticias reales en base local desechable (Postgres 17 + pgvector en el scratchpad, como el carrusel), con prompt, candados y costo | `server/src/prompts/body.ts` (borrador), `lib/storyCarouselGuards.ts` | Tres cuerpos leídos, avisos de candado contados, US$ por nota medidos, decisión etapa-aparte vs. dentro de assess escrita |
| A2 | Metodología a ocho temas | `client/src/pages/MethodologyPage.tsx` | Texto en vivo dice ocho y los nombra |
| A3 | La pseudo-cita (`Artículo original`) se muestra como «frase del artículo», sin estilo de cita | `client/src/pages/StoryPage.tsx`, `components/PullQuote.tsx` | Verificado en una ficha en vivo de cada tipo |
| A4 | Contrastar «enfermedades originarias» contra su fuente; si es error, corregir en el panel y registrar como primera corrección | panel admin | Campo corregido o descartado con evidencia |
| A5 | Enlazar guía desde los ocho temas con la tabla actual (puente hasta B8) | `StoryPage.tsx` | Las ocho fichas muestran «Contexto sobre este tema» |
| A6 | Medir la mezcla de fuentes de las últimas 500 (el antes de M5) | script en `server/src/scripts/`, simulación por defecto como los de migración | Tabla en `.plans/` con fuente × relevancia × tema |

#### Tanda B · decisión técnica mía, con fundamento

| # | Ítem | Depende de |
|---|---|---|
| B1 | Campos `body*` en `Story`, SQL de migración, spec actualizada | A1 |
| B2 | Etapa `draftBody` (o segundo turno de assess), con artículo completo, candados en el punto de escritura y fallo cerrado: sin cuerpo válido la ficha sale como hoy | A1, B1 |
| B3 | Ficha pública con claves; scoring en desplegable «Cómo la evaluamos»; traducción del cuerpo con el guardarraíl de copia existente | B2 |
| B4 | Recuadro «¿Cómo hicimos esta nota?» por valor de `bodyMethod`, en ES y EN | B1 |
| B5 | Editorial: prompt desde notas del director con `voz-venancio.ts`; campos `authorName`, `method`, `sources`; «generar» exige notas | — |
| B6 | Página pública de editorial con firma, fecha, método y fuentes; retirar «en camino» cuando haya una | B5 |
| B7 | Página de autor, con las reglas de afiliación de la casa | — |
| B8 | Modelo `Guide`, migración de las seis con comparación palabra por palabra, panel, `STORY_GUIDES` dinámico | — |
| B9 | Rótulo de género en cada pieza (Noticia curada · Explicador · Editorial · Guía) | B6, B8 |
| B10 | `/correcciones`: política, lista, línea al pie en la pieza corregida | — |
| B11 | Vista del panel «temas que se repiten» para elegir explicadores | — |
| B12 | Mezcla de fuentes: simulación de las tres palancas con el dato de A6; aplicar la que mejor mueva relevancia media sin vaciar temas | A6 |
| B13 | Docs: `.context/own-content.md`, filas en `README.md` y `CLAUDE.md`, specs | B1-B10 |

#### Tanda C · decide el director

| # | Qué tiene que decidir | Mi recomendación |
|---|---|---|
| C1 | **Texto nuevo de la metodología** que reemplaza «No hacemos reportería original» (sección 4) | El propuesto arriba |
| C2 | **Cadencia de la editorial** y tema de la primera | Semanal; la primera sobre la ley argentina de desalojos, que hoy encabeza la portada y toca derechos territoriales |
| C3 | **Primer explicador** | «Desalojos de comunidades mapuche en Argentina: qué cambió y qué dice el derecho», porque la búsqueda «desalojo» da 55 notas publicadas entre el 25-sep y el 25-oct, once de ellas sobre comunidades mapuche en Río Negro, Neuquén y Chubut (medido en la API pública) |
| C4 | **Umbral de la nota con claves**: todo lo seleccionado o solo relevancia ≥ 7 | Lo decide el costo medido en A1; si está bajo US$0,01 por nota, todo |
| C5 | **Aplicar las migraciones** (B1, B5, B8) en pgAdmin cuando el SQL esté | — |
| C6 | **Empujar** cada tanda cuando esté verificada | — |

### 8 · Orden de ejecución y verificación

1. **A completa** antes de abrir B. Al cerrar, cuántos ítems quedaron y por qué.
2. B en dos frentes que no se tocan: **B1-B4** (ficha) y **B5-B10** (capa propia). Comparten
   `StoryPage.tsx` solo en B3 y B9, así que B9 espera a B3.
3. Cada ítem con test: candados con casos reales (el año inventado del carrusel es el primero),
   agencia sobre bajadas y aperturas, copia sobre cuerpo vs. fuente.
4. «Hecho» es releído en el recurso: la ficha en producción con cache-buster, el `/api` con la
   nota real, el costo en Azure Cost Management, no en el log.
5. Commits con pathspec y `--only`, en `main`, sin empujar hasta C6. Antes de cada commit,
   `git status --short` y `git diff --cached --name-only`: el árbol es compartido.

### 8 bis · Resultados de la Tanda A (25-oct-2026, noche)

**A1 · La nota con claves, medida.** Tres rondas, ocho generaciones sobre cinco noticias
reales (Resumen Latinoamericano, Meganoticias, Mongabay Latam, The Guardian, MVS), el
original re-extraído con el extractor del rastreador, prompt `server/src/prompts/story-body.ts`,
candados `server/src/lib/storyBodyGuards.ts` (21 tests), script
`server/src/scripts/medir-nota-claves.ts`. Nada escrito en la base.

| Medida | Resultado |
|---|---|
| Largo total | 250 a 352 palabras (objetivo 250-400) |
| Costo por nota, `gpt-4.1-mini` (tier `medium`) | US$0,0013 a 0,0025 · 3,6 a 6,9 s |
| Costo por nota, `gpt-4o` (tier `large`) | US$0,0134 a 0,0141, **y peor**: 6 avisos contra 1 en las mismas dos noticias |
| Años inventados | 1 de 8 («2019» donde Mongabay decía «hace cuatro años»); el candado `cifra` lo atrapó |
| Año mal atribuido, no atrapable por candado | 1 de 8 («elección de 2023» en The Guardian, que decía «este año»): desapareció al darle la fecha de la noticia al prompt, que el pipeline siempre tiene |
| Copia literal del original | 1 de 8 (lista de obras de MVS, 12 palabras seguidas); candado `copia` lo atrapó |
| Cita traducida entre comillas | 1 de 8; ahora el código le quita las comillas y queda en estilo indirecto |
| Texto «meta» («el artículo muestra…», «el artículo no menciona…») | 2 de 8 en la primera ronda, 0 después del prompt v2 + candado `meta` |
| Mecanismo distorsionado (Mongabay, ronda 1) | 1 de 8; corregido con una regla de prompt, y es el tipo de error que **solo ve un humano** |
| Valoración presentada como hecho | 1 de 8 (ronda 2); regla de atribución agregada, mejoró en ronda 3 |

**Decisiones técnicas que salen de A1 (Tanda B):**
- Etapa aparte, `draftBody`, después de `Select` y antes de `Publish`: corre solo sobre lo
  que se va a publicar, con el artículo completo (tope 15.000 caracteres) y el tier `medium`.
  El modelo grande cuesta seis veces más y falló más.
- Fallo cerrado: cualquier aviso bloqueante (cita no textual que no se pudo limpiar, cifra,
  identidad, pueblo, año futuro, copia, agencia, meta) deja la ficha como hoy. El largo solo
  avisa.
- La fecha de la noticia va siempre en el prompt (la del feed o, si no, la del rastreo).
- **C4 queda respondida por el costo:** a menos de un centavo por nota, corre sobre todo lo
  seleccionado. Con las ~20 publicadas por día son unos US$0,05 diarios.
- `bodyMethod` nace en `ia_sin_revision` y el recuadro lo dice: el error de mecanismo de
  Mongabay es exactamente lo que ningún candado ve.

**A2 · Metodología.** Los ocho temas y las geografías salen ahora de `GET /api/issues`
(`MethodologyPage.tsx` con `usePublicIssues` e `ISSUE_ORDER`), así que no puede volver a
quedar vieja. «Cuatro áreas temáticas» y «Cinco Temas Principales» desaparecen.

**A3 · La pseudo-cita.** Medido sobre las 500 últimas: **225 (45 %)** llevan «Artículo
original». `lib/quote-attribution.ts` reconoce el marcador en los dos idiomas; la ficha las
muestra como «Frase del artículo original», sin comilla gigante ni raya; la portada
(`PullQuote`) deja de firmarlas «Artículo original, via …». De paso: `PullQuote` comparaba
solo con el marcador en inglés, así que toda frase en español salía firmada.

**A4 · «Preservar enfermedades originarias».** Contrastado contra Meganoticias: el original
dice «lenguas originarias» y «mantener vivas las lenguas». Es un error del modelo en el
resumen publicado el 25-oct. **Lo corrige el director en el panel** (campo `summary` y
`summaryEn` de `mujer-indigena-lleva-su-voz-al-senado-mexicano`) y es la primera entrada de
la lista de correcciones de B10.

**A5 · Guías desde los ocho temas.** `STORY_GUIDES` cubre los ocho temas, Chile Intercultural
y las 18 subsecciones (una noticia puede traer el slug de la subsección). Puente hasta B8.

**A6 · Mezcla de fuentes, las 500 últimas (9 al 25 de octubre).**

| Fuente | Notas | Relevancia media | Bajo 6 |
|---|---|---|---|
| Google News (búsqueda) | 286 (57 %) | 6,52 | 76 |
| Mongabay + Mongabay LatAm | 39 | 6,43 | 11 |
| Indian Country Today | 22 | 6,32 | 8 |
| Amazon Watch | 8 | 7,25 | 1 |
| Radio Kurruf | 7 | 7,14 | 1 |

| Tema | Notas | Relevancia media | Bajo 6 | Desde Google News |
|---|---|---|---|---|
| Territorio y Tierras | 77 | 6,95 | 13 | 60 % |
| Cultura y Conocimientos Ancestrales | 76 | 5,87 | 36 | 50 % |
| Defensores y Protección | 73 | 7,00 | 10 | 59 % |
| Cambio Climático | 71 | 6,15 | 22 | 41 % |
| Derechos Indígenas | 63 | 6,08 | 22 | 52 % |
| Consulta y Consentimiento | 53 | 7,00 | 7 | 77 % |
| Mujeres Indígenas | 52 | 6,13 | 21 | 67 % |
| Economías Indígenas | 34 | 5,76 | 15 | 62 % |

Distribución de relevancia: 5 → 137 · 6 → 126 · 7 → 115 · 8 → 97 · 9 → 13 · 10 → 3. Un
umbral de 6 deja 354 de 500 (−29 %); uno de 7 deja 228 (−54 %). Cultura y Economías son los
temas más flojos, y la búsqueda de Google News no es peor en relevancia media (6,52) que
Mongabay (6,43): **el problema de la búsqueda no es el puntaje, es la voz**. Eso cambia la
palanca de B12: no basta subir el umbral; hay que ponderar la fuente. Datos crudos en el
scratchpad de la sesión (`ultimas-500.json`).

### 9 · Riesgos nombrados

- **El modelo inventa más cuando escribe más.** Por eso los candados son de fallo cerrado: sin
  cuerpo válido no hay cuerpo, y la ficha de hoy sigue saliendo. Nunca un cuerpo a medias.
- **Más texto, más exposición al 71 B.** El candado de solapamiento y la cita única son la
  defensa; se documenta en Términos §7 si cambia una coma de lo prometido.
- **La editorial vacía ya daña.** B5-B6 son los ítems más baratos del plan y los de mayor
  efecto sobre la confianza: no se postergan detrás de la ficha.
- **La mezcla de fuentes puede vaciar temas.** Por eso se simula sobre 500 antes de tocar una
  variable, por tema y no solo en promedio.
