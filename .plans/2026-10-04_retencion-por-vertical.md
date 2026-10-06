# Retención por vertical (D4) · diseño

*Programa Las Otras Voces · Fundación KM · 4 de octubre de 2026 · documento de diseño, sin implementar*

---

## RESUMEN EJECUTIVO

**Propósito.** Que una nota pueda estar publicada en Voces Indígenas y retenida en Voces Mapuche o en Voces Araucanía hasta que un editor la libere, como pide el protocolo editorial, sin vaciar las dos verticales el día que se encienda el gate y dejando rastro de cada decisión. Es la condición D4 del director: el modo aprendizaje no se apaga sin esta pantalla, y Voces Mapuche no se lanza sin ella.

**Dónde estamos.**

| Hecho | Cifra | Fuente |
|---|---|---|
| El gate existe como función pura y no lo llama nadie | 0 llamadores | `server/src/lib/gate.ts` |
| El modo aprendizaje viene encendido y retiene todo | 100 % | `server/src/config.ts:323`, `gate.ts` |
| Caminos que hoy convierten una nota en «publicada» | 5 | `story.ts:371, 424, 478, 1107`; `maintenance.ts:50` |
| Acciones editoriales que dejan rastro en `audit_log` | 0 | `writeAuditLog` solo en auth, suscriptores, usuarios y feedback |
| Consumidores de vertical, con reglas de pertenencia distintas | 5 consumidores, 3 reglas | `communities.ts:157, 216, 427`; `feed.ts:79`; `sendCommunityDigest.ts:218` |
| Notas visibles hoy en las verticales | Mapuche 387 · Araucanía 105 | API pública, 3 y 4 de octubre |
| Notas que entrega hoy el RSS de cada vertical | Mapuche 41 · Araucanía 13 | medido el 4 de octubre: otra regla de pertenencia |

**Los movimientos.**

1. **Una fila por nota y vertical que separa la decisión de la máquina de la del editor.** La máquina la reescribe cuando cambian las listas o la nota; la del editor no la pisa nadie.
2. **Un interruptor por vertical, en tabla propia: apagado, sombra, aplicar.** En sombra la vertical muestra lo mismo que hoy salvo lo que un editor retenga a mano. Aplicar está bloqueado en el código mientras el modo aprendizaje siga encendido.
3. **Un solo filtro obligatorio para los cinco consumidores de vertical**, con un test de contrato que falla si aparece un sexto que filtre a mano.
4. **La cola del editor ordenada por fuerza de la señal, no por fecha**, con la liberación masiva bloqueada para las señales fuertes y cada decisión auditada.

**Lo que no se hace.** No se toca `Story.status` ni ninguno de sus consumidores: la casa grande, el sitemap, el RSS global, la búsqueda y el boletín siguen iguales. No se oculta nada en sombra salvo lo que retenga una persona. No se resuelve el dominio propio de cada marca (D3), ni el criterio de relevancia por marca (D5), ni permisos por vertical.

**La acción siguiente, una sola.** Que el director apruebe el diseño para empezar la Tanda A, que no cambia nada visible en el sitio.

---

## DESARROLLO COMPLETO

### 1. El problema, medido

**El protocolo pide algo que el sistema no sabe expresar.** Una nota puede estar publicada en la casa grande y retenida en una vertical, porque el umbral de lo que sale sin revisión no es el mismo donde se vive el conflicto. Hoy la visibilidad pública es una sola bandera, `Story.status === 'published'`, que leen casi cien consumidores del servidor. Si la nota está publicada, está en todas partes; si no, en ninguna.

**Encender el gate tal como está vaciaría las verticales.** `config.gate.learningMode` vale `true` salvo que la variable de entorno diga lo contrario (`config.ts:323`), y con el modo aprendizaje `evaluateGate` retiene el cien por ciento. Si la retención se conectara directo al filtro de la vertical, Mapuche pasaría de 387 notas a cero y Araucanía de 105 a cero.

