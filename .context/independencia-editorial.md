# Independencia editorial · el aviso de clientes (regla 2)

> **Spec:** [`.specs/story-pipeline.allium`](../.specs/story-pipeline.allium), sección «Independence notice». Este archivo cubre cómo está hecho y cómo se opera.

## La regla

«Quiénes somos» publica tres reglas que separan al medio del resto de Impacto Indígena
(`client/src/pages/AboutPage.tsx`, sección `#independencia`). La segunda: **avisa cuando una
nota informa sobre un cliente de impactoindigena.ai o de impactoindigena.legal.** Fuente:
`impactoindigena/docs/DEFINICION_TRES_VERTICALES_Y_CASA_2026-11-25.md` §2 bis, confirmada por el
director el 25-nov-2026.

**Decisión del director, 25-nov-2026: el aviso es genérico.** Dice de qué parte de Impacto
Indígena es cliente la organización, nunca cuál es. La identidad de un cliente del estudio puede
estar bajo secreto profesional. Por eso la ficha pública no recibe nombre, id ni alias, y un
test lo comprueba (`avisoClientes.test.ts`, `story.test.ts`).

## Cómo funciona

| Pieza | Dónde | Qué hace |
|---|---|---|
| La lista | `disclosure_clients` · panel `/admin/aviso-clientes` | Una fila por organización y vertical (`ai` / `legal`): nombre, alias, RUT opcional, fecha de término |
| Falsos positivos | `story_disclosure_dismissals` | «Este cliente no es de lo que informa esta nota», con motivo y quién |
| El cruce | `lib/avisoClientes.ts` (puro) · `services/avisoClientes.ts` | Al **leer** la ficha, no al publicar |
| La ficha | `getPublishedStoryBySlug` → `independenceNotice` · `components/StoryIndependenceNotice.tsx` | Aviso antes del cuerpo, en los dos idiomas |
| Redes, boletín, carrusel | `avisoParaPublicar` · `lineaDeAvisoParaPublicar` | Ver «Fuera de la ficha» abajo |

**Por qué al leer y no al publicar.** Una nota queda publicada por cinco caminos
(`registerCommunityReviews` los enumera), el cuerpo llega después de publicar (`DraftBody`) y se
edita en el panel, y la lista cambia. Un aviso guardado tendría que recalcularse en todos esos
puntos; cruzado al leer, no puede desincronizarse, y **las notas ya publicadas quedan cubiertas**
en cuanto se agrega un cliente (en menos de 60 s, el caché de la lista; el panel lo invalida al
guardar).

**Contra qué se cruza.** Título, título original, resumen, cita, atribución y las cinco partes
del cuerpo, aunque el cuerpo esté oculto por no estar revisado (C7). **No** el artículo original
completo: la extracción trae menús y «notas relacionadas» del medio. Se busca el nombre y cada
alias como palabra completa, sin tildes, mayúsculas ni puntuación (`normalizar`): «Celulosa
Arauco» no aparece en «Araucanía».

**Qué dice el aviso.** Singular o plural según cuántas organizaciones distintas; «es cliente» si
alguna relación sigue, «fue cliente» si todas terminaron (`endedOn`). Textos en
`storyPage.independence` de `locales/es.json` y `en.json`.

## Candados

| Candado | Dónde | Por qué |
|---|---|---|
| Solo organizaciones | `motivoRutInvalido`: si se anota RUT, bajo 50.000.000 se rechaza (persona natural) | Regla de la tarea: la lista nombra organizaciones, nunca personas |
| Sin origen étnico | El modelo no tiene campo de pueblo ni de origen | Regla de dato sensible del `CLAUDE.md`: la lista dice de quién es cliente, no quién es indígena |
| Alias de 3 letras o más | `terminosDe` + 422 en el panel | Una sigla de dos letras marcaría media base |
| Solo administradores | `requireRole('admin')` en todo el router, también para leer | La lista puede estar bajo secreto profesional; un editor no la ve |
| Constancia | `audit_log`: `disclosure_client.create/update/delete`, `disclosure.dismiss/restore` | Quién cambió qué y cuándo |
| Genérico | La respuesta pública solo trae `verticals`, `current`, `plural` | Decisión del director del 25-nov |

## Operar

- **Agregar un cliente:** panel → «Aviso de clientes» → «Agregar organización». Los alias son las
  formas en que la prensa lo nombra (siglas, nombre corto).
- **Revisar a quién marca:** «Ver notas» en la fila: recorre las publicadas con el mismo cruce de
  la ficha. Un homónimo o una mención al pasar se quita con «No es de ella» y un motivo.
