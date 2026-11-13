# Instagram: la portada del carrusel lleva la foto del medio

Plan · 2026-10-30 · estado: **arreglo en producción desde el 30-oct 10:45Z (`c8b1141`); falta verificarlo en vivo.** Actualizado el 13-nov-2026.

## El problema

Pedido del director (30-oct-2026): «Ve el tema de las publicaciones de instagram que aparecen sin fotos».

Un día después de que la portada volviera a llevar la foto del medio (`8fc9159`, 29-oct), los
carruseles seguían saliendo con el fondo de marca. La causa: `story.imageUrl` la elige el job de
publicación para el sitio, no para el carrusel.

- A las destacadas (relevancia ≥ `heroAiMinRelevance`, hoy 8) les pone una ilustración de IA sin
  pedir siquiera la og:image.
- A las demás con una og:image de menos de 1200 px se la funde en la tarjeta compuesta (`storycard-`).
- `fotoDelMedio` rechaza las dos, con razón, y el job social elige por relevancia, así que elige
  destacadas: casi nunca había una `oghero-` que dibujar.

## Lo hecho (`c8b1141`, en `main`)

- `fotoDePortada` (`server/src/services/storyCarousel.ts`): si la imagen guardada no es del medio,
  pide la og:image al artículo original (`fetchOgImage`, en vivo, por la guardia SSRF) y la dibuja
  en la portada y el cierre con «Foto: <medio>». Sin og:image, el fondo de marca como antes.
- `FOTO_ANCHO_MINIMO` (480 px, en `lib/fotoDelMedio.ts`) vale también para la portada: una foto más
  chica no va a sangre con el crédito del medio.
- Vale para Instagram, la galería de LinkedIn y el panel: es el mismo dibujo.
- Documentado en `.context/story-carousel.md`, `.context/instagram.md` y `.specs/social-posting.allium`.
- Tests: 5 nuevos (`storyCarousel.test.ts`, `storyCarouselRender.test.ts`). tsc limpio.

Comprobado el 11-nov: el arreglo sigue intacto tras 26 commits; ninguno tocó la foto.

## Pendiente

1. **Verificar en vivo.** Nadie confirmó todavía un carrusel real con foto. Correr `social_auto_post`
   desde `/admin/jobs` (o esperar su corrida) y mirar la primera lámina del post más reciente en
   `/admin/instagram`: la portada debe traer la foto del medio con «Foto: <medio>». Si quedó
   `rejected`, el motivo está ahí. Una sesión en la nube no puede hacerlo: su red no deja salir a
   vocesindigenas.org ni a los sitios de los medios (habría que agregarlos en Network access del
   entorno). Desde el panel o una sesión local, sí.
2. **Borradores viejos.** Los `draft` generados antes del 30-oct 10:45Z no se rehacen solos: borrar
   y volver a generar los que estén sin foto.
3. **Rama `fix/instagram-foto-portada-og-image`.** Ya está entera en `main`; se puede borrar desde
   GitHub. Las sesiones en la nube no pueden: la política de git corta el borrado de ramas.

## Observación, no pedida

La vista previa del panel ahora consulta el sitio del medio en cada previsualización. Si ese sitio
está caído, demora unos segundos más antes de caer al fondo de marca. Si molesta, se puede guardar
el resultado por noticia unos minutos.

Cuando el punto 1 quede verificado, mover este archivo a `.plans/completed/`.