**Cinco caminos producen «publicada», no uno.** El job `publish_stories` pasa por `bulkUpdateStatus` (`publishStories.ts:113`), y el panel publica por `updateStoryStatus` (menú de la fila), `publishStory` (botón principal), `updateStory` (selector del formulario) y el republicar de mantenimiento, que hace un `update` directo (`maintenance.ts:50`). Colgar el gate solo del job dejaría tres puertas abiertas.

**Ninguna decisión editorial deja rastro.** `writeAuditLog` se llama solo en autenticación, suscriptores, usuarios y feedback. La pantalla de D4 es exactamente la decisión que más necesita rastro: quién liberó una nota del conflicto en Voces Mapuche y por qué.

**Las verticales ya tienen tres reglas de pertenencia.** La página y el panel de señales usan `buildCommunityCondition` (palabras clave en título, resumen y medio, relevancia 3 o más). El RSS por vertical, el digest semanal y el correo de bienvenida exigen además uno de tres temas y buscan las palabras solo en título y resumen (`feed.ts:93-107`, `sendCommunityDigest.ts:223-236`). Medido el 4 de octubre: el RSS de Mapuche entrega 41 notas en seis meses, contra las 387 de la página.

### 2. Cómo se llegó a este diseño

Un panel de nueve agentes, el 4 de octubre: tres lectores mapearon el pipeline, las rutas de lectura y el flujo del editor con archivo y línea; tres diseñadores propusieron desde ángulos distintos; dos jueces puntuaron. El sintetizador del panel falló por falta de créditos de uso, y esta síntesis la escribió la sesión principal desde los registros completos de los ocho agentes que sí terminaron.

| Propuesta | Idea | Juez de ingeniería | Juez editorial |
|---|---|---|---|
| Mínima | Tabla de excepciones: solo lo retenido tiene fila; sin fila, visible | 20 | 22 |
| Modelo | Pertenencia materializada: cada nota de la vertical tiene fila; en aplicar, sin fila, invisible | **23** | 22 |
| Editor | Diseñada desde la cola: orden por fuerza de señal, guardia de liberación masiva, calibración por razón | 21 | **23** |

Los jueces eligieron ganadoras distintas por uno o dos puntos y coincidieron en lo que importa: los dos pidieron injertar en su ganadora la seguridad de la otra. Este diseño toma de la propuesta «modelo» el candado en el código, el filtro único y el cierre por defecto en aplicar; de la propuesta «editor» la cola, el puntaje y la regla de liberación; y de la «mínima» la tolerancia al orden de despliegue.

**Una decisión propia de la síntesis, que ninguna propuesta tomó.** Las tres agregaban `review_mode` como columna de `communities`. Los dos jueces objetaron lo mismo: si el código se despliega antes de que el director corra el SQL, `prisma.community.findMany()` pide una columna que no existe y la página de comunidades se cae, porque el despliegue regenera el cliente pero no aplica migraciones (`deploy-azure.yml:43-47`). Las propuestas lo resolvían con un procedimiento («primero el SQL»). Aquí se resuelve por construcción: **el modo va en una tabla nueva**, `community_review_modes`, y `communities` no se toca. Agregar modelos nuevos a Prisma no cambia ninguna consulta existente; si la tabla no existe, solo fallan las consultas nuevas, y esas se envuelven para que fallen hacia «apagado».

### 3. Modelo de datos

Dos tablas nuevas, cero columnas nuevas en tablas existentes. SQL idempotente con el estilo del repo (`TEXT` con `CHECK` en lugar de tipos enum, `IF NOT EXISTS`), para correrlo más de una vez sin daño.

