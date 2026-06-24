import { Helmet } from 'react-helmet-async'
import { SEO, CommonOgTags } from '../lib/seo'

const BASE_URL = 'https://impactoindigena.news'
const API_BASE = `${BASE_URL}/api/opendata`

export default function OpenDataPage() {
  return (
    <>
      <Helmet>
        <title>Datos abiertos \u2014 {SEO.siteName}</title>
        <meta
          name="description"
          content="API pública de Impacto Indígena para investigadores, periodistas y ONGs. Acceso libre a datos sobre pueblos indígenas en América Latina."
        />
        <meta property="og:title" content={`Datos abiertos \u2014 ${SEO.siteName}`} />
        <meta
          property="og:description"
          content="API pública para investigadores y ONGs. Datos sobre pueblos indígenas en América Latina, libre acceso con atribución."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/opendata`} />
        <link rel="canonical" href={`${SEO.siteUrl}/opendata`} />
        {CommonOgTags({})}
      </Helmet>

      {/* Hero */}
      <div className="bg-neutral-900 text-white py-14 px-4 mb-0">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-brand-400 mb-4">Open Data</span>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            Datos abiertos<br className="hidden md:block" /> para investigadores
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-xl mx-auto">
            Acceso libre a noticias curadas sobre pueblos indígenas en América Latina.
            Sin registro. Con atribución.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="prose max-w-none">

          <h2 className="section-heading mt-8">Endpoint</h2>
          <pre className="bg-neutral-100 rounded-lg p-4 text-sm overflow-x-auto">
            <code>GET {API_BASE}/stories</code>
          </pre>

          <h2 className="section-heading mt-10">Parámetros</h2>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-2 pr-4 font-normal">Parámetro</th>
                  <th className="text-left py-2 pr-4 font-normal">Tipo</th>
                  <th className="text-left py-2 font-normal">Descripción</th>
                </tr>
              </thead>
              <tbody className="text-neutral-600">
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-mono text-xs">topic</td>
                  <td className="py-2 pr-4">string</td>
                  <td className="py-2">Slug del tema. Valores: <code>derechos-indigenas</code>, <code>cambio-climatico</code>, <code>chile-indigena</code>, <code>desarrollo-sostenible-y-autodeterminado</code></td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-mono text-xs">community</td>
                  <td className="py-2 pr-4">string</td>
                  <td className="py-2">Slug de una comunidad del directorio. Filtra historias relevantes para esa comunidad.</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-mono text-xs">since</td>
                  <td className="py-2 pr-4">ISO 8601</td>
                  <td className="py-2">Fecha mínima de publicación. Ejemplo: <code>2025-01-01</code></td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-mono text-xs">page</td>
                  <td className="py-2 pr-4">número</td>
                  <td className="py-2">Página (default: 1)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">limit</td>
                  <td className="py-2 pr-4">número</td>
                  <td className="py-2">Resultados por página, máx. 100 (default: 25)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="section-heading mt-10">Ejemplos</h2>

          <h3 className="text-base font-semibold mt-6 mb-2">Últimas noticias sobre derechos indígenas</h3>
          <pre className="bg-neutral-100 rounded-lg p-4 text-sm overflow-x-auto">
            <code>{`curl "${API_BASE}/stories?topic=derechos-indigenas&limit=10"`}</code>
          </pre>

          <h3 className="text-base font-semibold mt-6 mb-2">Historias desde 2025 en Chile</h3>
          <pre className="bg-neutral-100 rounded-lg p-4 text-sm overflow-x-auto">
            <code>{`curl "${API_BASE}/stories?topic=chile-indigena&since=2025-01-01"`}</code>
          </pre>

          <h3 className="text-base font-semibold mt-6 mb-2">Historias sobre el Pueblo Mapuche</h3>
          <pre className="bg-neutral-100 rounded-lg p-4 text-sm overflow-x-auto">
            <code>{`curl "${API_BASE}/stories?community=pueblo-mapuche"`}</code>
          </pre>

          <h2 className="section-heading mt-10">Respuesta</h2>
          <pre className="bg-neutral-100 rounded-lg p-4 text-sm overflow-x-auto">
            <code>{`{
  "data": [
    {
      "title": "...",
      "url": "https://impactoindigena.news/stories/...",
      "sourceUrl": "https://...",
      "publishedAt": "2025-06-01T00:00:00.000Z",
      "summary": "...",
      "relevanceSummary": "...",
      "emotionTag": "HOPEFUL",
      "imageUrl": "https://...",
      "issue": { "name": "Derechos Indígenas", "slug": "derechos-indigenas" },
      "source": "Mapuexpress"
    }
  ],
  "meta": {
    "total": 842,
    "page": 1,
    "limit": 25,
    "totalPages": 34
  },
  "attribution": "Datos de Impacto Indígena (impactoindigena.news). ..."
}`}</code>
          </pre>

          <h2 className="section-heading mt-10" id="limites">Límites de uso</h2>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-2 pr-4 font-normal">Nivel</th>
                  <th className="text-left py-2 pr-4 font-normal">Límite</th>
                  <th className="text-left py-2 font-normal">Acceso</th>
                </tr>
              </thead>
              <tbody className="text-neutral-600">
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4">Público</td>
                  <td className="py-2 pr-4">100 solicitudes / hora</td>
                  <td className="py-2">Sin registro, sin token</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Institucional</td>
                  <td className="py-2 pr-4">1 000 solicitudes / hora</td>
                  <td className="py-2">Token <code>Authorization: Bearer &lt;token&gt;</code></td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="section-heading mt-10" id="institutional">Acceso institucional</h2>
          <p>
            Universidades, ONGs, bufetes de DDHH y periodistas que necesiten mayor volumen pueden
            solicitar un token institucional. Incluye 1 000 solicitudes/hora y soporte directo.
          </p>
          <p>
            Escríbenos a{' '}
            <a href="mailto:contacto@fundacionkm.org" className="text-brand-800 hover:text-brand-700">
              contacto@fundacionkm.org
            </a>{' '}
            con asunto <strong>"API institucional"</strong> e indica tu organización y uso previsto.
          </p>

          <h2 className="section-heading mt-10">Atribución</h2>
          <p>
            El uso de esta API es libre. Si publicas resultados basados en estos datos,
            cita como:
          </p>
          <blockquote className="border-l-4 border-brand-800 pl-4 text-neutral-600 italic my-4">
            Impacto Indígena. <em>Open Data API</em>. {new Date().getFullYear()}.{' '}
            <a href={`${BASE_URL}/opendata`} className="text-brand-800 hover:text-brand-700">
              {`${BASE_URL}/opendata`}
            </a>
          </blockquote>

          <h2 className="section-heading mt-10">Licencia y términos</h2>
          <p>
            Los datos son de uso libre para investigación, periodismo, y trabajo de ONGs, con
            atribución requerida. No se permite redistribución comercial de los datos sin autorización.
            Los metadatos de análisis IA son propios de Impacto Indígena; las noticias fuente pertenecen
            a sus respectivos autores.
          </p>

        </div>
      </div>
    </>
  )
}