- **Terminar una relación:** poner la fecha de término. El aviso pasa a «fue cliente»; quitar la
  fila lo borra de todas las notas.

**Migración:** `20261125000000_aviso_clientes`, dos tablas nuevas, idempotente. La aplica el
director en pgAdmin y luego `npm run db:migrate:resolve --prefix server -- --applied
20261125000000_aviso_clientes`. Sin ella, ninguna ficha lleva aviso y el panel responde 503 con
el nombre de la migración.

## Fuera de la ficha: redes, boletín y carrusel (25-nov-2026)

Formato aprobado por el director el 25-nov-2026. Las mismas frases que la ficha, sin nombre
ni enlace en las redes (el enlace a la ficha que ya lleva cada post muestra el aviso completo).
Las funciones puras viven en `lib/avisoClientes.ts` (`fraseDelAviso`, `textoDelAviso`,
`conAvisoDeIndependencia`, `sinAvisoDeIndependencia`); el cálculo es el mismo de la ficha
(`calcularAviso` en `services/avisoClientes.ts`), sin un segundo cruce.

| Superficie | Forma | Dónde | Si no cabe |
|---|---|---|---|
| Bluesky | corta | Última línea, bajo la de metadatos | 300: el gancho recibe menos espacio al generar; al publicar cede el gancho |
| X | corta | Última línea del texto, antes del enlace | 275: cede el texto, nunca el aviso ni el enlace. El texto de Bluesky que reutiliza se limpia de su aviso antes de cortar |
| Mastodon | larga | Última línea, después de las dos URL | `charLimit`: cede el gancho, nunca las URL |
| Facebook | larga | Párrafo final, antes de la línea de IA | sin tope |
| LinkedIn | larga | Párrafo final, antes de la línea de IA | 3000 con la línea de IA entera |
| Instagram (pie) | larga | Después de «Reporteó» y el enlace, antes de la línea de IA | 2200: cede el texto del modelo (`pieConAtribucion`) |
| Carrusel (panel, Instagram, PDF de LinkedIn) | frase de la ficha | Cierre, entre el logo y el título, con el rótulo «AVISO DE INDEPENDENCIA» | Hueco fijo de tres líneas; si no cupiera, aviso `espacio` (nunca se recorta) |
| Boletín | larga | Párrafo propio bajo el texto de la nota, con enlace a `/about#independencia` | — |
| Carrusel del boletín (una PNG por nota, `services/carousel.ts`) | frase de la ficha | Franja fija al pie, con el rótulo «AVISO DE INDEPENDENCIA»; el resumen se detiene antes | La frase se reparte en líneas, nunca se corta |

Corta: «Aviso: la nota menciona a un cliente / un excliente / clientes o exclientes / exclientes
de impactoindigena.legal.». Larga: «Aviso de independencia: esta nota menciona a …», la frase de
la ficha.

**Al generar y otra vez al publicar.** El borrador lo muestra en el panel; al publicar se vuelve
a calcular y se pone o se quita (`conAvisoDeIndependencia` es idempotente). Una edición en el
panel no lo borra, y un cliente agregado o descartado entre el borrador y la publicación sale
como está ese día. Mismo método que la línea de IA (`lib/ai-label.ts`).

**Si no se puede calcular, no sale** (`avisoParaPublicar`, a diferencia de `avisoParaNota` de la
ficha). Un post publicado sin su aviso queda así para siempre: el post queda `failed` (o, en
Instagram, el publicar responde error y el borrador queda como estaba), y el carrusel del panel
no se descarga. Las tablas sin crear no son un fallo: lista vacía, sin aviso. En la publicación
automática, un canal que falla así no publica en esa corrida; los demás siguen.

**Las láminas ya dibujadas.** Instagram sube las láminas al armar el borrador. Si el cierre lleva
el aviso, el nombre lleva `-original-aviso-` (`carruselConAviso`). Al publicar se coteja con el
aviso de ese momento: si no coinciden, Instagram no publica («genera el borrador de nuevo») y
LinkedIn sale sin galería, como cuando el carrusel no pasa los candados. LinkedIn solo reutiliza
las láminas de Instagram si su marca coincide.

**Límite conocido del boletín.** Se calcula al generar la edición (`generateContent`), no al
enviarla. Un cliente agregado entre la generación del sábado y el envío no aparece salvo que se
regenere la edición.

## Lo que no cubre (todavía)

La vista para bots (`routes/og.ts`, que solo sirve el `<head>`) no lleva el aviso.
