import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { SEO, CommonOgTags } from "../lib/seo";

export default function CookiesPage() {
  return (
    <>
      <Helmet>
        <title>Política de Cookies - {SEO.siteName}</title>
        <meta
          name="description"
          content="Política de cookies de Impacto Indígena conforme a la Ley 21.719. Sin cookies de rastreo ni publicidad; analítica agregada sin cookies."
        />
        <meta property="og:title" content={`Política de Cookies - ${SEO.siteName}`} />
        <meta
          property="og:description"
          content="Política de cookies de Impacto Indígena. Sin rastreo ni publicidad."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/cookies`} />
        <link rel="canonical" href={`${SEO.siteUrl}/cookies`} />
        {CommonOgTags({})}
      </Helmet>

      <div className="page-section">
        <h1 className="page-title">Política de Cookies</h1>

        <div className="prose max-w-none">
          <h2 className="section-heading mt-8">Responsable</h2>
          <p>
            <strong>Fundación Coñuepan-Millaquir</strong>, RUT 65.191.983-5,
            organización sin fines de lucro que opera impactoindigena.news. Contacto:{" "}
            <a href="mailto:contacto@fundacionkm.org" className="text-brand-800 hover:text-brand-700">
              contacto@fundacionkm.org
            </a>
            .
          </p>

          <h2 className="section-heading mt-8">Nuestro enfoque</h2>
          <p>
            Impacto Indígena está diseñado para ser respetuoso de la privacidad.
            Para la lectura pública del sitio <strong>no usamos cookies de
            seguimiento, publicidad, fingerprinting ni venta de datos</strong>.
            La analítica es agregada y sin cookies.
          </p>

          <h2 className="section-heading mt-8">Categorías de cookies (Ley N° 21.719)</h2>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th scope="col" className="text-left align-top py-2 pr-4 font-normal">Categoría</th>
                  <th scope="col" className="text-left align-top py-2 pr-4 font-normal">¿Usamos?</th>
                  <th scope="col" className="text-left align-top py-2 font-normal">Requiere consentimiento</th>
                </tr>
              </thead>
              <tbody className="text-neutral-600">
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Estrictamente necesarias</td>
                  <td className="align-top py-2 pr-4">Sí (solo en áreas con sesión)</td>
                  <td className="align-top py-2">No (habilitan funciones básicas)</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Funcionales</td>
                  <td className="align-top py-2 pr-4">No</td>
                  <td className="align-top py-2">—</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Analíticas</td>
                  <td className="align-top py-2 pr-4">No (la analítica es sin cookies)</td>
                  <td className="align-top py-2">—</td>
                </tr>
                <tr>
                  <td className="align-top py-2 pr-4">Publicitarias</td>
                  <td className="align-top py-2 pr-4">No</td>
                  <td className="align-top py-2">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="section-heading mt-8">Cookies y almacenamiento que sí usamos</h2>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>Sesión de miembros y administración</strong> (estrictamente necesarias): cookies de autenticación para quienes inician sesión. No se instalan al navegar como lector público.</li>
            <li>
              <strong>Preferencias guardadas en tu navegador</strong> (almacenamiento local, <em>localStorage</em>): valores técnicos que recuerdan cómo prefieres usar el Sitio. No son cookies, no contienen datos personales y nunca salen de tu navegador. Incluyen:
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>el nivel del control de positividad con el que filtras las noticias;</li>
                <li>el idioma en el que eliges ver el Sitio;</li>
                <li>los temas o secciones que marcas como preferidos;</li>
                <li>las noticias que guardas para leer más tarde;</li>
                <li>el historial de noticias que ya abriste, para señalar las leídas.</li>
              </ul>
            </li>
          </ul>
          <p className="mt-3">
            Para los lectores que no inician sesión, el Sitio no instala cookies.
          </p>

          <h2 className="section-heading mt-8">Analítica sin cookies</h2>
          <p>
            Usamos Simple Analytics, que mide audiencia de forma agregada, sin
            cookies y sin datos personales. No usamos Google Analytics ni
            píxeles publicitarios.
          </p>

          <h2 className="section-heading mt-8">Cómo gestionar cookies</h2>
          <p>
            Puedes bloquear o borrar cookies desde la configuración de tu
            navegador. Bloquear las estrictamente necesarias puede impedir el
            acceso a las áreas con sesión.
          </p>
          <p className="mt-3">
            Desde esa misma configuración también puedes borrar el
            almacenamiento local (localStorage); al hacerlo se eliminarán las
            preferencias descritas más arriba y el Sitio volverá a sus valores
            por defecto.
          </p>

          <h2 className="section-heading mt-8">Más información</h2>
          <p>
            Consulta también nuestra{" "}
            <Link to="/privacy" className="text-brand-800 hover:text-brand-700">Política de Privacidad</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
