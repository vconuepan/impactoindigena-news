# Backlog

## Comunidades y usuarios

- Map for PUEBLO/TERRITORIO communities (requires lat/lng migration + react-leaflet)

## Infraestructura

- AZURE_IMAGE_API_KEY: rotar (fue expuesta en output de CLI)
- LinkedIn Community Management API: formulario enviado, esperando aprobación de Microsoft Vetting

## Seguridad — diferido del review 2026-07

Ítems del análisis de seguridad que requieren verificación en navegador o
upgrades de build que deben hacerse con testeo deliberado (el resto ya está
corregido en `claude/github-integration-questions-qa5ewi`):

- **CSP `style-src 'unsafe-inline'` (L7)**: requerido mientras existan estilos
  inline de React (`style={{}}`) y `<style>` inyectados. Migrar a nonces o
  eliminar estilos inline permitiría endurecerlo. `img-src https:` es
  intencional (imágenes de artículos crawleados de dominios arbitrarios) — no
  tocar. Verificar el render en navegador antes de cambiar.
- **Deps de build `@prerenderer/*` → `ts-deepmerge` (4 moderate)**: DoS por
  prototype pollution en una herramienta de build (no llega al bundle de
  producción). El fix requiere subir major de `@prerenderer/rollup-plugin`
  (core del prerender/SEO) — verificar el build con puppeteer antes.

## Vertical Jurídico — completado (Olas 2-4, 2026-06)

> Pistas 1-3 (jurisprudencia interamericana, C169 país por país, UNDRIP) implementadas como páginas evergreen en Ola 3.
> Clasificador de encuadre narrativo (confrontación/resiliencia/protagonismo/alianza) implementado en Ola 4.
