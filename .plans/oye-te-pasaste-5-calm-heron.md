# Las Otras Voces bajo Fundación KM · y qué cambia cuando impactoindigena.news pasa a ser Voces Indígenas

Plan · 2026-08-23 · repo origen `vocesindigenas` (impactoindigena.news)
Revisado por `/plan-eng-review` el 2026-08-23 · **Fase 1 ejecutada** (commit `387a249`, sin empujar)

---

## RESUMEN EJECUTIVO

**Propósito.** El nombre del medio no había que inventarlo: ya existía. El programa Las
Otras Voces declara una marca, Voces Indígenas, cuyo ámbito es literalmente lo que
impactoindigena.news hace hoy. Este plan define cómo queda el programa bajo la Fundación
KM y qué cambia exactamente en el sitio al adoptar ese nombre.

**Dónde estamos (verificado el 23-ago-2026).**

| Dato | Valor |
|---|---|
| URLs indexadas del sitio vivo | 2.866 |
| Categorías editoriales vivas | 4 (Cambio Climático · Chile Intercultural · Derechos Indígenas · Economías Indígenas) |
| Rutas públicas construidas | ~40, incluidas 6 guías jurídicas, glosario, mapa, modo contraste, API pública |
| Dominios de la familia Voces que ya son suyos | `vocesindigenas` .com/.news/.org · `vocesaraucania.cl` · `vocesmapuche.cl` |
| `vocesindigenas.cl` | a nombre de **Coñuepán y Cía**, no de la Fundación |
| `vocesaraucania` y `vocesmapuche` en .com y .news | **libres** |
| Divergencia origen ↔ fork desde el 30-jun | **74 commits** en el origen · **15** en el fork |
| Responsable del tratamiento declarado | **Fundación Coñuepan-Millaquir**, RUT 65.191.983-5 |

**Los tres movimientos.**

1. **El medio adopta el nombre que el programa ya le tenía.** Resuelve el problema de
   origen: el medio compartía nombre exacto con la consultoría.
2. **El andamiaje multi-tenant viaja del fork al origen, no al revés.** 15 commits de
   infraestructura contra 74 de producto vivo, y la brecha crece ~10 commits por semana.
3. **Araucanía y Mapuche nacen como propiedades de esa base ya viva**, no de una copia
   congelada en junio.

**Lo que NO se hace.** No se migra el sitio al fork. No se toca la consultoría Impacto
Indígena. No se enciende la compuerta editorial antes de que exista la cola que la abre.

**La acción siguiente, una sola.** Apuntar `vocesindigenas.org` a Azure y recién entonces
empujar el commit `387a249`, que ya está hecho y esperando.

---

## 1 · Contexto: por qué este cambio

El punto de partida fue una molestia con el nombre `impactoindigena.news`. La verificación
mostró que el problema era mayor de lo enunciado: **cinco propiedades comparten el string
«Impacto Indígena»** — `.com` es la consultoría, `.cl` y `.org` redirigen al Instagram
personal, `.ai` es otro producto y `.news` es el medio. Una consultora que asesora empresas
y un medio que cubre a esas empresas, con el mismo nombre, produce un conflicto de interés
aparente. Eso es credibilidad editorial, no estética.

Buscando nombre nuevo se descartaron cuatro familias enteras. El descarte más útil fue del
director: «no sé si necesariamente estamos publicando sus voces». Correcto contra un nombre
que prometiera testimonio en primera persona.

**Pero el manifiesto del programa responde esa objeción, y por eso el nombre sirve.**
Textual, `estrategia/manifiesto-voces-v2.md`:

> «En 1947, el diputado mapuche Venancio Coñuepán […] dejó dicha una frase: *«El indio no
> ha hablado todavía, pero lo hará en su oportunidad.»* Han pasado casi 80 años. Voces nace
> de esa frase: es la palabra que entonces se anunció, dicha ahora desde dentro, verificada
> y para todos.»

