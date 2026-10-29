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
foto; hasta el 24-oct, con una ilustración de IA que inventó una escena. Cada noticia
guarda una sola imagen: para más fotos del artículo habría que capturarlas al extraer.

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
| `client/src/components/admin/StoryCarouselSection.tsx` | La sección en la ficha |

## Modificar

- **Otra regla binaria** → `storyCarouselGuards.ts` + su test, y el aviso aparece solo en
  el panel. No basta con el prompt.
- **Otro pueblo o grafía** → `PUEBLOS` en el mismo archivo. No agregar nombres que sean
  palabra corriente («Cree», «Nasa»): harían saltar el candado por un verbo.
- **Diagramación** → `storyCarouselRender.ts`; cada bloque declara su máximo de líneas,
  y el exceso vuelve como aviso `espacio`.
- **Instagram y LinkedIn** usan este mismo carrusel desde el 25-oct-2026 (decisión del
  director): `buildStoryCarouselForSocial` arma el texto informativo, sin la lectura, lo
  revisa y lo dibuja. Sin editor, **cualquier aviso rechaza**: el post de Instagram queda
  `rejected` con el motivo, y LinkedIn sale sin galería. Las láminas se suben a R2 con
  `-original-` en el nombre; un borrador sin esa marca es del carrusel anterior (resumen
  de IA) y no se publica. El pie de Instagram, en la voz de Venancio, se escribe desde el
  mismo original y pasa por `revisarPie`. Ver `instagram.md`.
