# Origen étnico de personas, menores y víctimas: de la promesa a lo que escribe el modelo

Plan · 2026-11-06 · repo `vocesindigenas` · estado: **propuesto, nada tocado.** Es el ítem A6 de
la lista de pendientes, que se muestra antes de tocar. Espera la decisión C1.

> Este plan no nombra a ninguna persona. Las mediciones se hicieron con los nombres borrados, y
> los tests usarán nombres inventados: el repo es público.

---

## RESUMEN EJECUTIVO

### Propósito

Que lo que la Fundación promete en su evaluación de interés legítimo (EILE v1.2, §7,
salvaguardas 2 y 3) sea cierto en lo que publica el modelo:
- la pertenencia de una persona a un pueblo **se acredita desde adentro**;
- a los menores y a las víctimas **se los nombra por su rol**.

Hoy las dos salvaguardas están escritas y no implementadas, y la EILE lo declara así.

### Dónde estamos (medido el 6-nov-2026)

Base: las 500 noticias publicadas más recientes, del 17-oct al 6-nov, leídas en la API pública.
Se miraron los campos que escribe la IA: título, resumen, relevancia, cita, atribución de la cita,
blurb y sus versiones en inglés.

| Dato | Valor | Fuente |
|---|---|---|
| Salvaguardas 2 y 3 | Definidas el 11-oct, **no implementadas** | EILE v1.2 §7 |
| Instrucciones que aplican el estándar contrario | «no atribuyas pertenencia étnica que la fuente no afirme»: si la fuente la afirma, se atribuye | `schemas/llm.ts:192` y `:280`, `prompts/facebook.ts:55` |
| Instrucción que manda ir más allá del artículo | «Utiliza tu conocimiento más allá de lo que está escrito en el artículo» | `prompts/assess.ts:177` |
| Atribuciones de cita que nombran un pueblo o «indígena» | **86 de 500** (17 %) | API pública |
| De esas 86: etiqueta étnica sobre una persona, sin organización que la presente | **27** (5,4 % de las notas), revisadas una por una sin nombres | API pública |
| De esas 86: cargos u oficinas que nombran a los pueblos sin atribuir etnia | 16 (Defensoría, INPI, ministerios, Seremi) | ídem |
| De esas 86: cargo en organización, comunidad o institución | 41, clasificación automática, **no revisada una por una** | ídem |
| De esas 86: dudosas | 2 | ídem |
| Título o resumen con «descriptor étnico + nombre» | 7 coincidencias en **6 notas** (1,2 %), todas reales | ídem |
| Si el original muestra que esas personas se presentan así | **No medido**: exige leer cada original | — |
| Menores o víctimas del art. 33 nombrados por la IA | **0 de 500**. 12 notas hablan de menores junto a delitos o violencia y 18 dicen «violación», casi siempre «violación de derechos» | API pública |
| Candado en el punto de escritura para personas | **Ninguno** | código |
| La regla buena, ya escrita | En el carril de marca de Voces Mapuche | `prompts/brandLane.ts:39`, `:113`, `:119` |

### Los movimientos

1. **M1 · Una sola regla de pertenencia en todo lo que escribe el modelo.** Es la que ya rige
   en el carril de marca (`brandLane.ts:39`): la pertenencia se acredita desde adentro, y no
   basta con que el periodista, una autoridad u otro tercero llame así a la persona. Va en el
   `.describe()` del esquema, que pesa más que el prompt, y en cada prompt que escribe sobre
   personas. Reemplaza la regla contraria.
2. **M2 · Menores y víctimas, por su rol.** La regla de `brandLane.ts:113` pasa a todos los
   puntos de escritura, con el criterio más amplio que la EILE ya promete: vale aunque el medio
   los nombre, y tampoco se escribe un dato que conduzca a su identidad (art. 33, Ley 19.733).
3. **M3 · Un candado en el punto de escritura**, porque una instrucción al modelo es blanda:
   - en la **atribución de la cita**, un descriptor étnico pegado a una persona sin organización
     que la presente se quita del campo;
   - en **título, resumen, blurb y redes**, un descriptor étnico pegado a un nombre propio, o un
     menor o una víctima junto a un nombre, se rechaza con fallo cerrado.
