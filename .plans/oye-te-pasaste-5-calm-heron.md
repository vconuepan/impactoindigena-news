# Las Otras Voces bajo Fundación KM · y qué cambia cuando impactoindigena.news pasa a ser Voces Indígenas

Plan · 2026-08-23 · repo origen `vocesindigenas` (impactoindigena.news)

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
| Dominios de la familia Voces que ya son suyos | `vocesindigenas` .com/.news/.org · `vocesaraucania.cl` · `vocesmapuche.cl` (los dos .cl a nombre de Fundación KM) |
| `vocesindigenas.cl` | a nombre de **Coñuepán y Cía**, no de la Fundación |
| `vocesaraucania` y `vocesmapuche` en .com y .news | **libres** |
| Divergencia origen ↔ fork desde el 30-jun | **74 commits** en el origen · **15** en el fork |

**Los tres movimientos.**

1. **El medio adopta el nombre que el programa ya le tenía.** impactoindigena.news pasa a
   ser Voces Indígenas. Resuelve de una vez el problema de origen (el medio compartía
   nombre exacto con la consultoría) y deja de haber dos identidades para un solo producto.
2. **El andamiaje multi-tenant viaja del fork al origen, no al revés.** Son 15 commits de
   infraestructura contra 74 de producto vivo, y la brecha crece ~10 commits por semana.
   Mover el andamiaje es una fracción del costo de mover el producto.
3. **Araucanía y Mapuche nacen como propiedades de esa base ya viva**, no de una copia
   congelada en junio.

**Lo que NO se hace.** No se migra el sitio al fork. No se toca la consultoría Impacto
Indígena, que se queda con su nombre y sus cuatro dominios. No se lanza Araucanía antes de
que exista la cola de revisión humana que el protocolo exige.

**La acción siguiente, una sola.** Renombrar el sitio a Voces Indígenas con destino
`vocesindigenas.org`, en una sola migración de SEO.

---

## 1 · Contexto: por qué este cambio

El punto de partida fue una molestia con el nombre `impactoindigena.news`: se confunde con
la matriz y no distingue. La verificación mostró que el problema era mayor de lo enunciado:
**cinco propiedades comparten el string «Impacto Indígena»** — `.com` es la consultoría,
`.cl` y `.org` redirigen al Instagram personal, `.ai` es otro producto y `.news` es el
medio. Una consultora que asesora empresas y un medio que cubre a esas empresas, con el
mismo nombre, produce un conflicto de interés aparente. Eso es credibilidad editorial, no
estética.

Buscando nombre nuevo aparecieron y se descartaron cuatro familias enteras. El descarte más
útil fue suyo: «no sé si necesariamente estamos publicando sus voces». Era correcto contra
un nombre que prometiera testimonio en primera persona.

**Pero el manifiesto del programa responde esa objeción, y por eso el nombre sirve.**
Textual, `estrategia/manifiesto-voces-v2.md`:

> «En 1947, el diputado mapuche Venancio Coñuepán […] dejó dicha una frase: *«El indio no
> ha hablado todavía, pero lo hará en su oportunidad.»* Han pasado casi 80 años. Voces nace
> de esa frase: es la palabra que entonces se anunció, dicha ahora desde dentro, verificada
> y para todos.»

«Voces» no nombra un formato de contenido. Nombra una promesa histórica que se cumple, con
linaje propio. Esa fundamentación no la tenía ninguno de los nombres que se propusieron.

Y el ámbito calza exacto. `estrategia/producto-y-contenidos.md` define Voces Indígenas como
«la pluralidad de los pueblos del mundo: sus luchas, propuestas y futuro», con «Agenda
internacional: derechos, ONU, jurisprudencia» y fuentes OHCHR, DOCIP, IWGIA. El sitio vivo
ya tiene `/incidencia-internacional`, `/guia/jurisprudencia-interamericana`,
`/guia/c169-pais-por-pais` y `/guia/declaracion-onu-undrip`, y crawlea DOCIP y Corte IDH.

**Voces Indígenas no hay que construirla. Ya está construida y hoy se llama otra cosa.**

---

## 2 · El programa Las Otras Voces bajo Fundación KM