«Voces» no nombra un formato de contenido. Nombra una promesa histórica que se cumple.

Y el ámbito calza exacto. `estrategia/producto-y-contenidos.md` define Voces Indígenas como
«la pluralidad de los pueblos del mundo: sus luchas, propuestas y futuro», con «Agenda
internacional: derechos, ONU, jurisprudencia». El sitio vivo ya tiene
`/incidencia-internacional`, `/guia/jurisprudencia-interamericana`, `/guia/c169-pais-por-pais`
y `/guia/declaracion-onu-undrip`, y crawlea DOCIP y Corte IDH.

**Voces Indígenas no hay que construirla. Ya está construida y hoy se llama otra cosa.**

---

## 2 · El programa Las Otras Voces bajo Fundación KM

| Capa | Qué es | Dónde vive |
|---|---|---|
| **Fundación KM** (Coñuepan-Millaquir) | La institución. Financia, responde y firma | repo `fundacionkm` · `fundacionkm.cl` |
| **Programa Las Otras Voces** | El paraguas editorial: un protocolo, un método, un equipo | corpus en `estrategia/` |
| **Tres marcas públicas** | Voces Araucanía · Voces Mapuche · Voces Indígenas | una sola base de código |

### Los dos ejes (no son tres tamaños de lo mismo)

Del `arquitectura-tres-voces-kimun.md`, fundado en *Mapun Kimün* y el Convenio 169:

| Eje | Concepto | Marca | Ámbito |
|---|---|---|---|
| **che (küpan)** — linaje | de quién desciendes | **Voces Mapuche** | el pueblo, de Gulumapu a Puelmapu |
| **che (küpan)** — linaje | los pueblos | **Voces Indígenas** | la casa grande: los pueblos del mundo |
| **tuwün** — espacio | de dónde eres | **Voces Araucanía** | el territorio compartido, **con todos sus actores** |
| **tiempo** | alma transversal | — | atraviesa las tres, no es una cuarta voz |

```
                    ┌──────────────────────────────┐
   eje che          │      VOCES INDÍGENAS         │   la casa grande
   (küpan)          │   los pueblos del mundo      │
                    │  ┌────────────────────────┐  │
                    │  │    VOCES MAPUCHE       │  │   Mapuche ⊂ Indígenas:
                    │  │  el pueblo, su saber   │  │   una historia mapuche
                    │  └────────────────────────┘  │   enruta a LAS DOS
                    └──────────────────────────────┘
   ─────────────────────────────────────────────────────────────────
   eje tuwün        ┌──────────────────────────────┐
   (espacio)        │      VOCES ARAUCANÍA         │   cruza el eje che:
                    │  el territorio compartido,   │   enruta sin importar
                    │   con TODOS sus actores      │   la etnia
                    └──────────────────────────────┘
```

Implementado y testeado en `server/src/lib/cascade.ts` del fork (`routeToProperties`).

### La diferencia de gobernanza que trae el programa

Lo que hoy no existe en el sitio y el programa impone: un **protocolo editorial firmado**
(`protocolo-editorial-FINAL.md` v2.0), obligatorio para el equipo **y para el sistema de
IA**, con editor responsable, líneas rojas bilaterales (§8), glosario normativo de
terminología (§3), siete niveles de fact-check (§5), derecho a réplica (§6) y una nota
pública de conflicto de interés estructural.

---

## 3 · Qué cambia para impactoindigena.news

