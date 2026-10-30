# Carrusel de una noticia

Desde la ficha de una noticia publicada en el panel (`/admin/stories` → abrir la
noticia → sección **Carrusel**), un editor arma un carrusel con el formato de Voces
Indígenas: el texto lo propone el modelo, el editor lo corrige, y se descarga como
imágenes y PDF. **No publica nada ni escribe en la base.**

Pedido del director el 23-oct-2026. Sus decisiones:

| Decisión | Qué quedó |
|---|---|
| Voz | Informativo por defecto. Una casilla agrega **la lectura de Venancio Coñuepán Mesías**: una lámina en su voz, marcada con su nombre, que no se le atribuye al medio |
| Marca | Sale como Voces Indígenas: el lienzo, la paleta, el logo y el pie de `lib/carouselGen.ts` |

## La regla de fondo: el original, no el resumen

El texto se arma desde `story.sourceContent` (el artículo que extrajo el rastreador),
**nunca** desde `summary`, `relevanceReasons` ni ningún campo que escribió la IA de
Voces. El 8-sep-2026 se midió una ficha que tituló «familias indígenas» donde el
reportaje de Mongabay nunca usó la palabra. Cada lámina se publica con
«Reporteó: <medio>» al pie, así que todo lo que dice tiene que estar en lo que ese
medio reporteó.

## Flujo

1. **Texto** · `POST /api/admin/stories/:id/carousel` `{ conLectura }` → llama al modelo
   (tier `config.storyCarousel.modelTier`, hoy `medium`) y devuelve
   `{ laminas, lectura, atribucion, avisos }`. Rechaza con 422 y dice por qué si:
   - la URL guardada es de `news.google.com` (no se sabe qué medio reporteó);
   - el original tiene menos de `minSourceChars` (1200): suele ser solo la bajada del feed.
2. **Vista previa** · `POST …/carousel/preview` `{ laminas, lectura }` → las láminas como
   data URLs JPEG y los avisos del texto **editado**.
3. **Descarga** · `POST …/carousel/download` → ZIP con `lamina-NN.jpg` (1080×1350) y un
   PDF de una lámina por página (el formato de carrusel de LinkedIn). **422 si queda
   algún aviso.**

El borrador vive en `localStorage` (`carrusel-borrador:<storyId>`) hasta descartarlo. El
botón de descarga solo se habilita con una vista previa del texto actual y sin avisos.

Quién lo usa: quien entra al panel. Las rutas cuelgan de `/api/admin`, que exige
`requireRole('admin', 'editor')`; el rol sale de `User.userType`, y hoy solo `ADMIN`
produce uno de los dos.

## Formato (criterio de la skill `radar-indigena`)

Portada (gancho de 6 a 14 palabras + bajada) · desarrollo, una idea por lámina en 25 a
40 palabras · cierre. De 6 a 8 láminas; con la lectura, el desarrollo baja a 4–5 para no
pasar de 8. El cierre dibuja aparte, sin pasar por el modelo: «Lee la nota completa»
con medio, autor, título original y dominio (art. 71 B de la Ley 17.336: fuente,
título y autor), y la línea fija de IA (`AI_LABEL`).

**La foto es del medio, o no hay foto** (decisión del director, 29-oct-2026). La
portada lleva a sangre la fotografía con que el medio publicó la nota, con el degradado
de tinta y «Foto: <medio>» a la derecha de «Reporteó»; el cierre la repite muy
oscurecida, con el crédito bajo el dominio. `lib/fotoDelMedio.ts` decide por el nombre
del objeto (la misma tabla que rotula el sitio, `client/src/lib/story-image.ts`):
`oghero-` y las servidas desde el dominio del medio van; `storycard-` (trae nuestra
marca y el título) y las de IA (`<uuid>-<ms>`) no. Sin foto, o si no se puede bajar,
las dos láminas salen con el fondo de marca. Del 23 al 29-oct el carrusel salió sin
foto; hasta el 24-oct, con una ilustración de IA que inventó una escena.

