import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { SEO, CommonOgTags } from "../lib/seo";

export default function TermsPage() {
  return (
    <>
      <Helmet>
        <title>Términos y Condiciones - {SEO.siteName}</title>
        <meta
          name="description"
          content="Términos y condiciones de uso de Impacto Indígena: medio de noticias curado con IA, contenido de terceros, derecho de cita y responsabilidad."
        />
        <meta property="og:title" content={`Términos y Condiciones - ${SEO.siteName}`} />
        <meta
          property="og:description"
          content="Términos y condiciones de uso de Impacto Indígena."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/terminos`} />
        <link rel="canonical" href={`${SEO.siteUrl}/terminos`} />
        {CommonOgTags({})}
      </Helmet>

      <div className="page-section">
        <h1 className="page-title">Términos y Condiciones de Uso</h1>

        <div className="prose max-w-none">
          <h2 className="section-heading mt-8">1. Aceptación</h2>
          <p>
            El uso de <strong>impactoindigena.news</strong> (el "Sitio") implica
            la aceptación de estos Términos y Condiciones. Si no estás de
            acuerdo, no utilices el Sitio.
          </p>

          <h2 className="section-heading mt-8">2. Titular</h2>
          <p>
            El Sitio es operado por la <strong>Fundación Coñuepan-Millaquir</strong>, RUT
            65.191.983-5, organización sin fines de lucro domiciliada en Chile. Contacto:{" "}
            <a href="mailto:contacto@fundacionkm.org" className="text-brand-800 hover:text-brand-700">
              contacto@fundacionkm.org
            </a>
            .
          </p>

          <h2 className="section-heading mt-8">3. Descripción del servicio</h2>
          <p>
            Impacto Indígena es un medio de noticias curado con inteligencia
            artificial, enfocado en pueblos indígenas. Monitoreamos fuentes
            públicas, seleccionamos artículos relevantes y publicamos resúmenes
            y análisis generados por IA junto con un enlace a la fuente
            original. <strong>No realizamos reportería original</strong>: cada
            noticia enlaza al artículo original de su medio. El acceso de
            lectura es gratuito y no requiere registro.
          </p>

          <h2 className="section-heading mt-8">4. Contenido de terceros y propiedad intelectual</h2>
          <p>
            El Sitio enlaza y hace referencia a contenidos de terceros (medios,
            ONG, organismos públicos), cuyos derechos pertenecen a sus
            respectivos titulares. Impacto Indígena publica resúmenes propios y
            citas breves al amparo del <strong>derecho de cita</strong> (Art. 71
            de la Ley N° 17.336 sobre Propiedad Intelectual), siempre
            identificando la fuente y enlazando al original. Los resúmenes,
            análisis, calificaciones, textos editoriales, marca, diseño y
            software del Sitio son propiedad de la Fundación Coñuepan-Millaquir o se usan
            bajo licencia.
          </p>
          <p>
            <strong>Solicitudes de retiro (takedown).</strong> Si eres titular de
            derechos y consideras que un contenido excede el uso legítimo o
            vulnera tus derechos, escríbenos a{" "}
            <a href="mailto:contacto@fundacionkm.org" className="text-brand-800 hover:text-brand-700">
              contacto@fundacionkm.org
            </a>{" "}
            indicando el enlace, el contenido afectado y tu titularidad.
            Atenderemos las solicitudes legítimas a la brevedad.
          </p>

          <h2 className="section-heading mt-8">5. Contenido generado por IA</h2>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>
              Los resúmenes y análisis son generados por IA y están etiquetados
              como tales (ver{" "}
              <Link to="/methodology" className="text-brand-800 hover:text-brand-700">Metodología</Link>).
            </li>
            <li>El contenido de IA puede ser inexacto, incompleto, estar desactualizado o contener sesgos. No constituye asesoría profesional, legal ni de inversión.</li>
            <li>Las imágenes que acompañan las noticias en el Sitio y las publicaciones en redes sociales pueden ser generadas con IA y están etiquetadas como tales; son ilustraciones editoriales, no fotografías reales de personas o hechos específicos.</li>
            <li>Para información definitiva, consulta siempre la fuente original enlazada.</li>
          </ul>

          <h2 className="section-heading mt-8">6. Exactitud y responsabilidad</h2>
          <p>
            El Sitio se ofrece "tal cual". Si bien procuramos calidad y
            precisión, no garantizamos la exactitud, completitud ni vigencia de
            los resúmenes, ni la disponibilidad ininterrumpida del servicio. En
            la máxima medida permitida por la ley, la Fundación Coñuepan-Millaquir no será
            responsable por daños indirectos o consecuenciales derivados del uso
            del Sitio o de la confianza depositada en sus contenidos.
          </p>

          <h2 className="section-heading mt-8">7. Uso aceptable</h2>
          <p>Te comprometes a no: (a) reproducir masivamente el contenido del Sitio sin autorización; (b) realizar scraping o ingeniería inversa; (c) usar el contenido para desinformar o tergiversar a comunidades indígenas; (d) vulnerar derechos de terceros.</p>

          <h2 className="section-heading mt-8">8. Atribución</h2>
          <p>
            Si reutilizas resúmenes o análisis del Sitio, debes atribuir a{" "}
            <strong>"Impacto Indígena — impactoindigena.news"</strong> y enlazar a la noticia.
          </p>

          <h2 className="section-heading mt-8">9. Boletín y comunicaciones</h2>
          <p>
            La suscripción al boletín es voluntaria y revocable en cualquier
            momento. El tratamiento de tus datos se rige por la{" "}
            <Link to="/privacy" className="text-brand-800 hover:text-brand-700">Política de Privacidad</Link>.
          </p>

          <h2 className="section-heading mt-8">10. Representación de pueblos indígenas</h2>
          <p>
            Buscamos una representación digna y respetuosa de los pueblos
            indígenas. Si una comunidad considera que un contenido o imagen es
            culturalmente sensible o inapropiado, puede solicitarnos su revisión
            o retiro escribiendo a{" "}
            <a href="mailto:contacto@fundacionkm.org" className="text-brand-800 hover:text-brand-700">
              contacto@fundacionkm.org
            </a>
            .
          </p>

          <h2 className="section-heading mt-8">11. Modificaciones del servicio</h2>
          <p>Podemos modificar, suspender o discontinuar el Sitio o cualquiera de sus funciones en cualquier momento, sin garantía de continuidad.</p>

          <h2 className="section-heading mt-8">12. Ley aplicable y jurisdicción</h2>
          <p>
            Estos Términos se rigen por las leyes de la República de Chile.
            Cualquier controversia se someterá a los tribunales ordinarios de
            justicia con asiento en Santiago, sin perjuicio de una etapa previa
            de negociación de buena fe.
          </p>

          <h2 className="section-heading mt-8">13. Modificación de los Términos</h2>
          <p>Podemos actualizar estos Términos. Publicaremos la versión vigente en esta página. El uso continuado del Sitio implica la aceptación de los cambios.</p>
        </div>
      </div>
    </>
  );
}