| Dimensión | Hoy · impactoindigena.news | Mañana · Voces Indígenas |
|---|---|---|
| **Marca** | Igual que la consultoría | Fundación KM, programa Las Otras Voces |
| **Dominio** | `impactoindigena.news` | `vocesindigenas.org` (canónico) |
| **Compuerta editorial** | **Publica sin revisión humana** | Gate §7 + editor responsable como autoridad final |
| **Estándar de lenguaje** | Reglas de capitalización y de título | + glosario normativo §3: todo término de parte va atribuido o no va |
| **Verificación** | Relevancia LLM 1-10 + sello editorial | + 7 niveles de fact-check con árbol de decisión |
| **Réplica** | No existe | Obligatoria cuando la nota alude a alguien |
| **Transparencia** | `/methodology` | + financiamiento, conflictos de interés, correcciones |
| **Formato ancla** | Nota + newsletter + 6 canales sociales | + podcast de profundidad como pilar |
| **Alcance** | Mundo y Chile mezclados en 4 categorías | El eje che completo. **No pierde contenido**: Mapuche ⊂ Indígenas |
| **Sindicación** | No aplica | Una historia sirve a varias voces vía `StoryProperty`, con crédito |

**Lo que NO cambia:** el pipeline, las ~96 fuentes, los seis canales sociales, las guías
jurídicas, el glosario, el mapa, la API pública, los widgets, el cumplimiento legal, el
responsable del tratamiento y las 2.866 URLs, que viajan con 301.

---

## 4 · Las verticales hermanas

| | Voces Araucanía | Voces Mapuche |
|---|---|---|
| **Estado** | Primera en lanzar | Fase 2 del programa, con tracción |
| **Dominio** | `vocesaraucania.cl` (Fundación KM) ✓ | `vocesmapuche.cl` (Fundación KM) ✓ |
| **Formato ancla** | «Las 5 de la Araucanía», video vertical diario | Carrusel bilingüe + explainer con mapuzugun |
| **Lo que falta de verdad** | **Corpus de fuentes regionales no indígenas.** El pipeline filtra por relevancia indígena; Araucanía cubre el territorio con todos sus actores. Eso hoy no se crawlea | Validación comunitaria de la grafía del glosario kimün, pendiente según §4 del documento de arquitectura |

`vocesmapuche.com`, `vocesmapuche.news`, `vocesaraucania.com` y `vocesaraucania.news` están
**libres**: conviene tomarlos ahora.

---

## 5 · Dominios: estado verificado y destino

| Dominio | Titular / estado | Destino |
|---|---|---|
| `vocesindigenas.org` | suyo | **canónico de Voces Indígenas** |
| `vocesindigenas.com` · `.news` | suyos | 301 al `.org` |
| `vocesindigenas.cl` | **Coñuepán y Cía** | 301 al `.org` · traspasar a Fundación KM |
| `impactoindigena.news` | suyo | 301 al `.org`, retenido 24 meses |
| `impactoindigena.com` · `.cl` · `.org` · `.ai` | suyos | **no se tocan**: son la consultoría |
| `vocesaraucania.cl` · `vocesmapuche.cl` | Fundación KM | canónicos de sus marcas |
| `vocesaraucania` / `vocesmapuche` en `.com` y `.news` | **libres** | registrar defensivamente |

**Por qué `.org` y no `.news`:** es el estándar del periodismo indígena sin fines de lucro
(`ictnews.org`, `servindi.org`) y señala fundación en vez de empresa, que es el reencuadre
que separa el medio de la consultoría.

---

## 6 · La decisión de arquitectura: el andamiaje viaja al origen

Verificado: desde el 30-jun el origen sumó **74 commits** y el fork **15**. El fork tiene
exactamente **un** servicio que el origen no tiene (`services/cascade.ts`) y le faltan nueve
del origen, entre ellos el canal de Facebook, el scraper de la Corte IDH y el digest de
agenda.

**El fork no está adelante: es una foto de junio que quedó atrás y sigue quedándose.**

La divergencia de esquema es limpia y additiva en una sola dirección:

| Solo en el origen | Solo en el fork |
|---|---|
| `DailyVisitor`, `FacebookPost`, `SocialToken` | `enum ReviewStatus`, `Property`, `StoryProperty` |

Portar el andamiaje al origen son 2 modelos, 1 enum y una migración. La operación contraria
es mover 74 commits de producto vivo. El corpus `estrategia/` se mueve al repo que quede
como único; `otras-voces` se archiva una vez portado.