4. **M4 · Lo que el lector ve, solo desde el artículo.** Se reemplaza la instrucción que manda
   usar conocimiento «más allá» del artículo. Es la puerta por la que el modelo agrega pueblos,
   cifras y años que el medio no dio.

### Lo que no se hace

- No se infiere ni se registra la calidad indígena de nadie, ni por apellido ni por lista.
- No se borra el pueblo de los hechos colectivos. «La comunidad mapuche X» o «el pueblo wayuu
  demanda» siguen igual: la regla es sobre personas, y lo colectivo ya tiene su candado.
- No se corrige lo publicado hacia atrás sin medir antes el archivo completo (C2).
- No se usa un segundo modelo como candado: medido el 3-nov, marca todo e inventa.
- No se cambia la Política de Privacidad acá. Eso va en la v4.0, con la respuesta del abogado.
- No se escriben nombres de personas reales en el código, los tests ni este plan.

### La acción siguiente, una sola

**Que el director decida C1:** si se adopta ya la regla de pertenencia como regla editorial, sin
esperar al abogado. Con su sí, se ejecuta la Tanda A de este plan.

---

## DESARROLLO COMPLETO

### 1 · Qué se prometió, textual

EILE v1.2 (11-oct-2026), §7, «Valen en los dos escenarios»:

> **2. Origen étnico de personas mencionadas.** No se consigna la pertenencia de una persona
> identificada a un pueblo, salvo que ella misma la haya declarado y sea parte del hecho
> noticioso. No basta que un medio lo haya dicho.
> *Estado al 11-oct-2026:* definida, no implementada en la generación automática.
>
> **3. Menores y víctimas.** No se identifica a menores de edad vinculados a delitos ni a las
> víctimas que enumera el art. 33 de la Ley 19.733, aunque la fuente lo haga. El criterio es más
> amplio que la ley en cuanto a menores.
> *Estado al 11-oct-2026:* definida, no implementada en la generación automática.

La nota reservada al abogado (§3) dice además que las dos instrucciones que tocan el tema
aplican hoy el estándar contrario, y que la implementación «no ha comenzado».

**Ley 19.733, art. 33**, leído en LeyChile (idNorma 186049, versión del 31-dic-2022).
- **Prohíbe** divulgar la identidad de menores de edad que sean autores, cómplices,
  encubridores o testigos de delitos, «o de cualquier otro antecedente que conduzca a ella».
- **Rige igual para las víctimas** de los delitos de los arts. 141 inc. final, 142 inc. final,
  150 A y 150 D, del Título VII del Libro II («Crímenes y delitos contra el orden de las
  familias, contra la moralidad pública y contra la integridad sexual»), del 411 quáter con
  fines de explotación sexual y del 433 N° 1 en relación con la violación, todos del Código
  Penal, salvo que consientan expresamente.
- **Exige** referirse a la víctima por iniciales, número u otra forma que no la individualice.
- **Exige** evitar recursos editoriales que den cuenta de estereotipos o prejuicios sobre su
  condición de víctima.
- **Multa:** de 30 a 150 UTM.

**Lo que sigue abierto ante el abogado, y no bloquea este plan:**
- A5.3: si hoy alguna excepción del art. 10 de la 19.628 cubre consignar el origen étnico que
  divulgó un medio;
- A6.4: qué diligencia mínima acredita que no hubo negligencia;
- B2.1: si basta un filtro automático para el art. 33.

Su respuesta dirá si la regla es además obligación legal. La regla editorial está prometida en
los dos escenarios y es la doctrina permanente de la Fundación: la calidad indígena no se
identifica desde afuera, se acredita desde adentro.

### 2 · Qué dice hoy cada punto de escritura