### La estructura

| Capa | Qué es | Dónde vive |
|---|---|---|
| **Fundación KM** | La institución. Financia, responde y firma. `fundacionkm.cl` | repo `fundacionkm` |
| **Programa Las Otras Voces** | El paraguas editorial: un protocolo, un método, un equipo | corpus en `estrategia/` |
| **Tres marcas públicas** | Voces Araucanía · Voces Mapuche · Voces Indígenas | una sola base de código |

### Los dos ejes (no son tres tamaños de lo mismo)

Del `arquitectura-tres-voces-kimun.md`, fundado en *Mapun Kimün* y el Convenio 169:

| Eje | Concepto | Marca | Ámbito |
|---|---|---|---|
| **che (küpan)** — linaje | de quién desciendes | **Voces Mapuche** | el pueblo, desde dentro, de Gulumapu a Puelmapu |
| **che (küpan)** — linaje | los pueblos | **Voces Indígenas** | la casa grande: los pueblos del mundo |
| **tuwün** — espacio | de dónde eres | **Voces Araucanía** | el territorio compartido, **con todos sus actores** |
| **tiempo** | alma transversal | — | atraviesa las tres, no es una cuarta voz |

Mapuche ⊂ Indígenas: una historia mapuche enruta a **las dos**. Una historia de La Araucanía
enruta a Araucanía sin importar la etnia. Ya está implementado y testeado en
`server/src/lib/cascade.ts` del fork.

### La diferencia de gobernanza que trae el programa

Lo que hoy no existe en el sitio y el programa impone: un **protocolo editorial firmado**
(`protocolo-editorial-FINAL.md`, v2.0), obligatorio para el equipo **y para el sistema de
IA**, con editor responsable, líneas rojas bilaterales, glosario normativo de terminología,
siete niveles de fact-check, derecho a réplica y una nota pública de conflicto de interés
estructural.

---

## 3 · Qué cambia para impactoindigena.news

| Dimensión | Hoy · impactoindigena.news | Mañana · Voces Indígenas |
|---|---|---|
| **Marca** | Igual que la consultoría | Fundación KM, programa Las Otras Voces |
| **Dominio** | `impactoindigena.news` | `vocesindigenas.org` (canónico) |
| **Compuerta editorial** | **Publica sin revisión humana** | Gate §7 + editor responsable como autoridad final |
| **Estándar de lenguaje** | Reglas de capitalización y de título | + glosario normativo §3: todo término de parte va atribuido o no va |
| **Verificación** | Relevancia LLM 1-10 + sello editorial | + 7 niveles de fact-check con árbol de decisión y archivo público |
| **Réplica** | No existe | Obligatoria cuando la nota alude a alguien, subordinada a la protección |
| **Transparencia** | `/methodology` | + financiamiento, conflictos de interés bidireccionales, correcciones, concentración de roles declarada |
| **Formato ancla** | Nota + newsletter + 6 canales sociales | + podcast de profundidad como pilar |
| **Alcance** | Mundo y Chile mezclados en 4 categorías | El eje che completo. **No pierde contenido**: como Mapuche ⊂ Indígenas, la casa grande conserva todo y gana dos ventanas hermanas |
| **Sindicación** | No aplica | Una historia sirve a varias voces vía `StoryProperty`, con crédito |

**Lo que NO cambia:** el pipeline, las ~96 fuentes, los seis canales sociales, las guías
jurídicas, el glosario, el mapa, la API pública, los widgets, el trabajo de cumplimiento
legal y las 2.866 URLs, que viajan con 301.

**El cambio de fondo, en una línea:** hoy el sitio es un curador automático con sello
propio; mañana es un medio con protocolo firmado, editor responsable y compuerta humana.

---

## 4 · Las verticales hermanas

