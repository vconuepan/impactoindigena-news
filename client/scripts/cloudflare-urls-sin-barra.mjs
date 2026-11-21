#!/usr/bin/env node
/**
 * Cloudflare Pages sirve `ruta/index.html` en `/ruta/` y redirige `/ruta` → `/ruta/`
 * (308). Las páginas prerenderizadas declaran su canonical SIN barra final
 * (`https://vocesindigenas.org/about`), igual que las servía Azure Static Web Apps:
 * con la redirección, Google vería un canonical que redirige.
 *
 * Arreglo: después del build, cada `dist/<ruta>/index.html` (menos la portada) se
 * mueve a `dist/<ruta>.html`, que Cloudflare sirve en `/<ruta>` sin redirigir.
 * Solo corre en el despliegue a Cloudflare; el build de Azure no lo usa.
 *
 * Uso: node scripts/cloudflare-urls-sin-barra.mjs [carpeta]   (por defecto: dist)
 */
import { readdirSync, renameSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = process.argv[2] || 'dist'
let movidos = 0

function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) {
      recorrer(ruta)
      continue
    }
    if (nombre !== 'index.html' || dir === raiz) continue
    const destino = `${dir}.html`
    if (existsSync(destino)) {
      throw new Error(`No se puede mover ${relative(raiz, ruta)}: ya existe ${relative(raiz, destino)}`)
    }
    renameSync(ruta, destino)
    movidos++
  }
}

recorrer(raiz)
console.log(`[cloudflare] ${movidos} páginas prerenderizadas servidas sin barra final`)