| Punto | Archivo | Dónde sale | Regla de pertenencia hoy | Menores y víctimas | Candado hoy |
|---|---|---|---|---|---|
| Análisis: título, resumen, relevancia, cita, atribución, blurb | `prompts/assess.ts`, `schemas/llm.ts:96-200` | Sitio, RSS, boletín, `/opendata`, redes (blurb) | Título: la contraria (`:192`). Guía: «más allá del artículo» (`assess.ts:177`) y «menciona el nombre específico del pueblo» (`:179`). Atribución: «nombre completo y cargo/rol» (`:111`), que el modelo llena con el pueblo | Nada | Ninguno |
| Etiqueta y título al reclasificar | `schemas/llm.ts:257-285` | Sitio | La contraria (`:280`) | Nada | Ninguno |
| Atribución de cita (backfill) | `schemas/llm.ts:288-300` | Scripts de migración | Igual que la de análisis | Nada | Ninguno |
| Traducción al inglés | `services/translation.ts` | Sitio en inglés | Hereda del español | Nada | Guardarraíl de copia |
| Facebook | `prompts/facebook.ts:55` | Página (hoy sin credenciales) | La contraria | Nada | Ninguno |
| Bluesky, Mastodon, X | `prompts/bluesky.ts`, `prompts/mastodon.ts` (X reusa Bluesky) | Redes | Ninguna | Nada | Ninguno |
| Instagram (pie) | `prompts/instagram.ts:57` | Perfil de Venancio | Del artículo: «si el artículo no lo dice expresamente» | Nada | `revisarPie`: pueblo a nivel de nota |
| LinkedIn | `prompts/linkedin.ts` | Perfil de Venancio (hoy sin token) | **Ninguna**, y pide «siempre» uno de cuatro hashtags que incluyen `#Mapuche` (`:42`) | Nada | Ninguno |
| Carrusel | `prompts/story-carousel.ts:71` | Instagram, LinkedIn, panel | Del artículo | Nada | Pueblo e «indígena» a nivel de nota |
| Nota con claves | `prompts/story-body.ts:64` | Ficha, solo tras revisión humana | Del artículo | Nada | Ídem, más la revisión |
| Introducción del boletín, podcast | `prompts/newsletter-intro.ts`, `prompts/podcast.ts` | Correo, audio (parado) | Ninguna | Nada | Ninguno |
| **Carril de marca (Voces Mapuche)** | `prompts/brandLane.ts:39`, `:113`, `:119`; `schemas/brandLane.ts:32` | Vertical | **La de la EILE** | **«Nunca el nombre de un niño, niña o adolescente ni el de una víctima: se nombra su rol»** | Banderas sensibles, que retienen |

«Del artículo» quiere decir que el candado actual del carrusel y de la nota con claves mira si
la **nota** nombra un pueblo que el original no nombra. Es un control de lo colectivo y está
bien. No mira si el texto le pone ese pueblo a una **persona**, que es lo que pide la
salvaguarda.

### 3 · Lo medido, en detalle

Método: las 500 noticias por la API pública, un script con expresiones regulares sobre los
campos que escribe la IA, y lectura manual de cada coincidencia con el nombre borrado. Script:
`medir_a6.py` en el scratchpad de la sesión del 6-nov; pasa a `server/src/scripts/` en A3.

**Atribución de la cita (86 de 500 nombran un pueblo o «indígena»).** Las 45 que no nombran
organización, comunidad ni cargo se leyeron una por una:

| Clase | N | Ejemplos de la forma (sin nombre) |
|---|---|---|
| Etiqueta étnica sobre la persona, sin organización que la presente | 27 | «activista climática indígena», «comediante indígena», «integrante mapuche», «líder indígena [pueblo]», «habitante indígena [pueblo] del sur de la Amazonía» |
| Cargo u oficina que nombra a los pueblos, sin atribuir etnia | 16 | «ex defensora adjunta… y Pueblos Indígenas de la Defensoría», «titular de Pueblos Indígenas de Brasil», INPI, una Seremi |
| Dudosas | 2 | «vocero de presos políticos mapuche…», «emprendedor de moda indígena» |

Las otras 41 nombran una organización, una comunidad, una nación o un cargo, según una
clasificación automática que **no se revisó una por una**. Incluye casos que la regla permite
(«presidenta electa de la Nación Navajo», «representante legal de la Organización Regional
Indígena…») y al menos uno que no («senadora electa y mujer indígena»).

**Título y resumen.** «Descriptor étnico + nombre propio» aparece en 6 notas: «comunero mapuche
[N]», «investigador mapuche [N]», «artista yanomami [N]» (también en su blurb), «lideresa
indígena [N]», «líder mapuche [N]».

Sumando las dos mediciones son **31 notas distintas**: dos tienen la etiqueta en la atribución
y también en el resumen.

**Lo que no se midió.** En cuántas de esas 31 notas el original muestra que la persona se
presenta así. Para eso hay que leer cada original, y es justo lo que el candado no puede hacer.

