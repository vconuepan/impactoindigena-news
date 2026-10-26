# Contenido propio firmado

> **Spec:** [`.specs/own-content.allium`](../.specs/own-content.allium) — entidad, reglas de borrador y publicación, candados e invariantes. Este archivo cubre cómo está hecho y cómo se opera.

Lo que Voces Indígenas escribe y firma, a diferencia de las noticias curadas
(`story-pipeline.md`). Decisión del director del 25-oct-2026, plan
`.plans/2026-10-25_contenido-propio-y-ficha-con-claves.md`. Hoy existe una pieza, la
**editorial**; las guías y explicadores (B8 del plan) entrarán aquí.

## La editorial firmada (B5/B6)

**Flujo.** El director escribe o dicta sus notas en el panel (`/admin/editorials/:id`)
→ «Redactar borrador desde mis notas» → el modelo las ordena en su voz verificada →
el director edita el texto, fija firma y método, anota las fuentes → publica. La
página pública (`/voces-indigenas/:id`) muestra rótulo «Editorial», firma, fecha,
texto, recuadro «¿Cómo se hizo esta editorial?» y «Fuentes consultadas».

**Lo que había y por qué cambió.** Del 3-may al 25-oct-2026 el botón «Generar con IA»
escribía la columna desde las ocho noticias de mayor relevancia de la semana, con una
identidad redactada a mano en el prompt (Impacto Indígena 2023, el IRI, asesorías a
Codelco y BHP) que no era la verificada, y con la firma pegada al final del texto. Se
publicaron cero en cinco meses, mientras la página prometía «la primera editorial está en
camino». Una editorial generada sola desde titulares no es una editorial firmada.

**Las tres reglas, en el servicio y no en el panel** (`services/editorial.ts`):

| Regla | Dónde | Qué pasa si falla |
|---|---|---|
| Sin notas suficientes no hay borrador (`config.editorial.minNotesChars`, 200) | `generateEditorialContent` | `EditorialError` → 422 con el motivo |
| Sin firma ni método no se publica, y un candado bloqueante tampoco deja | `publishEditorial` / `razonesParaNoPublicar` | `EditorialError` → 422 con la lista |
| Las notas nunca salen por la API pública | `toPublicEditorial` | — (el campo no existe en la respuesta) |

**Método** (`Editorial.method`, TEXT + CHECK): `humana` (la escribió el autor; a lo más
el modelo ordenó el borrador) · `ia_revisada` (el modelo redactó desde las notas y el
autor revisó y editó) · `''` sin fijar. Al redactar desde las notas, el servicio fija
`ia_revisada` si estaba vacío y nunca pisa un valor ya puesto. La página pública tiene un
texto fijo por valor (`textoDelMetodo` en `VocesIndigenasDetail.tsx`) y no muestra nada
cuando está vacío.

**Candados** (`lib/editorialGuards.ts`, con tests): corren al generar (avisos para el
editor) y al publicar (los bloqueantes frenan).

| Tipo | Regla | Bloquea |
|---|---|---|
| `agencia` | La primera frase no abre con el medio, la Fundación ni «nosotros» (`abreConElMedio` de `storyBodyGuards.ts`) | sí |
| `conflicto` | Nunca «conflicto mapuche» | sí |
| `ia` | El texto no habla de la IA ni de cómo se escribió: el método se declara aparte | sí |
| `firma` | El nombre del autor no va dentro del texto: va en `authorName` | sí |
| `cifra` | Toda cifra del texto está en las notas (`cifrasSinRespaldo` del carrusel) | no: el autor pudo agregarla a mano |

**Prompt** (`prompts/editorial.ts`): `<GOAL>` + `<NOTAS_DEL_AUTOR>` + `<ESTRUCTURA>`
(cinco párrafos, 400-500 palabras, título de hasta 12 palabras) + `<FIDELIDAD>` + los
tres bloques de `voz-venancio.ts` + `<LENGUAJE>`. Sin `<ROLE>` (filtro de Azure). Tier
`config.editorial.modelTier` = `medium`: en la medición A1 del plan el modelo grande
costó seis veces más y falló más. `limpiarContenido` quita una firma que el modelo pegue.

**Migración.** `20261026000000_editorial_firma_metodo`: cuatro columnas en `editorials`
(`notes`, `author_name`, `method`, `sources`), idempotente, con verificación antes y
después. **El SQL va antes del despliegue del código**: una columna nueva en un modelo
existente rompe `findMany()` (P2022) si el código llega primero
(`database-migrations.md`). La aplica el director; luego `db:migrate:resolve`.

**LinkedIn.** `formatForLinkedIn` agrega la firma desde `authorName`, no del texto.

## Archivos

| Archivo | Rol |
|---|---|
| `server/src/services/editorial.ts` | Reglas, borrador, publicación, forma pública |
| `server/src/lib/editorialGuards.ts` | Los candados |
| `server/src/prompts/editorial.ts` | El prompt desde las notas |
| `server/src/schemas/editorial.ts` | Validación del panel (`EDITORIAL_METHODS`) |
| `server/src/routes/admin/editorials.ts` · `routes/public/editorials.ts` | Rutas; la pública pasa por `toPublicEditorial` |
| `client/src/pages/admin/EditorialDetailPage.tsx` | Notas, firma, método, fuentes, avisos |
| `client/src/pages/VocesIndigenas.tsx` · `VocesIndigenasDetail.tsx` | Lista y pieza públicas |

## Modificar

- **Otra regla binaria** → `editorialGuards.ts` + su test; decidir si bloquea.
- **Otro método** → `EDITORIAL_METHODS` (schema), `EditorialMethod` (shared), el CHECK en
  SQL, y `textoDelMetodo` en la página. Los cuatro a la vez.
- **Otra pieza propia (guía, explicador)** → misma spec, mismo modelo de método y firma,
  tabla propia (nunca columnas nuevas en modelos que ya se leen sin `select`).