```sql
-- Retención por vertical (D4). La aplica el director; el despliegue no aplica migraciones.
-- Sin filas en community_review_modes, todas las verticales están apagadas: es inerte.

CREATE TABLE IF NOT EXISTS community_review_modes (
  community_id TEXT PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL CHECK (mode IN ('off', 'shadow', 'enforce')),
  updated_by   TEXT,                       -- users.id, sin FK: sobrevive al borrado de la cuenta
  updated_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS story_community_reviews (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  story_id           TEXT NOT NULL REFERENCES stories(id)     ON DELETE CASCADE,
  community_id       TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,

  -- Lo que dijo la máquina: se reescribe en cada reevaluación.
  gate_decision      TEXT NOT NULL CHECK (gate_decision IN ('auto_publish', 'held_for_review')),
  gate_reasons       TEXT[] NOT NULL DEFAULT '{}',
  gate_signals       TEXT[] NOT NULL DEFAULT '{}',
  gate_score         SMALLINT NOT NULL DEFAULT 0,
  gate_learning_mode BOOLEAN NOT NULL,
  gate_text_source   TEXT NOT NULL,          -- 'short' | 'full', ver sección 5
  gate_version       TEXT NOT NULL,          -- hash de LISTA_A + LISTA_B + reglas
  gate_evaluated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Estado de la nota en ESTA vertical.
  --   auto      la máquina la deja pasar
  --   pending   la máquina la retiene y espera al editor
  --   released  el editor la liberó
  --   held      el editor la retuvo
  -- La máquina solo escribe auto y pending; released y held solo los escribe una persona.
  review_state       TEXT NOT NULL CHECK (review_state IN ('auto', 'pending', 'released', 'held')),
  review_code        TEXT CHECK (review_code IN ('sensitive', 'out_of_scope')),  -- alimenta D5
  review_note        TEXT,
  reviewed_by        TEXT,
  reviewed_at        TIMESTAMP(3),

  -- Fecha de publicación EN ESTA vertical: pubDate del RSS y del news-sitemap del dominio de marca.
  -- Se fija una sola vez y nunca vuelve a null.
  published_at       TIMESTAMP(3),

  created_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (story_id, community_id)
);

CREATE INDEX IF NOT EXISTS scr_queue   ON story_community_reviews (community_id, review_state, gate_score DESC);
CREATE INDEX IF NOT EXISTS scr_story   ON story_community_reviews (story_id);

-- El job de conciliación nace deshabilitado (patrón de 20260911000000_add_cleanup_audit_log_job).
INSERT INTO job_runs (id, job_name, cron_expression, enabled, created_at, updated_at)
VALUES (gen_random_uuid()::text, 'reconcile_community_reviews', '17 * * * *', false, NOW(), NOW())
ON CONFLICT (job_name) DO NOTHING;
```

**La escritura de la máquina nunca pisa al editor.** Toda reevaluación es un `INSERT ... ON CONFLICT (story_id, community_id) DO UPDATE ... WHERE story_community_reviews.review_state IN ('auto', 'pending')`. El fork tenía exactamente el defecto contrario: su `upsert` reescribía el estado y la fecha en cada pasada (`otras-voces/server/src/services/cascade.ts:124-130`). `published_at` se escribe con `COALESCE(story_community_reviews.published_at, EXCLUDED.published_at)`.

### 4. Qué muestra cada vertical, según su modo

| Modo efectivo | La vertical muestra | Para qué |
|---|---|---|
| `off` (sin fila en `community_review_modes`) | Lo de hoy: publicada, relevancia 3 o más, palabras clave | Las otras 14 comunidades; también el estado inicial de las dos verticales |
| `shadow` | Lo de hoy, **menos** las notas que un editor retuvo (`held`) | Registrar lo que haría el gate sin ocultar nada; el editor ya puede retener a mano |
| `enforce` | Lo de hoy, **y además** con fila en `auto` o `released` | Lo pendiente queda oculto hasta que se libere; sin fila, invisible |

**Modo efectivo.** Si una vertical está en `enforce` y `config.gate.learningMode` sigue encendido, se degrada a `shadow` y lo deja en el registro. El endpoint que cambia el modo responde 409 en ese caso. Es un candado en el código, no un aviso en una pantalla: aplicar con el aprendizaje encendido es exactamente lo que vaciaría la vertical.

**En `enforce` se exigen las dos condiciones**, las palabras clave y la fila. La fila nunca agrega una nota a la vertical; solo la deja pasar. Así, si se quita una palabra clave, la nota sale de la vertical en el acto, como hoy, sin esperar al conciliador. Agregar notas a mano a una vertical es trabajo de D5.

