/*
 * Precarga la imagen del hero de la portada, resolviendola en el navegador.
 *
 * POR QUE ES UN ARCHIVO Y NO UN SCRIPT EN LINEA: la CSP del sitio declara
 * `script-src 'self'` sin `unsafe-inline` (client/public/staticwebapp.config.json),
 * asi que TODO script en linea queda bloqueado. La primera version de esto era
 * inline y en produccion no llegaba a ejecutarse nunca — el navegador la
 * rechazaba con «Executing inline script violates the following Content Security
 * Policy directive» y el `try/catch` del propio script no tenia nada que ver: el
 * codigo jamas corria. Como archivo servido desde el mismo origen, cumple 'self'.
 *
 * QUE RESUELVE: el preload del hero se horneaba en el build, con la destacada que
 * la portada tenia al compilar. Pero el cliente lee `homepage.json` de R2, que el
 * job de publicacion reescribe varias veces al dia. Medido el 6-sep-2026: el HTML
 * precargaba `oghero-eeefd92b...jpg` mientras la destacada real ya era
 * `storycard-cd289536...`, y el "load delay" del LCP habia pasado de 1.372 a
 * 6.268 ms.
 *
 * OJO: la eleccion del hero replica `pickHero` (src/lib/mix-stories.ts) a mano,
 * porque este archivo corre antes que el bundle y no puede importar nada. Esa
 * duplicacion la vigila `src/lib/preload-hero.test.ts`, que ejecuta ESTE archivo
 * y compara su eleccion contra `pickHero`. Si cambias uno, cambia el otro.
 */
;(function () {
  try {
    // La URL del snapshot sale del preload que el build ya dejo en el <head>, asi
    // que este archivo no necesita saber a que entorno apunta.
    var pre = document.querySelector('link[rel="preload"][as="fetch"]')
    var S = pre && pre.getAttribute('href')
    if (!S) return

    // El dial de tono decide QUE historia es la destacada, y vive en localStorage.
    // Se ajusta al valor valido mas cercano, igual que clampToValid en
    // PositivityContext: un 60 guardado tiene que elegir como 50, no como 60.
    var P = 50
    try {
      var v = localStorage.getItem('ar-positivity')
      if (v !== null) {
        var n = parseInt(v, 10)
        if (!isNaN(n)) {
          var V = [0, 25, 50, 75, 100]
          var c = V[0]
          var m = Math.abs(n - c)
          for (var i = 0; i < V.length; i++) {
            var d = Math.abs(n - V[i])
            if (d < m) {
              c = V[i]
              m = d
            }
          }
          P = c
        }
      }
    } catch (e) {
      /* storage bloqueado: se queda en 50, que es el valor por defecto */
    }

    fetch(S)
      .then(function (r) {
        return r.json()
      })
      .then(function (j) {
        var a = []
        var b = (j && j.storiesByIssue) || {}
        for (var k in b) {
          var x = b[k]
          if (!x) continue
          if (P === 100) a = a.concat(x.uplifting || [])
          else if (P === 0) a = a.concat(x.negative || [])
          else if (P > 50) a = a.concat(x.uplifting || [], x.calm || [])
          else if (P < 50) a = a.concat(x.negative || [])
          else a = a.concat(x.uplifting || [], x.calm || [], x.negative || [])
        }
        if (!a.length) return
        a.sort(function (p, q) {
          return (
            new Date(q.datePublished || q.dateCrawled) - new Date(p.datePublished || p.dateCrawled)
          )
        })
        var u = a[0] && a[0].imageUrl
        if (!u) return
        // setAttribute y no propiedades: `l.as` y `l.fetchPriority` se reflejan en
        // los navegadores pero NO en jsdom, y el test no podria comprobarlos.
        var l = document.createElement('link')
        l.setAttribute('rel', 'preload')
        l.setAttribute('as', 'image')
        l.setAttribute('href', u)
        l.setAttribute('fetchpriority', 'high')
        document.head.appendChild(l)
      })
      .catch(function () {
        /* sin snapshot no se precarga nada; la imagen se descubre al renderizar */
      })
  } catch (e) {
    /* nunca romper la carga de la portada por una optimizacion */
  }
})()