---

## 7 · Secuencia · CORREGIDA EN LA REVISIÓN

El orden anterior (portar → cola de revisión) tenía un defecto de secuencia: **el gate viene
encendido por defecto** (`config.ts`: `learningMode: process.env.GATE_LEARNING_MODE !== 'false'`)
y retiene todo, pero la cola que libera lo retenido llega una fase después. Entre ambas, el
sitio deja de publicar.

Regla nueva: **cada fase es desplegable sola y observable, y la compuerta se enciende último,
cuando ya existe la válvula que la abre.**

```
  F1 ─────────► F2 ─────────► F3 ─────────► F4 ─────────► F5
  renombre      datos +       cola de       encender      Voces
  (HECHO)       backfill +    revisión      el gate       Araucanía
                filtro                                     
                gate OFF                   ▲
                                           │
  efecto para    ninguno      ninguno      primer cambio   marca nueva
  el lector:     (dominio)    visible      visible         
```

### Fase 1 · Renombrar — **EJECUTADA** (commit `387a249`, sin empujar)

146 archivos, 371 reemplazos. 1300 tests de servidor y 264 de cliente en verde. Build con
prerender: 26 HTML con `canonical`, `og:site_name` y sitemaps al dominio nuevo.

Preservado a propósito: `impactoindigena.com` y `.ai` (consultoría), los correos `noticias@`
y `contacto@` (romperían Brevo), el redirect URI de LinkedIn (registrado en la app), los
handles sociales, el bucket R2 `impacto-indigena-media`, el logo alojado en el WordPress de
la consultora, y la biografía del fundador en los prompts (fundó Impacto Indígena en 2023).

**Pendiente de infraestructura antes de empujar** — orden estricto:

1. `vocesindigenas.org` como dominio en Azure Static Web Apps, con certificado.
2. Subdominio del backend si se separa (`api.vocesindigenas.org`) — ver hallazgo H7.
3. Variables en Azure y en `server/.env` local: `SITE_URL`, `FRONTEND_URL`, `CLIENT_URL`,
   `API_URL`. **Hoy el `.env` local todavía tiene el dominio viejo**, y por eso 3 tests de
   sitemap fallan localmente y pasan con la variable correcta.
4. Empujar. `main` despliega solo. Verificar que el sitio responde en el dominio nuevo.
5. **Recién ahora** el 301 desde `impactoindigena.news`: pasarlo a naranja y crear la
   Redirect Rule. Ver H2 — el orden es deliberado, encender el proxy sobre un sitio vivo
   tiene riesgo y para este momento el dominio viejo ya no sirve nada.
6. Search Console: cambio de dirección y sitemap nuevo.

**Estado del DNS al 24-ago:** `vocesindigenas.org` ya propagó a Cloudflare (`ivan`/`melody`,
el mismo par que los demás) y está **en naranja sirviendo todavía el WordPress de
HostGator**. Para que Azure valide el dominio propio conviene ponerlo **en gris**, igual que
`impactoindigena.news`, que es la configuración que hoy funciona. El MX de HostGator **no
sobrevivió a la importación** y `mail` quedó proxeado: el correo de `@vocesindigenas.org`
está apagado. Confirmar que no había buzón vivo ahí.

### Fase 2 · Modelo de datos, backfill y filtro tenant · **con el gate apagado**

Objetivo de la fase: que el lector no note absolutamente nada. Esa es la prueba de que salió
bien.

**2a. Portar el esquema.** Del fork: `enum ReviewStatus`, `model Property`,
`model StoryProperty`, más la relación inversa `properties StoryProperty[]` en `Story`, que
el origen **no tiene** y sin la cual el esquema no compila (H4).