**Cierre por defecto.** En `enforce`, una nota que encaja en la vertical y todavía no tiene fila no se ve. Los cinco ganchos crean la fila en el momento de publicar; el conciliador cubre lo que entra por otras vías. Es el sesgo al falso positivo del protocolo aplicado a la lectura.

### 5. Dónde corre el gate y qué texto evalúa

**Cinco ganchos, una función que nunca lanza.** `registerCommunityReviews(storyIds)` en un servicio nuevo, `server/src/services/communityReview.ts`, con el mismo contrato que `writeAuditLog`: un error queda en el log y nunca interrumpe la publicación de la casa grande. Se llama después de que la nota queda publicada en:

1. `bulkUpdateStatus`, rama `published`, tras la transacción (`story.ts:478-513`). Cubre el job y `POST /bulk-status`.
2. `updateStoryStatus`, si el estado nuevo es `published` (`story.ts:424`).
3. `publishStory` (`story.ts:1107`).
4. `updateStory`, en sus dos salidas, si el estado nuevo es `published` (`story.ts:371`).
5. El republicar de mantenimiento (`maintenance.ts:50`), con una línea. Es el camino que vuelve a publicar justo la clase de nota que alguien había despublicado.

Para cada nota y cada vertical con modo distinto de `off`, la función decide la pertenencia con la misma condición que usa la página (`buildCommunityCondition`), así «lo que el gate evaluó» y «lo que la vertical mostraría» coinciden por construcción, y escribe la fila.

**El conciliador horario**, `reconcile_community_reviews`, deshabilitado de nacimiento:

- crea filas para notas publicadas que encajan en una vertical y no tienen fila (cubre cambios de palabras clave y notas viejas);
- reevalúa las filas de máquina cuando cambió la versión de las listas o la nota se editó después de evaluarse;
- borra las filas de máquina cuya nota ya no encaja o ya no está publicada;
- nunca toca `released` ni `held`;
- es idempotente: una segunda corrida no cambia nada.

**El puntaje que ordena la cola.**

| Puntaje | Cuándo | Liberación masiva |
|---|---|---|
| 3 | Encuadre narrativo «confrontación» | No: de a una |
| 2 | Algún término de la Lista A | No: de a una |
| 1 | Dos señales de la Lista B de familias distintas, si el director aprueba esa regla | Sí |
| 0 | Retenida solo por el modo aprendizaje | Sí |

**Qué texto evalúa el gate: decisión del director, con recomendación.** El comentario de `gate.ts` describe el texto completo (título, etiqueta, resumen y cuerpo de la fuente). Pero todo lo medido hasta hoy se midió sobre texto corto: título y resumen para las 787 notas publicadas, solo título para los 888 titulares argentinos, y el golden set son frases de una línea. **Recomendación: texto corto (título, etiqueta y resumen).** Tres razones: es lo que se midió y calibró; el repo ya probó la otra vía en el guardarraíl de clasificación y salieron 22 casos casi todos falsos, porque «en el cuerpo un término aparece por contexto; en el titular aparece porque es el asunto» (`clasificacion-guardarrail.ts:20-25`); y con 146 términos en la Lista A, el cuerpo completo puede duplicar la cola del editor. El script de carga inicial imprime las cifras de las dos variantes antes de escribir, para decidir con números, y la elegida queda en `gate_text_source` desde la primera fila.

### 6. Lectura: un solo filtro

`publicCommunityWhere({ community, temasVivos, mode })` en `server/src/lib/communityVisibility.ts`, con los tres parámetros obligatorios. Devuelve el `where` completo: publicada, relevancia 3 o más, `buildCommunityCondition` y la exclusión que corresponda al modo efectivo, combinados con `AND` y no con spread, porque la condición de palabras clave puede devolver `id: { in: [] }` y una exclusión por `id` la pisaría. Es la lección del fork, cuyo `publishedStoryWhere(property?)` devolvía `{}` cuando nadie pasaba la marca (`otras-voces/server/src/lib/tenant.ts:18-22`).

El modo se lee con `getReviewMode(communityId)`: una consulta propia, en `try/catch`, que ante cualquier error devuelve `off`. Si la tabla no existe todavía, la vertical se ve como hoy.