| | Voces Araucanía | Voces Mapuche |
|---|---|---|
| **Estado** | Primera en lanzar, por decisión del programa | Fase 2, con tracción |
| **Dominio** | `vocesaraucania.cl` (Fundación KM) ✓ | `vocesmapuche.cl` (Fundación KM) ✓ |
| **Formato ancla** | «Las 5 de la Araucanía», video vertical diario | Carrusel bilingüe + explainer con mapuzugun |
| **Lo que ya existe** | La base de código, el pipeline, los scrapers de Austral y Biobío | Todo lo transversal |
| **Lo que falta de verdad** | **Corpus de fuentes regionales no indígenas.** El pipeline actual filtra por relevancia indígena; Araucanía cubre el territorio **con todos sus actores** — economía, deporte, ciencia, vida cotidiana. Eso hoy no se crawlea | Validación comunitaria de la grafía del glosario kimün, hoy declarada pendiente en §4 del documento de arquitectura |

**La asimetría de dominios que conviene resolver ahora:** un `.cl` es correcto para
Araucanía, que es un territorio en Chile. Es discutible para Mapuche, que el propio
manifiesto define «a ambos lados de la cordillera», y sería equivocado para Indígenas, que
cubre los pueblos del mundo. `vocesmapuche.com` y `.news` están **libres** y conviene
tomarlos ahora, cuesten lo que cuesten hoy.

---

## 5 · Dominios: estado verificado y destino

| Dominio | Titular / estado | Destino |
|---|---|---|
| `vocesindigenas.org` | suyo | **canónico de Voces Indígenas** |
| `vocesindigenas.com` · `.news` | suyos | 301 al `.org` |
| `vocesindigenas.cl` | **Coñuepán y Cía** | 301 al `.org` · traspasar a Fundación KM |
| `impactoindigena.news` | suyo | 301 al `.org`, retenido 24 meses |
| `impactoindigena.com` · `.cl` · `.org` · `.ai` | suyos | **no se tocan**: son la consultoría |
| `vocesaraucania.cl` | Fundación KM | canónico de Voces Araucanía |
| `vocesmapuche.cl` | Fundación KM | canónico de Voces Mapuche |
| `vocesaraucania` / `vocesmapuche` en `.com` y `.news` | **libres** | registrar defensivamente |
| `otrasvoces.cl` · `lasotrasvoces.cl` · `otrasvoces.com` | de terceros | el programa no necesita dominio propio; vive en `fundacionkm.cl` |

**Por qué `.org` y no `.news`:** es el estándar verificado del periodismo indígena sin fines
de lucro — `ictnews.org` (ex Indian Country Today) y `servindi.org` — y señala fundación en
vez de empresa, que es exactamente el reencuadre que separa el medio de la consultoría. El
`.news` queda en 301 y no se pierde nada. Si prefiere `.news` como canónico, se invierte la
regla de 301 y el resto del plan no cambia.

---

## 6 · La decisión de arquitectura: el andamiaje viaja al origen

El fork `otras-voces` nació el 30-jun-2026. Desde entonces el origen sumó **74 commits** y
el fork **15**. La comparación de servicios lo confirma: el fork tiene exactamente **un**
archivo que el origen no tiene (`services/cascade.ts`), y le faltan nueve del origen, entre
ellos el canal de Facebook, el scraper de la Corte IDH y el digest de agenda.

**El fork no está adelante: es una foto de junio que quedó atrás y sigue quedándose.**

Por eso la dirección correcta es portar el andamiaje multi-tenant **hacia el origen**:

- Son 15 commits de infraestructura aditiva, con **25 tests verdes** en sus cuatro módulos.
- Contra 74 commits de producto vivo, con tráfico, cumplimiento legal y seis canales.
- La brecha crece ~10 commits por semana. Cada semana que pasa, la opción contraria se
  encarece y la correcta no.

El corpus `estrategia/` (once documentos) se mueve al repo que quede como único, o a
`fundacionkm`. El repo `otras-voces` se archiva una vez portado.

---

## 7 · Secuencia

### Fase 1 · Renombrar (desbloquea todo lo demás)

El sitio pasa a Voces Indígenas en su propio repo. Una sola migración de SEO.

1. Copy y marca: `client/index.html`, `client/src/lib/seo.tsx`,
   `client/src/layouts/PublicLayout.tsx`, `client/src/locales/es.json` y `en.json`.
2. Dominio en servidor y correo: `server/src/services/newsletter.ts`, `server/.env.sample`,
   `server/.env.example`, y los tests que fijan el dominio —
   `server/src/routes/public/sitemap.test.ts`, `server/src/lib/allowedOrigins.test.ts`,
   `server/src/routes/og.test.ts`.