**Menores y víctimas.** Ninguna de las 500 nombra a un menor ni a una víctima de los delitos del
art. 33 en lo que escribe la IA. Hay un caso límite: una nota sobre una adolescente víctima de
un abuso sexual colectivo no la nombra, pero dice su pueblo, uno pequeño, y la zona. El art. 33
prohíbe también «cualquier otro antecedente que conduzca a» su identidad. Que hoy no pase no es
un control: la fuente a veces nombra, y no hay candado.

### 4 · El diseño

**4.1 Las dos reglas, una sola vez** (constantes en `prompts/shared.ts`, usadas por todos los
puntos de escritura y por el `.describe()` de título y atribución). Texto propuesto, tomado de
`brandLane.ts`:

> **Pertenencia.** Que una persona es indígena, o de qué pueblo es, se escribe solo si según el
> artículo ella misma se presenta así o la presenta así su comunidad u organización, y solo si
> es parte del hecho. No basta con que el periodista, una autoridad u otro tercero la llame así,
> ni la palabra «comunero», ni que el artículo nombre su comunidad. Nunca se deduce del
> apellido, del lugar ni de los rasgos. Una comunidad, un pueblo o una organización se nombran
> como los nombra el artículo.
>
> **Menores y víctimas.** Nunca el nombre de un niño, niña o adolescente vinculado a un delito o
> a un hecho de violencia, ni el de una víctima de delitos sexuales, de trata, de tortura o de
> secuestro, ni un dato que permita identificarlos, aunque el artículo los nombre. Se los nombra
> por su rol («una adolescente», «la víctima»). Sin estereotipos sobre su condición de víctima.

La atribución de la cita cambia su ejemplo: «nombre completo y cargo en su organización», y el
pueblo solo dentro del nombre de una organización o si la regla de pertenencia lo permite.

**4.2 M4, la instrucción «más allá del artículo».** Se reemplaza por una que separa:
- el título, el resumen, la cita y su atribución dicen solo lo que dice el artículo;
- el análisis de relevancia puede usar contexto general, sin atribuir hechos, cifras, años ni
  pertenencias a personas.

Afecta el puntaje de relevancia, por eso es C3 y se mide antes de aplicarse.

**4.3 El candado** (`lib/personasSensibles.ts`, nuevo; reusa la lista `PUEBLOS` de
`storyCarouselGuards.ts`):

| Campo | Qué detecta | Qué hace |
|---|---|---|
| Atribución de la cita | «Nombre, …» con «indígena», un pueblo, «originario» o «Native/Indigenous» en el descriptor, **sin** marca de organización (comunidad, lof, asociación, organización, consejo, nación, confederación, federación, coordinadora, parlamento, cabildo, resguardo, tribu, *Nation*, *Tribe*, *Council*) **ni** autoridad tradicional (lonko, logko, werken, machi, cacique) | Quita la palabra étnica del descriptor. Es un campo corto y estructurado, así que la edición es segura. No regenera nada |
| Título, resumen, blurb, posts de redes | «rol + pueblo + Nombre», «el/la + pueblo + Nombre», «Nombre, … pueblo» fuera de una organización | Fallo cerrado: se regenera una vez con el aviso; si vuelve a fallar, ver C4 |
| Los mismos | Menor («niño», «niña», «adolescente», «menor de edad», edad menor de 18) o víctima de los delitos del art. 33 a menos de ~60 caracteres de un nombre propio | Fallo cerrado, igual |

**Prueba del candado, antes de enchufarlo:**
- debe cambiar las 27 etiquetas reales y dejar intactos los 16 cargos y oficinas;
- debe pescar las 6 notas de título y resumen.

Se prueba sobre las 500 en simulación, sin escribir. Los tests llevan nombres inventados con la
misma forma.

**Límite honesto.** El candado no puede saber si el original muestra que la persona se presenta
así. Por eso en la atribución quita también una etiqueta legítima, por ejemplo la de un
geógrafo que se identifica como wiradjuri: prefiere no atribuir. Es el sesgo que la EILE pide,
«no basta que un medio lo haya dicho», pero tiene un costo editorial, y por eso está en C1. El
detector tampoco ve nombres de una sola palabra ni descriptores lejos del nombre: es un piso, y
el resto lo cargan la regla en el esquema y el prompt.

