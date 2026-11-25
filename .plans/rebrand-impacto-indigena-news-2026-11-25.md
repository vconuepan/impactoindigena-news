# Volver a Impacto Indígena News · plan por etapas

**Fecha:** 25-nov-2026 · **Estado:** plan, no ejecutado. Nada se toca sin orden del director.

**Decisiones del director (literales, 25-nov-2026), en la sesión del repo `impactoindigena`:**
- «podrian ser cuatro componentes, anteriormente vocesindigenas.org se llamaba impactoindigena.news, revisa la narrativa,
  el cambio seria solo de logo y dominio» → «Sí, cuarto componente».
- Nombre: «Sí, Impacto Indígena News». **«Voces Indígenas» se queda como nombre de la columna semanal y del podcast.**
- Regla editorial: «sigue tu recomendcion» → el medio no cobra por publicar · avisa cuando informa sobre un cliente de
  impactoindigena.ai o de impactoindigena.legal · lo editorial no pasa por la SpA ni por el estudio.

Fuente de la narrativa: `impactoindigena/docs/DEFINICION_TRES_VERTICALES_Y_CASA_2026-11-25.md`, §2 bis. El medio es
**lo que se cuenta**, un programa de la Fundación KM, junto al `.org` (lo que se sabe).

---

## Lo que ya se sabe (leído el 25-nov)

- `impactoindigena.news` está en Cloudflare (servidores ivan/melody) y hoy **redirige 301 a `vocesindigenas.org`**.
- El frontend se publica en el proyecto Cloudflare Pages `vocesindigenas` (`deploy-cloudflare-frontend.yml`); el backend
  sigue en Azure App Service.
- El dominio **no está escrito en el código**: sale de `VITE_SITE_URL` (cliente) y `SITE_URL` (servidor). Hoy vale
  `https://vocesindigenas.org` en `deploy-azure-frontend.yml` (l. 75), `deploy-cloudflare-frontend.yml` (l. 54 y 57),
  `server/.env*` y como valor por defecto en `client/src/config.ts` y `server/src/config.ts`.
- **El nombre sí está en el código:** «Voces Indígenas» aparece unas 400 veces en ~160 archivos. Una parte es el nombre
  del medio (cambia) y otra es la columna y el podcast (se queda).
- **Hay un candado que hoy impide volver:** `client/src/lib/marca-dominio.test.ts` falla si `impactoindigena.news`
  reaparece en las superficies públicas. Hay que invertirlo, no borrarlo.
- **La lección de septiembre** (comentarios de `config.ts` y de ese test): `og-image.png` es un PNG estático; si no se
  regenera con `npm run images:og`, los enlaces compartidos muestran la marca vieja durante semanas.

## Etapa 1 · El dominio (sin cambiar textos)

1. En Cloudflare Pages `vocesindigenas`, agregar `impactoindigena.news` y `www.impactoindigena.news` como dominios propios.
2. Quitar la regla que hoy lleva `impactoindigena.news` → `vocesindigenas.org` **antes** de crear la inversa, para no
   armar un bucle.
3. Crear la redirección 301 `vocesindigenas.org` (y www) → `impactoindigena.news`, **ruta por ruta y con la cadena de
   consulta**, excluyendo `/api/` si el backend se sirve bajo ese dominio.
4. Cambiar `VITE_SITE_URL`, `PRERENDER_API_URL` y `SITE_URL` a `https://impactoindigena.news` en los dos workflows, en
   Azure y en los valores por defecto de `config.ts` (cliente y servidor).
5. Invertir el candado: `marca-dominio.test.ts` pasa a prohibir `vocesindigenas.org` en las superficies públicas.
6. En Google Search Console, registrar el cambio de dirección de `vocesindigenas.org` a `impactoindigena.news`.

**Verificación:** canónicas, `og:url`, sitemap y RSS con el dominio nuevo; un 301 de un salto desde el dominio viejo.

## Etapa 2 · El nombre visible y el logo

1. Clasificar las ~400 apariciones de «Voces Indígenas» en dos listas: **medio** (cambia a «Impacto Indígena News») y
   **columna o podcast** (se queda: `VocesIndigenas.tsx`, `VocesIndigenasDetail.tsx`, `nav.voces`, el feed del podcast).
2. Cambiar las del medio: `locales/es.json` y `en.json` (copyright, pie, título de búsqueda, crédito de imagen),
   `AboutPage`, `TermsPage`, `ComparePage`, `og.ts` del servidor, el feed RSS de noticias.
3. Logo: el mismo sistema que impactoindigena.legal (estrella de Impacto Indígena + logotipo en Libre Caslon Display, con
   «News» en el color de acento). **Por decidir** si «News» va en dorado, como «Legal», o en el verde del medio.
4. Regenerar `og-image.png` (`npm run images:og`) y los íconos.
5. Agregar en «Quiénes somos» la regla editorial de las tres partes y «un programa de la Fundación KM».

## Etapa 3 · Fuera del código

1. Nombre visible en las seis redes (Bluesky, Mastodon, Instagram —ya es `impactoindigena`—, LinkedIn, X y Facebook).
2. Nombre del remitente del newsletter en Brevo.
3. El podcast **sigue** llamándose Voces Indígenas: no se toca su feed.
4. La documentación: README, CLAUDE.md y `.context/`.

## Lo que no se hace

- No se borra `vocesindigenas.org`: se renueva y redirige, como los dominios del estudio.
- No se cambian el correo ni los dominios de contacto (`@fundacionkm.org`).
- No se renombra la columna ni el podcast.

## Riesgo principal

Es la segunda mudanza de dominio en tres meses (`.news` → `vocesindigenas.org` el 4-sep, y ahora de vuelta). Google la
absorbe si los 301 son de un solo salto y se registra el cambio de dirección; lo que no se puede es dejar una cadena
`vocesindigenas.org` → `impactoindigena.news` → otra cosa.