**Los cinco consumidores pasan a usarlo:**

| Consumidor | Archivo | Efecto en `off` y `shadow` |
|---|---|---|
| Página de la vertical | `communities.ts:157-161` | Idéntico a hoy salvo lo retenido a mano |
| Panel de señales | `communities.ts:216-220` | Idéntico a hoy salvo lo retenido a mano |
| RSS por vertical | `feed.ts:79-108` | **Cambia:** pasa de 41 a hasta 50 notas de Mapuche, porque deja de exigir tres temas |
| Digest semanal | `sendCommunityDigest.ts:218-241` | **Cambia** por la misma razón |
| Correo de bienvenida | `communities.ts:427-447` | **Cambia:** además empieza a exigir relevancia 3 o más, como la página |

Los tres que cambian se unifican en un paso propio, con medición antes y después, porque arreglan una divergencia y no solo agregan la retención.

**Lo que no cambia:** la portada y su snapshot, la ficha de cada nota, la búsqueda, las relacionadas, el sitemap, el RSS global, el opendata sin vertical, el boletín y el autopost. Una nota retenida en Voces Mapuche sigue publicada en vocesindigenas.org, que es lo que el protocolo admite. El autopost es una decisión aparte (sección 9).

### 7. El editor

**Pantalla `/admin/revision`, «Revisión por marca»,** en la sección Contenido del menú, con las convenciones del panel: filtros en la URL, `EditPanel` lateral, acciones masivas con diálogo de confirmación.

1. **Pestañas por marca**, solo las verticales con modo distinto de `off`.
2. **Una franja que no se puede no ver** con el modo efectivo: «Modo sombra · lo pendiente sigue visible en /comunidad/mapuche · solo se oculta lo que retengas» o «Modo aplicar · lo pendiente está oculto hasta que lo liberes».
3. **Contadores** por estado y, junto a ellos, «hoy se ven N · si aplicaras, se verían M», calculados en el servidor con la misma función que la página pública.
4. **La cola**, ordenada por puntaje y luego por fecha, con las razones del gate como etiquetas de color, las señales atenuadas y «también en: Araucanía (pendiente)» cuando la nota está en las dos.
5. **Liberar y Retener por fila**, y en masa. **Liberar en masa se desactiva si alguna nota seleccionada tiene puntaje 2 o 3**: las señales fuertes se liberan de a una. Retener en masa siempre se permite, porque es el error barato.
6. **El panel lateral** muestra título, resumen y extracto con los términos que dispararon resaltados, la decisión anterior si la hay y quién la tomó.
7. **Retener pide un código**: `sensitive` (sensible) o `out_of_scope` (fuera de ámbito). Lo segundo es el dato que alimenta D5.

**API, bajo `/api/admin/reviews`:** listar por vertical y estado con paginación; decidir una (`release`, `hold`, `reopen`); decidir en masa, con la misma guardia de puntaje en el servidor y devolviendo el conteo real de filas, no el largo de la lista (`bulkUpdateStatus` devuelve `ids.length`, `story.ts:513`, y no hay que copiarlo); estadísticas; y cambiar el modo, que solo puede hacer un administrador, responde 409 a `enforce` con el aprendizaje encendido y muestra antes el número exacto de notas que se ocultarán.

**Auditoría.** Cada decisión y cada cambio de modo escriben `audit_log` con la nota, la vertical, las razones del gate y el texto del editor. De paso, las cuatro rutas de estado de `admin/stories.ts` empiezan a auditar sus cambios con origen y destino: hoy no lo hace ninguna.

### 8. Despliegue y encendido

El orden deja de importar para la seguridad del sitio, porque todo lo nuevo falla hacia «apagado». Sigue importando para que las cosas funcionen.

