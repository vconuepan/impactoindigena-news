/*
 * Service worker de RETIRADA. No cachea nada: se desinstala y borra lo que el
 * anterior dejó guardado.
 *
 * POR QUE. Entre el 15-mar-2026 y el 2-ago-2026 —139 dias— `index.html`
 * registraba un service worker que hacia `cache-first` sobre todo lo que no
 * fuera HTML, fuentes o imagenes. Esa ultima regla, la de «everything else»,
 * alcanzaba a los GET del propio origen: **`/api/stats/daily` y
 * `/api/spotlight` quedaban servidos desde cache y no se revalidaban nunca.**
 * Hoy esos endpoints declaran `max-age=120`; para un lector con el worker viejo
 * instalado llevan meses congelados en la primera respuesta que recibio.
 *
 * El 2-ago la CSP del sitio paso a `script-src 'self'` sin `unsafe-inline`, y
 * eso dejo de registrarlo **para las visitas nuevas** — pero un service worker
 * ya instalado sigue vivo hasta que se desinstala. Quitar el registro del HTML
 * no alcanza: no llega a quien ya lo tiene.
 *
 * COMO LLEGA ESTE ARCHIVO A ELLOS. El navegador revisa el `sw.js` registrado por
 * su cuenta —en cada navegacion si paso el intervalo, y al menos cada 24 h—, y
 * lo sirve con `must-revalidate, max-age=30`. Al ver este contenido nuevo lo
 * instala, y este se retira solo.
 *
 * NO BORRAR ESTE ARCHIVO. Si `sw.js` empieza a dar 404, el comportamiento
 * depende del navegador y deja de estar garantizado que el worker viejo se
 * retire. Pesa unos cientos de bytes: se queda hasta que valga la pena revisar
 * si aun hay clientes con el worker de marzo.
 *
 * SI ALGUN DIA SE QUIERE UN SERVICE WORKER DE VERDAD, hay que arreglar antes lo
 * que lo hacia peligroso: excluir `/api/` del cache-first y decidir que pasa con
 * los archivos servidos sin hash en el nombre, como `/preload-hero.js`. Y medir
 * si aporta: las fuentes, que son lo mas pesado, ya viajan con `max-age` de
 * treinta dias.
 */

self.addEventListener('install', () => {
  // Sin esperar a que el worker viejo suelte sus clientes.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Todo lo que el worker anterior dejo guardado, incluidas las respuestas
      // de API que quedaron congeladas.
      const claves = await caches.keys()
      await Promise.all(claves.map((k) => caches.delete(k)))
      await self.registration.unregister()
    })(),
  )
})

// A proposito NO hay un handler de `fetch`: sin el, este worker no intercepta
// ninguna peticion. Desde que se activa, la red vuelve a mandar.