**Cuando la imagen guardada no es del medio, la foto se busca en el original**
(30-oct-2026). `story.imageUrl` la elige el job de publicación para el sitio, no para
el carrusel: a las destacadas (relevancia ≥ `heroAiMinRelevance`, hoy 8) les pone una
ilustración de IA sin pedir siquiera la og:image, y a las demás con una og:image de
menos de 1200 px se la funde en la tarjeta compuesta. El job social elige por
relevancia, así que elige destacadas: del 29 al 30-oct los carruseles de Instagram
siguieron saliendo sin foto aunque el medio sí tenía una. `fotoDePortada`
(`services/storyCarousel.ts`) pide entonces la og:image al artículo original
(`fetchOgImage`, en vivo, por la guardia SSRF) y la dibuja en la portada y el cierre:
es la foto con que el medio publicó la nota, servida desde su sitio, y queda dentro del
JPEG de la lámina (no se enlaza). Una foto de menos de 480 px de ancho
(`FOTO_ANCHO_MINIMO`) no va a sangre con el crédito del medio: la lámina sale sin foto.
Sin og:image, o si la página ya no responde, el fondo de marca.

**Más fotos del mismo medio, en el desarrollo** (pedido del director, 29-oct-2026).
Cada noticia guardaba una sola imagen (la og:image) y el extractor conservaba solo el
texto. Desde el 29-oct el extractor captura también las `<img>` del cuerpo del artículo
(`lib/fotosDelArticulo.ts`, tabla `story_images`; ver `content-extraction.md`), el job de
publicación las rehospeda en R2 como `ogfoto-<storyId>-NN` (`rehostArticlePhoto` en
`lib/imageStorage.ts`, mismo tope de tamaño y misma guardia SSRF que la og:image; una foto
de menos de 480 px de ancho no se sube), y el render las pone en las láminas de
desarrollo, una por lámina en el orden del artículo, enmarcadas arriba del texto y con
«Foto: <medio>» a la derecha de «Reporteó». Solo las rehospedadas: una fila sin
`hosted_url` no se dibuja.

La regla que manda sobre la foto: **el texto no cede ni una línea.** Los máximos de
líneas de la lámina de desarrollo son los mismos con y sin foto (3 de título, 10 de
texto), así que la foto no puede producir un aviso `espacio` que antes no existía, y en
Instagram un aviso rechaza el post entero. La foto se dibuja solo si, con el texto ya
medido, queda sitio para un marco de al menos 300 px (tope 500, desde y=200 y con 40 px
de aire); si no, esa lámina sale sin foto. Medido el 29-oct con la fuente real y textos del
formato del prompt (25–40 palabras): con título de una línea quedan entre 398 y 572 px;
con uno de tres líneas, entre 258 y 432; con 48 palabras, 282 o 142. En una prueba con
cuatro láminas de desarrollo (25, 32 y 40 palabras con título de tres líneas, y una de
diez líneas justas), salieron con foto las dos primeras y las otras dos como siempre, sin
ningún aviso (`storyCarouselRender.test.ts`).

Solo aplica a noticias extraídas después del cambio: no hay backfill, y el director no lo
pidió. Hasta que el SQL de `story_images` se aplique en producción, el rastreo guarda las
noticias sin sus fotos (un aviso en el log por noticia) y el carrusel sale como el 29-oct.

**Atribución** (`atribucionDe` en `services/storyCarousel.ts`): `publisherFromUrl`; si
devuelve el dominio pelado y el feed no es Google News, firma con el nombre del feed
(«Indian Country Today» en vez de «ictnews.org»). Autores genéricos (`admin`,
`redacción`…) se omiten.

## Candados (`lib/storyCarouselGuards.ts`)

Reglas binarias, así que van en código además del prompt. Corren al generar (avisos
informativos) y otra vez al dibujar, sobre el texto editado, que es el único punto de
salida.

| Tipo | Regla | Dónde aplica |
|---|---|---|
| `cita` | Lo que va entre comillas está letra por letra en el original. Una traducción va en estilo indirecto | todas |
| `identidad` | «indígena» solo si el original lo dice o nombra a un pueblo | todas |
| `pueblo` | Un pueblo nombrado en la lámina está nombrado en el original (grafías y plural normalizados) | todas |
| `cifra` | Todo grupo de dígitos de la lámina está en el original | láminas informativas, no la lectura |
| `espacio` | El texto cabe en la lámina; nunca se recorta en silencio | todas (lo detecta el dibujo) |

La píldora de la portada lleva el tema de Voces (`issue.name`), que asigna la IA del
pipeline. Pasa por los mismos candados de identidad y pueblo (`temaRespaldado`): si el
original no respalda «Derechos Indígenas», la portada sale sin píldora.

**Límite conocido del de cifras:** comprueba que la cifra exista en el original, no que
esté pegada al hecho correcto. En la prueba del 23-oct el modelo escribió «instaló un
centro de datos en 2022»: 2022 era el año de la inundación, no de la instalación, y el
candado no lo ve. Lo revisa el editor.

