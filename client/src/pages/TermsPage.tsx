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
          <p className="text-sm text-neutral-500 not-prose mb-6">
            Versión 1.2 · vigente desde el 17 de agosto de 2026.
          </p>
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
            citas breves al amparo del <strong>derecho de cita</strong>{" "}
            reconocido en la Ley N° 17.336 sobre Propiedad Intelectual, siempre
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
          <p>Te comprometes a no: (a) reproducir de forma masiva o sistemática el contenido del Sitio sin atribución ni autorización, ni presentarlo como propio; (b) usar medios automatizados que degraden el servicio, eludan nuestras medidas técnicas o ignoren nuestro archivo <code>robots.txt</code>; (c) realizar ingeniería inversa del software del Sitio; (d) usar el contenido para desinformar o tergiversar a comunidades indígenas; (e) vulnerar derechos de terceros.</p>
          <p>
            <strong>Cómo trabajamos nosotros.</strong> Este medio se nutre de
            noticias que otros publican, y lo hacemos con las mismas reglas que
            pedimos: partimos del canal de sindicación (RSS) que cada fuente
            ofrece, <strong>respetamos su archivo <code>robots.txt</code></strong>,
            nos identificamos con un agente propio que enlaza a este Sitio,
            citamos y enlazamos siempre al artículo original, y no reproducimos
            las notas completas. No usamos el contenido que rastreamos para
            entrenar modelos de inteligencia artificial. Si eres un medio y
            prefieres que no rastreemos tu sitio, basta con que lo declares en tu{" "}
            <code>robots.txt</code> o nos escribas.
          </p>

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

          <h2 className="section-heading mt-8">10. Cuenta de miembro</h2>
          <p>
            Leer el Sitio no requiere cuenta. Puedes crear una para acceder a
            funciones de miembro, y el acceso funciona con{" "}
            <strong>enlace mágico</strong>: te enviamos un enlace de un solo uso
            al correo que indiques, sin contraseña. Eres responsable de mantener
            el control de esa casilla; quien acceda a ella puede entrar a tu
            cuenta.
          </p>
          <p>
            La cuenta es personal y gratuita. Puedes{" "}
            <strong>descargar todos tus datos</strong> y{" "}
            <strong>eliminarla en cualquier momento</strong> desde tu perfil; al
            eliminarla se borran también tus membresías y preferencias asociadas.
            Podemos suspender o cerrar una cuenta que se use para vulnerar estos
            Términos, en particular el punto 7, informándote por el correo
            asociado salvo que la ley lo impida.
          </p>

          <h2 className="section-heading mt-8">11. Comunidades</h2>
          <p>
            Las comunidades agrupan contenido del Sitio por pueblo, territorio o
            causa. Unirte es voluntario y gratuito, y sirve para recibir el
            resumen periódico de esa comunidad y ver sus noticias reunidas.
            Puedes salir cuando quieras, con efecto inmediato.
          </p>
          <p>
            <strong>Unirte a una comunidad de pueblo es una declaración tuya, no
            una acreditación nuestra.</strong> No verificamos, certificamos ni
            registramos la pertenencia de nadie a un pueblo indígena, y la
            membresía en el Sitio{" "}
            <strong>no confiere reconocimiento, representación ni vocería</strong>{" "}
            de esa comunidad ni de sus organizaciones. La calidad indígena se
            acredita por las vías que la ley chilena contempla, ajenas a este
            Sitio.
          </p>
          <p>
            Como esa membresía puede revelar tu origen étnico —un dato
            sensible—, te pedimos tu <strong>consentimiento expreso</strong> al
            unirte a una comunidad de pueblo, y puedes retirarlo abandonándola.
            El detalle está en la{" "}
            <Link to="/privacy" className="text-brand-800 hover:text-brand-700">Política de Privacidad</Link>.
          </p>
          <p>
            Hoy las comunidades no admiten publicaciones de sus miembros: el
            contenido que muestran proviene de nuestra curatoría editorial. Si
            eso cambia, actualizaremos estos Términos antes de habilitarlo.
          </p>

          <h2 className="section-heading mt-8">12. Representación de pueblos indígenas</h2>
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

          <h2 className="section-heading mt-8">13. Modificaciones del servicio</h2>
          <p>Podemos modificar, suspender o discontinuar el Sitio o cualquiera de sus funciones en cualquier momento, sin garantía de continuidad.</p>

          <h2 className="section-heading mt-8">14. Ley aplicable y jurisdicción</h2>
          <p>
            Estos Términos se rigen por las leyes de la República de Chile.
            Cualquier controversia se someterá a los tribunales ordinarios de
            justicia con asiento en Santiago, sin perjuicio de una etapa previa
            de negociación de buena fe.
          </p>

          <h2 className="section-heading mt-8">15. Modificación de los Términos</h2>
          <p>Podemos actualizar estos Términos. Publicaremos la versión vigente en esta página. El uso continuado del Sitio implica la aceptación de los cambios.</p>
        </div>
      </div>
    </>
  );
}
