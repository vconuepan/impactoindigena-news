import { Helmet } from "react-helmet-async";
import ObfuscatedEmail from "../components/ObfuscatedEmail";
import { SEO, CommonOgTags } from "../lib/seo";

export default function PrivacyPage() {
  return (
    <>
      <Helmet>
        <title>Política de Privacidad - {SEO.siteName}</title>
        <meta
          name="description"
          content="Impacto Indígena respeta tu privacidad. Sin cookies, sin rastreo, sin analítica invasiva. Conoce los datos mínimos que recopilamos."
        />
        <meta
          property="og:title"
          content={`Política de Privacidad - ${SEO.siteName}`}
        />
        <meta
          property="og:description"
          content="Impacto Indígena respeta tu privacidad. Sin cookies, sin rastreo, sin analítica invasiva."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/privacy`} />
        <link rel="canonical" href={`${SEO.siteUrl}/privacy`} />
        {CommonOgTags({})}
      </Helmet>

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-14 px-4 mb-0">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">Privacidad</span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            Sin cookies.<br className="hidden md:block" /> Sin rastreo.
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            Nada se almacena en tu dispositivo cuando visitas este sitio como lector.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="prose max-w-none">
          <p>
            No usamos cookies, pixels de rastreo, Google Analytics, scripts
            publicitarios ni ningún otro método invasivo de recopilación de
            datos. Cuando visitas este sitio como lector, nada se almacena en
            tu dispositivo.
          </p>

          <h2 className="section-heading mt-10">Qué recopilamos</h2>

          <h3 className="text-lg font-normal mt-6 mb-2">Analítica del sitio</h3>
          <p>
            Usamos{" "}
            <a
              href="https://www.simpleanalytics.com/"
              className="text-brand-800 hover:text-brand-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              Simple Analytics
            </a>
            , un servicio de analítica enfocado en privacidad que:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>
              <strong>No</strong> usa cookies
            </li>
            <li>
              <strong>No</strong> rastrea visitantes individuales
            </li>
            <li>
              <strong>No</strong> recopila datos personales
            </li>
            <li>
              <strong>No</strong> almacena tu dirección IP
            </li>
            <li>Respeta la configuración Do Not Track</li>
            <li>Cumple con GDPR, CCPA y PECR</li>
          </ul>
          <p className="mt-3">
            Simple Analytics recopila únicamente datos agregados y anónimos
            como vistas de página y fuentes de referencia. Ninguna información
            se vincula a ti como individuo. Puedes consultar su política de
            privacidad en{" "}
            <a
              href="https://simpleanalytics.com/privacy"
              className="text-brand-800 hover:text-brand-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              simpleanalytics.com/privacy
            </a>
            .
          </p>

          <h3 className="text-lg font-normal mt-6 mb-2">
            Boletín de noticias (opcional)
          </h3>
          <p>Si decides suscribirte a nuestro boletín, recopilamos:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>
              Tu <strong>correo electrónico</strong> (proporcionado voluntariamente por ti)
            </li>
            <li>
              Tu <strong>dirección IP</strong> (registrada por nuestro proveedor de boletín,{" "}
              <a
                href="https://www.useplunk.com/"
                className="text-brand-800 hover:text-brand-700"
                target="_blank"
                rel="noopener noreferrer"
              >
                Plunk
              </a>
              , para prevenir spam y abuso)
            </li>
          </ul>
          <p className="mt-3">
            Estos datos se usan únicamente para enviarte actualizaciones de
            Impacto Indígena y para prevenir el abuso del servicio. Nunca
            compartiremos, venderemos ni distribuiremos tu correo electrónico
            a terceros.
          </p>
          <p className="mt-3">
            Nuestro proveedor de boletín, Plunk, registra automáticamente las
            aperturas de correo y clics en enlaces como parte de su
            infraestructura de entrega. No podemos desactivar esta
            funcionalidad. No usamos estos datos para perfilamiento,
            publicidad ni ningún otro propósito más allá del monitoreo básico
            de entrega.
          </p>
          <p>
            Puedes cancelar tu suscripción en cualquier momento usando el
            enlace de cancelación incluido en cada correo.
          </p>

          <h3 className="text-lg font-normal mt-6 mb-2">Registros del servidor</h3>
          <p>
            Nuestro servidor registra metadatos básicos de las solicitudes
            (ruta URL, estado HTTP, tiempo de respuesta) para monitoreo
            operacional. Estos registros se conservan durante 14 días y luego
            se eliminan automáticamente. La información sensible como
            encabezados de autenticación y cookies se oculta en todos los
            registros.
          </p>

          <h2 className="section-heading mt-10">
            Qué almacenamos en tu dispositivo
          </h2>
          <p>
            No usamos cookies, ni sessionStorage, IndexedDB ni ningún otro
            mecanismo de almacenamiento del navegador para visitantes públicos.
          </p>
          <p>
            El único dato almacenado en tu dispositivo es tu{" "}
            <strong>preferencia del filtro emocional</strong> (un número entre
            0 y 100), guardado en localStorage para que el control permanezca
            donde lo dejaste entre visitas. Este valor nunca sale de tu
            navegador y no se envía a nuestros servidores.
          </p>
          <p>
            Nuestra interfaz de administración, que no es accesible al público,
            usa cookies de autenticación seguras y httpOnly.
          </p>

          <h2 className="section-heading mt-10">Servicios de terceros</h2>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th scope="col" className="text-left align-top py-2 pr-4 font-normal">
                    Servicio
                  </th>
                  <th scope="col" className="text-left align-top py-2 pr-4 font-normal">
                    Propósito
                  </th>
                  <th scope="col" className="text-left align-top py-2 font-normal">
                    Datos compartidos
                  </th>
                </tr>
              </thead>
              <tbody className="text-neutral-600">
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">
                    <a
                      href="https://www.simpleanalytics.com/"
                      className="text-brand-800 hover:text-brand-700"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Simple Analytics
                    </a>
                  </td>
                  <td className="align-top py-2 pr-4">Analítica con privacidad</td>
                  <td className="align-top py-2">
                    Solo vistas de página anónimas. Sin cookies, sin datos personales.
                  </td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">
                    <a
                      href="https://www.useplunk.com/"
                      className="text-brand-800 hover:text-brand-700"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Plunk
                    </a>
                  </td>
                  <td className="align-top py-2 pr-4">Envío del boletín</td>
                  <td className="align-top py-2">
                    Correo electrónico y dirección IP (si te suscribes). Ver su{" "}
                    <a
                      href="https://www.useplunk.com/privacy"
                      className="text-brand-800 hover:text-brand-700"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      política de privacidad
                    </a>
                    .
                  </td>
                </tr>
                <tr>
                  <td className="align-top py-2 pr-4">
                    <a
                      href="https://render.com/"
                      className="text-brand-800 hover:text-brand-700"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Render
                    </a>
                  </td>
                  <td className="align-top py-2 pr-4">Alojamiento web</td>
                  <td className="align-top py-2">
                    Datos HTTP estándar (dirección IP, agente de usuario) como
                    parte de la infraestructura de alojamiento. No tenemos
                    acceso a los registros de infraestructura de Render.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4">
            Todas las fuentes tipográficas usadas en este sitio son
            auto-alojadas. No cargamos fuentes, scripts ni otros recursos
            desde CDNs externos como Google, lo que significa que tu dirección
            IP no se comparte con terceros cuando visitas el sitio.
          </p>

          <h2 className="section-heading mt-10">Tus derechos</h2>
          <p>Bajo el GDPR (y regulaciones similares), tienes derecho a:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Solicitar acceso a cualquier dato personal que tengamos sobre ti</li>
            <li>Solicitar la corrección o eliminación de tus datos</li>
            <li>Oponerte al procesamiento de datos</li>
            <li>Presentar una queja ante una autoridad supervisora</li>
          </ul>
          <p className="mt-3">
            Dado que recopilamos casi ningún dato personal, generalmente hay
            muy poco (o nada) que proporcionar. Si te has suscrito a nuestro
            boletín, podemos eliminar tu correo electrónico a petición.
          </p>
          <p>
            Para cualquier consulta relacionada con privacidad, contáctanos en{" "}
            <ObfuscatedEmail className="text-brand-800 hover:text-brand-700" />.
          </p>
        </div>
      </div>
    </>
  );
}