**2b. Renumerar la migración.** La del fork es `20260705000000_add_property_multitenant`,
anterior a **7 de las 8** migraciones que el origen sumó después (`20260707…` a `20260817…`).
Al portarla hay que renumerarla por encima de `20260817000000` (H3). Siembra las tres
propiedades en un solo `INSERT`; eso se conserva.

**2c. Backfill del archivo — PREREQUISITO DURO.** Decidido el 23-ago: **solo a Voces
Indígenas, como publicado.**

```sql
INSERT INTO story_properties (id, story_id, property_id, review_status, published_at, created_at, updated_at)
SELECT gen_random_uuid(), s.id, p.id, 'published', COALESCE(s.date_published, s.date_crawled), now(), now()
FROM stories s CROSS JOIN properties p
WHERE p.key = 'indigenas' AND s.status = 'published'
ON CONFLICT (story_id, property_id) DO NOTHING;
```

Sin este paso el archivo entero desaparece el día que se cablea el filtro (H1). Araucanía y
Mapuche arrancan en cero y bajo protocolo, sin importar deuda editorial. Reversible con un
`DELETE` acotado a `property.key='indigenas'`.

**2d. Portar el andamiaje**, con las tres correcciones que la auditoría del fork dejó
identificadas y que **no deben portarse tal cual**:

- `lib/tenant.ts` debe **fallar cerrado**: hoy `publishedStoryWhere(undefined)` devuelve `{}`,
  o sea sirve todo sin filtro. Y es el único de los cuatro módulos sin archivo de test.
- El filtro debe cablearse en las **seis rutas públicas que hoy lo saltan** — `homepage.ts`,
  `feed.ts` (RSS), `sitemap.ts`, `spotlight.ts`, `coverage.ts`, `stats.ts` — y
  `getHomepageData(issueSlugs, storiesPerIssue)` debe aceptar propiedad, cosa que hoy ni
  siquiera contempla.
- El upsert de `StoryProperty` en `services/cascade.ts` no debe sobrescribir un
  `reviewStatus` que ya tocó un editor.

**2e. Implementar `Property.active`.** La columna existe y **nadie la lee** (H5). Es el
interruptor del lanzamiento escalonado que este plan da por hecho: con `active=false`,
`araucania` y `mapuche` no sirven nada aunque tengan vínculos. Sin esto, el día que se cablea
el filtro las dos marcas quedan públicas sin haberlo decidido.

**2f. Gate apagado durante toda la fase.** `GATE_LEARNING_MODE=false` y `Property.active`
solo en `indigenas`. El comportamiento observable no cambia.

### Fase 3 · La cola de revisión humana

Ruta admin y pantalla para listar `held_for_review` por propiedad, aprobar, rechazar y dejar
registro. `storiesForProperty()` ya existe para eso y hoy no tiene un solo llamador.

```
   máquina de estados de StoryProperty.reviewStatus

              routeStories()
                    │
          gate.held │
        ┌───────────┴───────────┐
        ▼                       ▼
  held_for_review ──────►  published ──────► (visible en esa propiedad)
        │      editor aprueba      ▲
        │                          │  ⚠ hoy el upsert puede revertir
        │ editor rechaza           │     una decisión del editor (2d)
        ▼                          │
     rejected ─────────────────────┘
```

### Fase 4 · Encender el gate

`GATE_LEARNING_MODE=true` durante ~2 semanas de calibración, con la cola ya operativa y la
auditoría por muestra del §7.4. Recién aquí el protocolo editorial entra en vigor de verdad.

### Fase 5 · Voces Araucanía

Necesita el corpus de fuentes regionales no indígenas —trabajo de fuentes, no de código— y el
protocolo firmado. `Property.active` pasa a `true` para `araucania` el día del lanzamiento.

---

## 8 · Hallazgos de la revisión de ingeniería

Formato: `[severidad] (confianza N/10) archivo:línea — descripción`.