3. Infraestructura: dominio en Azure Static Web Apps, regla comodín de 301 desde
   `impactoindigena.news`, sitemap nuevo, cambio de dirección en Search Console.
4. Canales: renombrar los seis perfiles sociales y la lista de Brevo.
5. Documentación: `DESIGN.md`, `CLAUDE.md`, `README.md`.

### Fase 2 · Portar el andamiaje multi-tenant desde el fork

Nueve archivos y una migración, todos aditivos:

`server/src/lib/properties.ts` · `lib/cascade.ts` · `lib/gate.ts` · `lib/tenant.ts` ·
`middleware/property.ts` · `services/cascade.ts` · `prompts/cascade.ts` ·
`schemas/cascade.ts` · migración `20260705000000_add_property_multitenant` · más los cuatro
archivos de test.

Con tres correcciones que la auditoría del fork dejó identificadas y que **no deben
portarse tal cual**:

- `lib/tenant.ts` debe fallar cerrado: hoy `publishedStoryWhere(undefined)` devuelve `{}`,
  es decir, sirve todo sin filtro. Y es el único de los cuatro módulos sin test.
- El filtro de propiedad debe cablearse en las seis rutas públicas que hoy lo saltan —
  home, RSS, sitemap, spotlight, coverage y stats — y `getHomepageData` debe aceptar
  propiedad, cosa que hoy ni siquiera contempla.
- El upsert de `StoryProperty` en `services/cascade.ts` no debe sobrescribir un
  `reviewStatus` que ya tocó un editor.

### Fase 3 · La cola de revisión humana

Sin ella el programa no puede lanzar: el gate retiene y nadie puede soltar. Ruta admin más
pantalla para listar `held_for_review` por propiedad, aprobar, rechazar y dejar registro.
`storiesForProperty()` ya existe para eso y hoy no tiene un solo llamador.

### Fase 4 · Voces Araucanía

Recién aquí. Necesita el corpus de fuentes regionales no indígenas, que es trabajo de
fuentes, no de código, y el protocolo firmado.

---

## 8 · Decisiones abiertas

1. **`.org` o `.news` como canónico** de Voces Indígenas. Recomendado `.org`; no bloquea.
2. **Traspaso de `vocesindigenas.cl`** de Coñuepán y Cía a Fundación KM, para que las tres
   marcas tengan el mismo titular.
3. **La cola de revisión, ¿por propiedad o única?** Una historia mapuche crea dos vínculos.
   Recomendado por propiedad: el az de cada marca es distinto y el protocolo hace
   responsable al editor de esa publicación.
4. **Validación comunitaria de la grafía** de los 17 términos del glosario kimün, hoy
   declarada pendiente. Bloquea el uso público del glosario, no el renombre.

---

## 9 · Verificación

**Fase 1, en este orden:**

1. `npm run test --prefix server` y `npm run test --prefix client -- --run` en verde tras
   cambiar los dominios fijados en los tres archivos de test.
2. `npm run build --prefix client` completo, con prerender.
3. Tras el despliegue, comprobar en vivo con cache-buster (el CDN de Azure cachea 60 s):
   - `curl -I https://impactoindigena.news/stories/<slug>` devuelve **301** al `.org`.
   - La misma URL en `vocesindigenas.org` devuelve **200**.
   - `https://vocesindigenas.org/sitemap.xml` trae las 2.866 `<loc>` con el dominio nuevo.
   - `https://vocesindigenas.org/api/homepage` responde con las cuatro categorías.
4. Search Console: cambio de dirección enviado y sitemap nuevo aceptado.
5. A los pocos días, verificar que la cobertura del dominio nuevo sube y la del viejo baja
   sin errores 404.

**Fase 2:** los 25 tests del andamiaje deben seguir verdes tras el port, más el test nuevo
de `lib/tenant.ts` que hoy no existe. Prueba de extremo a extremo: una historia enrutada
solo a `mapuche` **no** debe aparecer en la portada, el RSS ni el sitemap de Araucanía.