### 5 · Pendientes, por tandas

**Criterio de agrupación: por quién desbloquea.**

#### Tanda C · decide el director

| # | Qué decidir | Recomendación |
|---|---|---|
| C1 | **Adoptar ya la regla de pertenencia** (M1) y su candado, como regla editorial, sin esperar al abogado. El abogado (A5.3) dirá si además es exigencia legal. Costo: la atribución de cita pierde la etiqueta étnica también cuando la persona se identifica así y el candado no lo puede ver | **Sí.** Es la doctrina de la Fundación y la promesa de la EILE §7. Toca el 5 % de las atribuciones y el 1 % de los títulos y resúmenes |
| C2 | **Lo ya publicado:** ¿se corrige hacia atrás? | Primero medir el archivo completo (B2). Después corregir solo las atribuciones de cita, con un script que simula por defecto |
| C3 | **Reemplazar «más allá del artículo»** en el análisis (M4) | Sí, midiendo antes y después el puntaje de relevancia en 20 notas |
| C4 | **Si el candado falla dos veces en una nota**, ¿qué pasa? | No se publica y queda en el panel. Volumen medido: ~1 % |
| C5 | **Las pautas por tema guardadas en la base**, que se suman a las instrucciones y nunca se revisaron | Que las leamos juntos en el panel, o con tu sesión en el navegador integrado |
| C6 | **LinkedIn:** el `#Mapuche` obligatorio (`prompts/linkedin.ts:42`) | Quitarlo de la lista obligatoria y aplicar la misma regla de hashtags de Instagram |

#### Tanda A · sin decisión de nadie, después de C1

| # | Ítem | Hecho significa |
|---|---|---|
| A1 | Las dos reglas como constantes en `prompts/shared.ts`. Reemplazar `schemas/llm.ts:192` y `:280` y `prompts/facebook.ts:55`. Ponerlas en el `.describe()` de título y atribución (`:111`, `:294`) y en los prompts de Bluesky, Mastodon, Instagram, LinkedIn, carrusel, nota con claves, introducción del boletín y podcast | Test que verifica que cada prompt y cada esquema las contiene, como `redes-declaran-ia.test.ts` |
| A2 | Candado `lib/personasSensibles.ts`, con sus tests, enchufado en el punto de escritura del análisis y de cada red | Las 27 y las 6 caen; los 16 cargos quedan intactos |
| A3 | El script de medición a `server/src/scripts/`, que simula por defecto, con el antes y el después sobre las 500 | Tabla del después en este plan |
| A4 | Spec: invariantes `EthnicityOnlyFromWithin` y `MinorsAndVictimsByRole` en `story-pipeline.allium` y `social-posting.allium`. Doc en `.context/llm-analysis.md` | Spec y doc al día |
| A5 | EILE §7 (en `.compliance/docs/`, privado): salvaguardas 2 y 3 pasan a «implementadas desde [fecha y hash]» | Fecha real del despliegue verificado |

#### Tanda B · decisión técnica, con su fundamento

| # | Ítem | Fundamento |
|---|---|---|
| B1 | En la atribución, quitar la palabra y no regenerar; en título y resumen, regenerar una vez | La atribución es un campo corto y estructurado. Editar un resumen por regex lo puede dejar roto |
| B2 | Medir el archivo completo por la API pública: 5.004 publicadas el 6-nov | Es el dato que necesita C2 |
| B3 | El candado de menores mira también la cita, no solo lo que escribe el modelo | Una cita textual de la fuente puede nombrar a la víctima |

### 6 · Riesgos nombrados

- **Quitar de más.** «Ministerio de los Pueblos Indígenas» o «Unidad de Pueblos Indígenas de la
  FAO» no son etiquetas sobre una persona. Los 16 cargos medidos son la prueba negativa del
  candado.
- **Pescar de menos.** Un nombre de una sola palabra o un descriptor lejos del nombre pasan. El
  candado es el piso, no la garantía.
- **Volumen.** Si el fallo cerrado de título y resumen (C4) supera el 2 % de lo publicado en la
  primera semana, se revisa antes de seguir.
- **Costo de regenerar.** Una llamada más del análisis por nota rechazada, sobre ~1 % de las
  notas.