| # | Hallazgo | Estado |
|---|---|---|
| H1 | **[P0]** (10/10) El archivo de 2.866 historias desaparece sin backfill | resuelto en 2c |
| H2 | **[P0]** (8/10) El 301 comodín de Azure SWA no preserva la ruta | resuelto abajo |
| H3 | **[P1]** (10/10) La migración del fork tiene timestamp anterior a 7 del origen | resuelto en 2b |
| H4 | **[P1]** (10/10) Falta `properties StoryProperty[]` en el `Story` del origen | resuelto en 2a |
| H5 | **[P1]** (10/10) `Property.active` no lo lee nadie | resuelto en 2e |
| H6 | **[P1]** (9/10) Sin rollback ni interruptor para el multi-tenant | resuelto abajo |
| H7 | **[P2]** (6/10) CSP `connect-src 'self'` vs API en subdominio | a verificar |
| H8 | **[P1]** (10/10) Orden de fases: el gate se encendía antes de existir la cola | resuelto en §7 |
| H9 | **[P2]** (10/10) El plan no reflejaba que la Fase 1 ya se ejecutó | resuelto |
| H10 | **[P2]** (9/10) La verificación no probaba lo que más importa | resuelto en §10 |
| H11 | **[P2]** (8/10) Sin diagramas de flujo ni de estados | resuelto en §2, §7 |

### H1 · El archivo desaparece · P0 · confianza 10/10

`server/src/lib/tenant.ts:23-30` exige un `StoryProperty` con `reviewStatus:'published'`:

```ts
return { properties: { some: { property: { key: property }, reviewStatus: 'published' } } }
```

Las 2.866 historias existentes no tienen ninguna fila en `story_properties`, y
`routeStories` solo corre sobre historias en estado `selected`
(`jobs/publishStories.ts:53,66`). No hay script de backfill: los cinco que existen en el
fork son de imágenes, traducciones, Austral, TC y Wayback. **Resuelto en 2c.**

### H2 · El 301 comodín de Azure SWA no preserva la ruta · P0 · confianza 8/10

El plan decía «regla comodín de 301 en Azure Static Web Apps». El `redirect` de
`staticwebapp.config.json` acepta un destino **literal**, sin captura ni sustitución de la
ruta. Un `"route": "/*", "redirect": "https://vocesindigenas.org/"` mandaría las 2.866 URLs a
la portada, y Google lee eso como soft 404 masivo. **Es exactamente el problema que ya
costó un arreglo en el PR #18.**

**Corrección 1 (descartada):** hacerlo en el backend por cabecera `Host`. **No sirve.**
Azure SWA sirve el estático directo desde el CDN y solo enruta al backend lo que
`staticwebapp.config.json` reescribe: `/stories/*`, `/sitemap.xml`, `/sitemap-news.xml`,
`/feed` y `/podcast/feed.xml`. La portada, `/issues`, las seis guías y los 26 HTML
prerenderizados **nunca llegan al backend**, así que un 301 ahí cubriría una fracción del
sitio y el resto seguiría respondiendo 200 en el dominio viejo.

```
  petición a impactoindigena.news/guia/pueblo-mapuche
        │
        ▼
  SWA  ──► estático desde el CDN ──► 200          ✗ el backend nunca lo ve

  petición a impactoindigena.news/stories/foo
        │
        ▼
  SWA  ──► rewrite a /api/og/story-html ──► backend  ✓ solo esta rama
```

**Corrección 2 (la buena): Redirect Rule de Cloudflare**, que actúa en el borde y ve
**todas** las rutas.

```
  (http.host eq "impactoindigena.news")
     → concat("https://vocesindigenas.org", http.request.uri.path)
     → 301 permanente, preserve query string
```

Requisito: `impactoindigena.news` debe estar **proxeado (naranja)**; hoy está en gris, con
el A apuntando directo a Azure, así que el tráfico no toca el borde de Cloudflare y la regla
no dispararía.

**Y el orden importa, porque encender el proxy sobre un sitio vivo tiene riesgo** (Azure SWA
detrás del proxy exige modo SSL «Full (strict)» o da bucles y 526):

