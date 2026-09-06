/**
 * Placeholder del hero de la portada mientras cargan los datos.
 *
 * TIENE QUE MEDIR LO MISMO QUE EL HERO REAL. Si no, al llegar los datos el hero
 * cambia de alto y empuja toda la pagina: eso es exactamente el CLS.
 *
 * Ya paso una vez. El hero se rediseño a una imagen de alto fijo
 * (`h-[560px] md:h-[600px]`, HomePage.tsx) y este esqueleto quedo en la version
 * anterior, que se estiraba con su contenido y medía ~288 px. Medido en el trace
 * de Lighthouse el 6-sep-2026, en viewport movil de 412x823: un salto de
 * **272 px** —560 menos 288— con un CLS de 0,188, muy por encima del 0,1 que se
 * considera bueno. El comentario de este archivo decia «Matches dimensions of
 * the real HeroSection to prevent CLS» mientras no las igualaba.
 *
 * Las alturas se comparan en `HeroSkeleton.test.tsx` contra las del hero real,
 * para que no vuelvan a separarse en silencio.
 */
export default function HeroSkeleton() {
  return (
    <section className="relative overflow-hidden">
      {/* Mismo alto y mismo fondo que el contenedor de la imagen del hero. */}
      <div className="relative w-full h-[560px] md:h-[600px] overflow-hidden bg-neutral-900 animate-pulse">
        <h1 className="sr-only">Cargando historias</h1>

        {/* El hero real ancla su contenido abajo; el esqueleto tambien, o el
            texto saltaria de arriba a abajo aunque el alto total coincidiera. */}
        <div className="absolute inset-0 flex items-end">
          <div className="w-full max-w-4xl mx-auto px-4 md:px-14 pb-10 md:pb-14">
            {/* Eyebrow */}
            <div className="h-3 bg-neutral-700 rounded w-32 mb-5" />

            {/* Titular */}
            <div className="h-10 md:h-14 bg-neutral-700 rounded w-4/5 mb-2" />
            <div className="h-10 md:h-14 bg-neutral-700 rounded w-3/5 mb-5" />

            {/* Bajada */}
            <div className="max-w-2xl space-y-3">
              <div className="h-5 bg-neutral-800 rounded w-full" />
              <div className="h-5 bg-neutral-800 rounded w-5/6" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