## Lo que se midió el 23-oct-2026 (tres noticias reales, base local)

- **El modelo inventó un año en dos de dos pruebas** («19 de octubre de 2024» donde
  Mongabay decía «el lunes 19 de octubre»; «en 2023» en la de ICT). Por eso existe el
  candado `cifra`.
- Pegó «Reporteó: ictnews.org» al final del cierre aunque el prompt lo prohíbe:
  `sinFirmaDelModelo` lo quita.
- Una errata del modelo («projetos») pasó: ningún candado revisa ortografía.
- Costo por carrusel, con gpt-4.1-mini a precio global de Azure (US$0,40 / 1M de
  entrada y US$1,60 / 1M de salida, API de precios de Azure): 3.294 + 392 tokens
  → US$0,0019 (informativo, 10.726 caracteres); 3.716 + 352 → US$0,0020 (con lectura,
  6.589 caracteres). Dibujar y empaquetar no usa IA.

## Archivos

| Archivo | Rol |
|---|---|
| `server/src/routes/admin/story-carousel.ts` | Las tres rutas |
| `server/src/services/storyCarousel.ts` | Carga, atribución, llamada al modelo, candados, ZIP |
| `server/src/prompts/story-carousel.ts` | El prompt (sin `<ROLE>`: ver `prompting.md` y la memoria del filtro de Azure) |
| `server/src/schemas/llm.ts` | `storyCarouselSchema`, `storyCarouselWithReadingSchema` (`.describe()` al mínimo) |
| `server/src/schemas/storyCarousel.ts` | Validación de los cuerpos |
| `server/src/lib/storyCarouselGuards.ts` | Los candados |
| `server/src/lib/storyCarouselRender.ts` | Las láminas, el PDF y el ZIP |
| `server/src/lib/carouselGen.ts` | Lienzo, paleta, logo y pie compartidos con Instagram |
| `server/src/lib/fotosDelArticulo.ts` | Captura y depura las `<img>` del cuerpo al extraer (iconos, píxeles, repetidas, la og:image fuera) |
| `server/src/lib/fotoDelMedio.ts` | Decide si una imagen es del medio (`oghero-`, `ogfoto-`, externa) o no (IA, `storycard-`); `FOTO_ANCHO_MINIMO` |
| `server/src/lib/extract-og-image.ts` | `fetchOgImage`: la og:image del artículo original, para la portada cuando la guardada no es del medio |
| `server/src/jobs/publishStories.ts` | `rehostStoryPhotos`: rehospeda las fotos del cuerpo al publicar (`ogfoto-<storyId>-NN`) |
| `client/src/components/admin/StoryCarouselSection.tsx` | La sección en la ficha |

## Modificar

- **Otra regla binaria** → `storyCarouselGuards.ts` + su test, y el aviso aparece solo en
  el panel. No basta con el prompt.
- **Otro pueblo o grafía** → `PUEBLOS` en el mismo archivo. No agregar nombres que sean
  palabra corriente («Cree», «Nasa»): harían saltar el candado por un verbo.
- **Diagramación** → `storyCarouselRender.ts`; cada bloque declara su máximo de líneas,
  y el exceso vuelve como aviso `espacio`. **No bajar esos máximos para hacerle sitio a
  la foto**: subirían los rechazos de Instagram. Si se cambia el marco (`MARCO_MIN`,
  `MARCO_MAX`), volver a medir con láminas reales y mirar `fotosDibujadas` en el log.
- **Qué se descarta como «no foto»** → `RUTA_NO_FOTO` y los mínimos en
  `fotosDelArticulo.ts`, con test. El sesgo es hacia descartar: un ícono publicado con el
  crédito del medio cuesta más que una lámina sin foto.
- **Instagram y LinkedIn** usan este mismo carrusel desde el 25-oct-2026 (decisión del
  director): `buildStoryCarouselForSocial` arma el texto informativo, sin la lectura, lo
  revisa y lo dibuja. Sin editor, **cualquier aviso rechaza**: el post de Instagram queda
  `rejected` con el motivo, y LinkedIn sale sin galería. Las láminas se suben a R2 con
  `-original-` en el nombre; un borrador sin esa marca es del carrusel anterior (resumen
  de IA) y no se publica. El pie de Instagram, en la voz de Venancio, se escribe desde el
  mismo original y pasa por `revisarPie`. Ver `instagram.md`.