1. Primero `vocesindigenas.org` sirve el sitio desde Azure.
2. Recién entonces `impactoindigena.news` pasa a naranja. Para ese momento ya no sirve nada,
   solo redirige, así que el riesgo de encender el proxy es mínimo.

Verificación obligatoria: la ruta se conserva en el destino, no solo el dominio.

### H6 · Sin rollback ni interruptor · P1 · confianza 9/10

El multi-tenant entra a producción sin forma de apagarlo salvo desplegando hacia atrás. Con
`Property.active` implementado (2e) más una variable `TENANT_FILTER_ENABLED`, el remedio pasa
de un deploy a un toggle. Regla: **ninguna fase de este plan se despliega sin una vía de
vuelta que no sea un deploy.**

### H7 · CSP vs API en subdominio · P2 · confianza 6/10 · a verificar

`client/public/staticwebapp.config.json` fija
`Content-Security-Policy: … connect-src 'self' …`. Hoy la API es del mismo origen: SWA
reescribe `/api/*` al backend enlazado. Pero el `.env.sample` quedó apuntando a
`api.vocesindigenas.org`, lo que sugiere lo contrario. **Si el navegador pasa a llamar a un
subdominio, la CSP lo bloquea** y hay que agregarlo a `connect-src`. Confirmar cuál de los
dos es el arreglo real antes de tocar el DNS.

---

## 9 · Qué ya existe y se reusa (no se reconstruye)

| Necesidad | Ya existe | Se reusa |
|---|---|---|
| Enrutamiento por ámbito editorial | `lib/cascade.ts` · `routeToProperties()` | sí, tal cual |
| Compuerta de sensibilidad | `lib/gate.ts` · listas A y B del §7 | sí, con §7.3 pendiente |
| Filtro por propiedad | `lib/tenant.ts` · `publishedStoryWhere()` | sí, **corrigiendo el fallo abierto** |
| Cola de revisión | `lib/tenant.ts` · `storiesForProperty()` | **sí: existe y no tiene llamadores** |
| Resolución de tenant | `middleware/property.ts` | sí, tal cual (400/403 correctos) |
| Siembra de las tres propiedades | migración `…_add_property_multitenant` | sí, renumerada |
| Reescritura de `/stories/*` al backend | `staticwebapp.config.json:16-18` | sí, habilita el 301 de H2 |
| Tests del andamiaje | 4 archivos, 25 tests verdes | sí, más uno nuevo de `tenant.ts` |

---

## 10 · Verificación

### Fase 1 (código listo; ejecutar tras el DNS)

1. `npm run test --prefix server` y `npm run test --prefix client -- --run`. **Ya en verde:
   1300 y 264.** Los 3 de sitemap requieren `SITE_URL` actualizada.
2. `npm run build --prefix client`. **Ya verificado**: 26 HTML, 336 referencias al dominio
   nuevo, y las únicas viejas son los enlaces intencionales a la consultora y al `.ai`.
3. En vivo, con cache-buster (el CDN cachea 60 s):
   - `curl -sI https://impactoindigena.news/stories/<slug>` → **301**, y el `Location`
     debe traer **la misma ruta**, no la raíz. Es la prueba de H2.
   - La misma URL en `vocesindigenas.org` → **200**.
   - `https://vocesindigenas.org/sitemap.xml` → 2.866 `<loc>` con el dominio nuevo.
4. Search Console: cambio de dirección enviado, sitemap aceptado, y a los pocos días la
   cobertura del dominio nuevo sube sin picos de 404.

### Fase 2 — la prueba es que nada cambie

1. Antes de cablear el filtro: `SELECT count(*) FROM stories WHERE status='published'` y
   `SELECT count(*) FROM story_properties sp JOIN properties p ON p.id=sp.property_id
   WHERE p.key='indigenas' AND sp.review_status='published'`. **Los dos números deben ser
   iguales.** Si no, el backfill quedó corto y el archivo se va a perder.