1. **Desplegar el código de la Tanda A.** Sin tablas, todas las verticales leen `off`: el sitio queda igual. Verificable: los totales de las dos verticales no cambian.
2. **El director corre el SQL** y marca la migración como aplicada. Sigue inerte: no hay filas de modo.
3. **Remedir la línea base** de las dos verticales con el script, que usa el mismo `where` que la página, y dejarla en `.migraciones-log/`. Los 387 y 105 de este documento son de la API pública, no de la base.
4. **El director pasa las dos verticales a sombra.** Verificable: los totales no cambian.
5. **Carga inicial en sombra**, primero en simulación, con las cifras de las dos variantes de texto. El director elige el texto, y se aplica. Verificable: las filas por vertical igualan el total de la página; una segunda corrida no cambia nada; el total público sigue igual.
6. **Encender el conciliador.**
7. **El editor trabaja la cola en sombra.** La vista de calibración muestra, por razón del gate, qué fracción libera el editor.
8. **Apagar el modo aprendizaje** cuando se cumpla el criterio del director (sección 9). El conciliador reevalúa todo y lo que ya no retiene pasa a `auto`, respetando lo decidido por personas.
9. **Pasar Mapuche a aplicar** desde la pantalla, con el número de notas que se ocultarán a la vista. Después, redesplegar el frontend, porque el prerender hornea la lista de cada vertical en el HTML estático (`client/vite.config.ts:74`; contenido horneado según el panel, no verificado en el HTML).
10. **Araucanía**, cuando su caudal llegue a tres notas al día.

Tiempos de propagación de una liberación o una retención, según los TTL de hoy: un minuto en la página, una hora en señales, quince minutos en el RSS, hasta tres días en relacionadas.

### 9. Decisiones para el director

| # | Qué decidir | Opciones | Recomendación |
|---|---|---|---|
| 1 | Aprobar el diseño | Sí · con cambios · no | **Sí.** La Tanda A no cambia nada visible |
| 2 | Texto que evalúa el gate | Corto · completo | **Corto**: título, etiqueta y resumen (sección 5) |
| 3 | Autopost a redes con notas retenidas | Seguir igual · excluir las pendientes o retenidas en una vertical en `enforce` | **Excluir.** Una nota retenida en Voces Mapuche puede ser hoy la nota del día en seis canales media hora después de publicarse. Cuesta una condición en `findAutoPostCandidates` |
| 4 | Permisos por vertical | Ahora · después | **Después.** En la Fase 1 el protocolo concentra la edición en una persona |
| 5 | Cuándo se apaga el modo aprendizaje | Por fecha · por datos · ambos | **Ambos:** las dos semanas que fijó la revisión de ingeniería de junio, y una semana con la cola al día y el editor liberando al menos 9 de cada 10 notas de puntaje 0 |
| 6 | Dos señales B de familias distintas corroboran | Sí · no | **Sí** (ya planteada): da el puntaje 1 y cubre el epicentro del conflicto sin encuadre del modelo |

### 10. Lo que el diseño no resuelve, con dueño

| # | Pendiente | Por qué queda fuera | Cuándo |
|---|---|---|---|
| 7 | La ficha de cada nota, la búsqueda, las relacionadas y el sitemap en el dominio de una marca | Es D3: sin dominio propio no hay dónde fugarse | Antes de apuntar vocesmapuche.org. Invariante: un dominio de marca solo se apunta cuando su vertical está en `enforce` y esas rutas respetan la vertical, con test |
| 8 | El clúster de una nota expone las fuentes de notas no publicadas del mismo clúster | Defecto previo a D4 (`story.ts:1156-1171`, según el panel) | Junto con el ítem 7 |
| 9 | Las palabras clave se cambian por SQL, sin API ni auditoría | El PATCH de comunidades solo acepta `active`, `lat` y `lng` (`admin/communities.ts:35-41`) | Tanda B: PATCH de palabras clave, auditado, que dispare el conciliador |
| 10 | El archivo semilla de comunidades guarda temas que ya no existen | En producción ya se remapearon; volver a correr la semilla los restauraría | Tanda A: corregir los identificadores en la semilla |
| 11 | Pendientes sin plazo en `enforce` | Con 2,9 notas al día no urge; con las 33 fuentes nuevas, puede | Tanda B: alerta cuando la pendiente más vieja pase de 48 horas |
| 12 | La documentación de migraciones habla de Render | `.context/database-migrations.md`, desactualizada | Tanda A, junto con la doc nueva |

