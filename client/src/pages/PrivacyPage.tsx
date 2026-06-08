import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import ObfuscatedEmail from "../components/ObfuscatedEmail";
import { SEO, CommonOgTags } from "../lib/seo";

export default function PrivacyPage() {
  return (
    <>
      <Helmet>
        <title>Política de Privacidad - {SEO.siteName}</title>
        <meta
          name="description"
          content="Política de privacidad de Impacto Indígena, conforme a la Ley 21.719 de Chile. Analítica sin cookies, datos mínimos y tus derechos ARCO+."
        />
        <meta
          property="og:title"
          content={`Política de Privacidad - ${SEO.siteName}`}
        />
        <meta
          property="og:description"
          content="Política de privacidad de Impacto Indígena, conforme a la Ley 21.719 de Chile."
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
            Para los lectores, nada se almacena en tu dispositivo. Solo tratamos los datos mínimos que nos das voluntariamente.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="prose max-w-none">
          {/* 1. Responsable */}
          <h2 className="section-heading mt-4">Responsable del tratamiento</h2>
          <p>
            El responsable del tratamiento de datos personales de este sitio es{" "}
            <strong>Impacto Indígena SpA</strong>, RUT 76.707.746-7, con domicilio
            en Chile, titular del medio de noticias{" "}
            <strong>impactoindigena.news</strong>. Para el ejercicio de tus
            derechos o cualquier consulta de privacidad, escríbenos a{" "}
            <ObfuscatedEmail className="text-brand-800 hover:text-brand-700" />.
          </p>

          {/* 2. Marco legal */}
          <h2 className="section-heading mt-10">Marco legal</h2>
          <p>
            Tratamos tus datos conforme a la legislación chilena vigente, en
            particular la <strong>Ley N° 21.719</strong> (que regula la
            protección de los datos personales y crea la Agencia de Protección
            de Datos Personales) y la <strong>Ley N° 19.628</strong> sobre
            Protección de la Vida Privada en lo aplicable. Como medio dedicado a
            pueblos indígenas, adherimos a los principios del Convenio 169 de la
            OIT y de la Declaración de las Naciones Unidas sobre los Derechos de
            los Pueblos Indígenas (UNDRIP).
          </p>

          {/* 3. Qué recopilamos */}
          <h2 className="section-heading mt-10">Qué datos recopilamos</h2>
          <p>
            Impacto Indígena es un medio de acceso público. <strong>No
            requerimos registro para leer.</strong> Los datos personales que
            tratamos se limitan a:
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>Boletín:</strong> tu correo y, opcionalmente, tu nombre, cuando te suscribes voluntariamente.</li>
            <li><strong>Alertas por tema:</strong> tu correo y los temas que selecciones.</li>
            <li><strong>Acceso de miembros:</strong> tu correo, si inicias sesión con enlace mágico.</li>
            <li><strong>Feedback:</strong> tu mensaje y, opcionalmente, tu correo; de la IP solo guardamos un hash no reversible.</li>
            <li><strong>Métricas de uso:</strong> páginas vistas y fuente de tráfico, siempre de forma agregada y sin identificación personal.</li>
          </ul>
          <p className="mt-3">
            No recopilamos geolocalización individual, ni IP en bruto persistente,
            ni datos sensibles de comunidades o territorios a través de este sitio.
          </p>

          {/* 4. Finalidades */}
          <h2 className="section-heading mt-10">Finalidades y base de licitud</h2>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Enviarte el boletín o las alertas que solicitaste — <strong>consentimiento</strong>.</li>
            <li>Operar y asegurar el sitio (sesiones de miembros/administración) — <strong>interés legítimo</strong>.</li>
            <li>Medir audiencia de forma agregada — <strong>interés legítimo</strong> (sin datos personales).</li>
            <li>Cumplir obligaciones legales — <strong>obligación legal</strong>.</li>
          </ul>
          <p className="mt-3">
            No realizamos decisiones automatizadas con efectos jurídicos sobre
            las personas, ni elaboramos perfiles individuales de los lectores.
          </p>

          {/* 5. Encargados */}
          <h2 className="section-heading mt-10">Encargados de tratamiento</h2>
          <p>Para operar el sitio recurrimos a los siguientes proveedores, que tratan datos por cuenta nuestra:</p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th scope="col" className="text-left align-top py-2 pr-4 font-normal">Proveedor</th>
                  <th scope="col" className="text-left align-top py-2 pr-4 font-normal">Función</th>
                  <th scope="col" className="text-left align-top py-2 font-normal">Datos involucrados</th>
                </tr>
              </thead>
              <tbody className="text-neutral-600">
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Microsoft Azure</td>
                  <td className="align-top py-2 pr-4">Hospedaje y base de datos</td>
                  <td className="align-top py-2">Toda la base, incluidos correos de suscriptores</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Brevo</td>
                  <td className="align-top py-2 pr-4">Envío de boletines y correos; verificación de correo</td>
                  <td className="align-top py-2">Correo y nombre de suscriptores; métricas de apertura/clic</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Simple Analytics</td>
                  <td className="align-top py-2 pr-4">Métricas de audiencia (sin cookies)</td>
                  <td className="align-top py-2">Datos agregados, sin identificación personal</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">OpenAI / Azure OpenAI</td>
                  <td className="align-top py-2 pr-4">Análisis y resúmenes con IA</td>
                  <td className="align-top py-2">Contenido de noticias de fuentes públicas (no datos de lectores)</td>
                </tr>
                <tr>
                  <td className="align-top py-2 pr-4">Cloudflare R2</td>
                  <td className="align-top py-2 pr-4">Almacenamiento de imágenes</td>
                  <td className="align-top py-2">Imágenes editoriales (sin datos de lectores)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 6. Transferencias */}
          <h2 className="section-heading mt-10">Transferencias internacionales</h2>
          <p>
            Parte de la infraestructura puede operar fuera de Chile. En esos
            casos exigimos a los proveedores resguardos equivalentes (cláusulas
            contractuales y estándares de seguridad reconocidos) y no
            autorizamos transferencias ulteriores sin base legal.
          </p>

          {/* 7. Conservación */}
          <h2 className="section-heading mt-10">Conservación</h2>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Suscriptores del boletín o alertas: mientras la suscripción esté activa; se eliminan o anonimizan tras la baja.</li>
            <li>Registros del servidor: hasta 14 días, luego se eliminan automáticamente.</li>
            <li>Tokens de sesión y enlaces mágicos: se purgan automáticamente al expirar.</li>
            <li>Feedback: hasta su procesamiento y por el plazo legal aplicable.</li>
          </ul>

          {/* 8. Derechos */}
          <h2 className="section-heading mt-10">Tus derechos (ARCO+)</h2>
          <p>
            Puedes ejercer en cualquier momento tus derechos de acceso,
            rectificación, cancelación (supresión), oposición, portabilidad y
            bloqueo escribiéndonos a{" "}
            <ObfuscatedEmail className="text-brand-800 hover:text-brand-700" />.
            Responderemos en los plazos legales y puedes reclamar ante la
            Agencia de Protección de Datos Personales. La baja del boletín es
            inmediata desde el enlace al pie de cada correo.
          </p>

          {/* 9. Seguridad */}
          <h2 className="section-heading mt-10">Seguridad</h2>
          <p>
            Aplicamos medidas técnicas y organizativas razonables: cifrado en
            tránsito, contraseñas con hashing (bcrypt), control de acceso,
            rotación de tokens y registro de actividad. Ante un incidente que
            afecte datos personales, notificaremos conforme a la Ley 21.719.
          </p>

          {/* 10. Cookies / Términos */}
          <h2 className="section-heading mt-10">Cookies y términos</h2>
          <p>
            El uso de cookies se detalla en nuestra{" "}
            <Link to="/cookies" className="text-brand-800 hover:text-brand-700">Política de Cookies</Link>.
            El uso del sitio se rige por nuestros{" "}
            <Link to="/terminos" className="text-brand-800 hover:text-brand-700">Términos y Condiciones</Link>.
          </p>

          <h2 className="section-heading mt-10">Cambios</h2>
          <p>
            Podemos actualizar esta política. Publicaremos la versión vigente en
            esta página. Los cambios sustanciales se informarán por los canales
            del sitio.
          </p>
        </div>
      </div>
    </>
  );
}
