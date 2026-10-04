import { Helmet } from 'react-helmet-async'
import { SEO, CommonOgTags } from '../lib/seo'
import { SITE_URL } from '../config'

const BASE_URL = SITE_URL
const API_BASE = `${BASE_URL}/api/opendata`

export default function OpenDataPage() {
  return (
    <>
      <Helmet>
        <title>{`Datos abiertos \u2014 ${SEO.siteName}`}</title>
        <meta
          name="description"
          content="API pública de Voces Indígenas para investigadores, periodistas y ONGs. Acceso libre a datos sobre pueblos indígenas en América Latina."
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
          <p>
            Se puede consultar desde servidores y scripts (curl, R, Python) y también desde el
            navegador en cualquier dominio: la API responde con CORS abierto.
          </p>

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
                  <td className="py-2">
                    Slug del tema. Las ocho categorías: <code>territorio-y-tierras</code>,{" "}
                    <code>cambio-climatico</code>, <code>consulta-y-consentimiento</code>,{" "}
                    <code>economias-indigenas</code>, <code>derechos-indigenas</code>,{" "}
                    <code>defensores-y-proteccion</code>, <code>mujeres-indigenas</code>,{" "}
                    <code>cultura-y-conocimientos-ancestrales</code>.
                    <br />
                    Y las secciones geográficas: <code>chile-indigena</code>,{" "}
                    <code>latinoamerica</code> (Abya Yala), <code>africa</code>, <code>asia</code>,{" "}
                    <code>oceania</code>, <code>sapmi</code>, <code>europa-occidental</code>,{" "}
                    <code>europa-oriental</code>.
                    <br />
                    Cada tema incluye sus subtemas.
                    <br />
                    <span className="text-neutral-500">
                      El slug antiguo <code>desarrollo-sostenible-y-autodeterminado</code> se sigue
                      aceptando y resuelve a <code>economias-indigenas</code>.
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-mono text-xs">community</td>
                  <td className="py-2 pr-4">string</td>
                  <td className="py-2">
                    Slug de una comunidad del directorio. Devuelve las historias que nombran a ese pueblo
                    o territorio, con la misma regla que su página en el sitio.
                    <br />
                    Los slugs válidos se obtienen con <code>{`GET ${BASE_URL}/api/communities`}</code>.
                    Por ejemplo: <code>mapuche</code>, <code>aymara</code>, <code>rapa-nui</code>,{" "}
                    <code>quechua</code>.
                  </td>
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
            <code>{`curl "${API_BASE}/stories?community=mapuche"`}</code>
          </pre>

          <h2 className="section-heading mt-10">Respuesta</h2>
          <pre className="bg-neutral-100 rounded-lg p-4 text-sm overflow-x-auto">
            <code>{`{
  "data": [
    {
      "title": "...",
      "url": "https://vocesindigenas.org/stories/...",
      "sourceUrl": "https://...",
      "publishedAt": "2025-06-01T00:00:00.000Z",
      "summary": "...",
      "relevanceSummary": "...",
      "emotionTag": "uplifting",
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
  "license": "CC-BY-4.0",
  "attribution": "Datos de Voces Indígenas (vocesindigenas.org), un programa de la Fundación KM. ..."
}`}</code>
          </pre>
          <p>
            El campo <code>emotionTag</code> toma uno de estos valores, en minúsculas:{' '}
            <code>"uplifting"</code>, <code>"frustrating"</code>, <code>"scary"</code> o{' '}
            <code>"calm"</code>. Puede venir <code>null</code> si la historia no tiene uno asignado.
          </p>

          <h2 className="section-heading mt-10" id="limites">Límites de uso</h2>
          <p>
            Hasta 100 solicitudes por hora, sin registro ni token. Al superarlas, la API responde
            HTTP 429; las cabeceras <code>RateLimit-Remaining</code> y <code>RateLimit-Reset</code>{' '}
            indican cuántas quedan y cuándo se reinicia el contador. Para descargar el archivo
            completo usa <code>limit=100</code> y espacia las solicitudes.
          </p>
          <p>
            Si tu investigación necesita más volumen, escríbenos a{' '}
            <a href="mailto:contacto@fundacionkm.org" className="text-brand-800 hover:text-brand-700">
              contacto@fundacionkm.org
            </a>{' '}
            y vemos cómo resolverlo.
          </p>

          <h2 className="section-heading mt-10">Atribución</h2>
          <p>
            El uso de esta API es libre. Si publicas resultados basados en estos datos,
            cita como:
          </p>
          <blockquote className="border-l-4 border-brand-800 pl-4 text-neutral-600 italic my-4">
            Voces Indígenas. <em>Open Data API</em>. {new Date().getFullYear()}.{' '}
            <a href={`${BASE_URL}/opendata`} className="text-brand-800 hover:text-brand-700">
              {`${BASE_URL}/opendata`}
            </a>
          </blockquote>

          <h2 className="section-heading mt-10">Licencia y términos</h2>
          <p>
            Los datos que produce Voces Indígenas (títulos, resúmenes, análisis de relevancia y
            clasificación por tema) se publican bajo licencia{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/deed.es" className="text-brand-800 hover:text-brand-700">
              Creative Commons Atribución 4.0 (CC BY 4.0)
            </a>
            : puedes reutilizarlos, también con fines comerciales, citando la fuente como se indica
            arriba. Las noticias originales, a las que enlaza <code>sourceUrl</code>, pertenecen a
            sus autores y no están cubiertas por esta licencia.
          </p>

        </div>
      </div>
    </>
  )
}