### 11. Pruebas

1. **Aislamiento**, un solo test: retener una nota en Mapuche y comprobar que la página, las señales, el RSS, el digest y la bienvenida de Mapuche no la muestran, y que la ficha pública, el RSS global y la vertical Araucanía, si encaja, sí.
2. **Sombra idéntica:** con todas las verticales en `off` o `shadow` y sin retenciones humanas, el `where` de los cinco consumidores es igual al de hoy, y los tests existentes de comunidades pasan sin cambios.
3. **Contrato:** un test que recorre `routes/public` y `jobs` y falla si algún archivo compone a mano estado publicado con palabras clave de comunidad sin pasar por `publicCommunityWhere`. Mismo patrón que `sitemap-sincronia.test.ts`.
4. **El editor no se pisa:** una reevaluación con listas nuevas no cambia una fila `released` ni `held`.
5. **Nunca lanza:** si la tabla no existe, los cinco ganchos siguen publicando y las verticales leen `off`.
6. **El candado:** `enforce` con aprendizaje encendido se comporta como `shadow`, y el endpoint responde 409.

### 12. Implementación, en tandas

**Tanda A · sin decisión de nadie y sin cambio visible**

1. Migración SQL de la sección 3, sin aplicar.
2. Modelos Prisma nuevos, sin tocar `Community` ni `Story` salvo los campos de relación, que no agregan columnas.
3. `lib/communityVisibility.ts`: mover `buildCommunityCondition` y `temasVivos`, agregar `publicCommunityWhere`, `getReviewMode` y `effectiveMode`, y reexportar desde la ruta para no romper a quien la importa.
4. `services/communityReview.ts`: texto, puntaje, versión de listas, registro, conciliación y estadísticas.
5. Los cinco ganchos.
6. El job del conciliador, registrado y deshabilitado.
7. El script de carga inicial, con simulación por defecto y las dos variantes de texto.
8. Página y señales de la vertical a través del filtro único.
9. Tests de las secciones 11.2 a 11.6.
10. Corregir los temas de la semilla y la documentación de migraciones; escribir `.context/community-review.md` y la regla en `.specs/story-pipeline.allium`.

**Tanda B · decisión técnica, con fundamento**

11. ✅ RSS, digest y bienvenida al filtro único (4-oct-2026). Medido antes: RSS Mapuche 44 ítems, Araucanía 14, contra 389 y 107 en la página. Después del despliegue el RSS entrega las mismas notas que la página (tope `config.feed.size`, 50).
12. ✅ API del editor (`/api/admin/reviews`) y auditoría de las cuatro rutas de estado (4-oct-2026).
13. Pantalla `/admin/revision`.
14. ✅ Test de aislamiento: contrato estático (cada consumidor pasa `mode: await getReviewMode`) + tests de ruta para RSS, digest y bienvenida (4-oct-2026).
15. PATCH de palabras clave auditado y alerta de antigüedad de la cola.

**Tanda C · decisiones del director, sección 9**

Ninguna bloquea la Tanda A. La 2 bloquea la carga inicial; la 3 y la 5, el paso a `enforce`.

### 13. Fuentes

- Registros del panel: workflow `wf_2f5ba578-ebe`, 4 de octubre de 2026, en la sesión del proyecto `otras-voces`.
- Verificado por la sesión principal en código, el mismo día: `config.ts:323`; uso de `writeAuditLog`; `story.ts:371, 424, 478, 513, 1107`; `maintenance.ts:50`; `findAutoPostCandidates`; `communities.ts` sin `select`; `publishStories.ts:113`; `admin/index.ts:32`; `admin/communities.ts:35-41`; `feed.ts:93-107`; `sendCommunityDigest.ts:223-236`; `clasificacion-guardarrail.ts:20-25`; patrón de `job_runs` en `20260911000000_add_cleanup_audit_log_job`.
- Medido el 4 de octubre en la API pública: RSS de Mapuche 41 ítems y de Araucanía 13; temas de las dos verticales vigentes en producción.
- Citado del panel y no verificado de primera mano: el contenido horneado por el prerender y el defecto del clúster.