2. Los 25 tests del andamiaje verdes tras el port, más el test nuevo de `lib/tenant.ts`.
3. Test de extremo a extremo: una historia enrutada solo a `mapuche` **no** aparece en la
   portada, ni en el RSS, ni en el sitemap de `indigenas`. Hoy aparecería en las seis rutas
   que saltan el filtro.
4. Con `Property.active=false` en `araucania` y `mapuche`, sus dominios no sirven nada.
5. Comparar el conteo de la portada antes y después del deploy. Debe ser idéntico.

---

## 11 · NO está en alcance

| Descartado | Por qué |
|---|---|
| Migrar el sitio al fork `otras-voces` | El fork está 74 commits atrás; se archiva tras portar el andamiaje |
| Backfill de las 2.866 a Mapuche y Araucanía | Se curaron sin compuerta; importarlas violaría el protocolo que esas marcas exigen |
| Implementar el §7.3 del protocolo (las 13 categorías disparadoras) | No bloquea el renombre ni el multi-tenant; entra con la Fase 4 |
| Ramificar el gate por propiedad (`GateOptions.property`) | Declarado y sin usar; entra con la Fase 4 |
| Cambiar los correos a `@vocesindigenas.org` | Rompe Brevo hasta verificar el dominio nuevo |
| Renombrar los handles sociales y el repo | Acción manual del director |
| Un logo propio de Voces Indígenas | Trabajo de diseño, no de código. Hoy el newsletter usa el logo de la consultora, que es la confusión que este plan resuelve en todo lo demás |
| Traspaso de `vocesindigenas.cl` a Fundación KM | Trámite, no código |

---

## 12 · Decisiones abiertas

1. **`.org` o `.news` como canónico** de Voces Indígenas. Recomendado `.org`; no bloquea.
2. **La cola de revisión, ¿por propiedad o única?** Recomendado por propiedad: el az de cada
   marca es distinto y el protocolo hace responsable al editor de esa publicación.
3. **La firma de las editoriales.** Hoy dice «Fundador de Impacto Indígena» porque es cierto.
   En un medio llamado Voces Indígenas reintroduce la confusión.
4. **Validación comunitaria de la grafía** de los 17 términos del glosario kimün. Bloquea el
   uso público del glosario, no el renombre.
5. **H7**: confirmar si el navegador llamará a un subdominio de API.

---

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| plan-eng-review (arquitectura, calidad, tests, rendimiento) | issues_found | 11 (2 P0 · 5 P1 · 4 P2) |
| Backfill decidido con el director (D1) | resolved | opción A: solo `indigenas`, como publicado |
| Outside voice | **skipped** | Codex no instalado; el fallback por subagente no está autorizado en esta sesión |

Cobertura de tests del plan tras la revisión: `lib/tenant.ts` pasa de 0 a tener archivo
propio; se agrega la prueba de aislamiento extremo a extremo (una historia de `mapuche` no
debe verse en `indigenas`) y la verificación de conteo del backfill, que es la que atrapa H1
antes de que el lector lo note.

VERDICT: el plan es ejecutable tras las correcciones. Los dos P0 —el archivo que desaparece y
el 301 que pierde la ruta— habrían pasado a producción sin esta revisión, y los dos afectan
las mismas 2.866 URLs. El cambio de mayor valor no fue un hallazgo suelto sino el reorden de
las fases: la compuerta editorial ahora se enciende cuando ya existe la cola que la abre.

**UNRESOLVED DECISIONS:**
- TLD canónico de Voces Indígenas: `.org` (recomendado) o `.news`
- Cola de revisión por propiedad o única
- Firma de las editoriales bajo la marca nueva
- Validación comunitaria de la grafía del glosario kimün
- H7: si el navegador llamará a `api.vocesindigenas.org`, la CSP necesita ese origen
