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

## Lo que no cubre (todavía)

Las redes (seis canales), el boletín, el carrusel y la vista para bots (`routes/og.ts`, que solo
sirve el `<head>`) no llevan el aviso. `clientesMencionados` y `avisoDeIndependencia` son puras y
sirven para agregárselo.
