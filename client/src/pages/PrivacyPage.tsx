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
            Para los lectores no usamos cookies ni rastreo; solo preferencias técnicas en tu navegador. Tratamos los datos mínimos que nos das voluntariamente.
          </p>
        </div>
      </div>

      <div className="page-section">
        <div className="prose max-w-none">
          <p className="text-sm text-neutral-500 not-prose mb-6">
            Versión 2.1 · vigente desde el 27 de junio de 2026.
          </p>

          {/* 1. Responsable */}
          <h2 className="section-heading mt-4">Responsable del tratamiento</h2>
          <p>
            El responsable del tratamiento de datos personales de este sitio es la{" "}
            <strong>Fundación Coñuepan-Millaquir</strong> (RUT 65.191.983-5),
            organización sin fines de lucro con domicilio en Chile, que opera el
            medio <strong>impactoindigena.news</strong> como programa con fines
            exclusivamente informativos y educativos. Su representante legal es{" "}
            <strong>Venancio Coñuepan Mesías</strong>. No hemos designado un
            delegado de protección de datos, figura de carácter facultativo
            conforme al artículo 50 de la Ley 21.719; las consultas de privacidad
            las atiende directamente el responsable. Para ejercer tus derechos o
            cualquier consulta de privacidad, escríbenos a{" "}
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
            los Pueblos Indígenas (UNDRIP), y a los principios de licitud,
            lealtad, transparencia y minimización de datos.
          </p>

          {/* 3. Fuente y datos */}
          <h2 className="section-heading mt-10">Origen y datos que tratamos</h2>
          <p>
            Tratamos datos personales de <strong>dos orígenes</strong>:
          </p>
          <p className="mt-2"><strong>(a) Datos que nos entregas directamente.</strong> No requerimos registro para leer. Se limitan a:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>Boletín:</strong> tu correo y, opcionalmente, tu nombre, cuando te suscribes voluntariamente.</li>
            <li><strong>Alertas por tema:</strong> tu correo y los temas que selecciones.</li>
            <li><strong>Acceso de miembros:</strong> tu correo, si inicias sesión con enlace mágico.</li>
            <li><strong>Membresía a comunidades:</strong> la(s) comunidad(es) a la(s) que te unes y tus preferencias de recepción del boletín de comunidad (digest).</li>
            <li><strong>Feedback:</strong> tu mensaje y, opcionalmente, tu correo; de la IP solo guardamos un hash no reversible.</li>
            <li><strong>Métricas de uso:</strong> páginas vistas y fuente de tráfico, de forma agregada y sin identificación personal, mediante analítica propia (sin proveedores de rastreo de terceros).</li>
            <li><strong>Búsqueda:</strong> el texto que escribes se procesa con nuestro proveedor de IA para la búsqueda semántica; no se asocia a tu identidad ni se usa para entrenar modelos.</li>
          </ul>
          <p className="mt-3">
            <strong>(b) Datos provenientes de fuentes de acceso público.</strong>{" "}
            Nuestra labor editorial consiste en rastrear noticias publicadas por{" "}
            <strong>medios de comunicación de acceso público</strong> y organizarlas
            para divulgarlas. Ese contenido puede incluir datos personales de
            terceros que aparecen en las noticias (por ejemplo, autoridades,
            dirigentes y personas citadas): sus nombres, declaraciones y el texto
            de los artículos. Conforme al artículo 14 ter letra j) de la Ley
            21.719, te informamos que esta parte de los datos proviene de fuentes
            de acceso público; su tratamiento queda igualmente sujeto a esta ley y
            al deber de secreto del artículo 14 bis.
          </p>
          <p className="mt-3">
            El universo de personas comprendido abarca: suscriptores del boletín y
            de alertas, miembros de comunidades, personal administrativo del medio,
            quienes envían feedback, y personas mencionadas en las noticias de
            fuentes públicas que cubrimos.
          </p>

          {/* 4. Finalidades y base de licitud */}
          <h2 className="section-heading mt-10">Finalidades y base de licitud</h2>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Enviarte el boletín o las alertas que solicitaste — <strong>consentimiento</strong>.</li>
            <li>Operar y asegurar el sitio (sesiones de miembros/administración) — <strong>interés legítimo</strong> en la seguridad de la información y la prevención de abuso.</li>
            <li>Medir audiencia de forma agregada — <strong>interés legítimo</strong> en conocer el alcance de la divulgación (sin datos personales).</li>
            <li>Rastrear, organizar y divulgar noticias de pueblos indígenas provenientes de medios de acceso público — <strong>interés legítimo</strong> en informar al público sobre asuntos indígenas de interés público, en cumplimiento de nuestra misión sin fines de lucro, informativa y educativa, junto con el tratamiento de datos provenientes de fuentes de acceso público.</li>
            <li>Cumplir obligaciones legales — <strong>obligación legal</strong>.</li>
          </ul>
          <p className="mt-3">
            <strong>Tratamiento con apoyo de inteligencia artificial.</strong>{" "}
            Usamos modelos de IA para clasificar, resumir y traducir las noticias
            (por ejemplo, asignar categoría, evaluar relevancia y generar bajadas).
            Es un apoyo editorial automatizado sobre contenido noticioso; <strong>no
            adoptamos decisiones automatizadas con efectos jurídicos sobre las
            personas ni elaboramos perfiles individuales de los lectores.</strong>
          </p>

          {/* 5. Datos sensibles */}
          <h2 className="section-heading mt-10">Datos sensibles</h2>
          <p>
            No solicitamos a nuestros lectores ni suscriptores datos personales
            sensibles (salud, origen étnico individual, creencias, orientación
            sexual, datos biométricos o genéticos). Como cubrimos asuntos de
            pueblos indígenas, el contenido editorial proveniente de medios públicos
            puede, en ciertos casos, revelar el <strong>origen étnico</strong> de
            personas identificables. Cuando ello ocurre respecto de declaraciones o
            información que la propia persona o la fuente hicieron{" "}
            <strong>manifiestamente públicas</strong>, su tratamiento se ampara en
            el artículo 16 letra a) de la Ley 21.719 y se realiza para los fines
            informativos en que fueron publicadas. Aplicamos minimización: evitamos
            exponer atributos sensibles de personas privadas más allá de lo que la
            noticia de interés público requiere, y atendemos solicitudes de
            rectificación o supresión.
          </p>

          {/* 6. Encargados */}
          <h2 className="section-heading mt-10">Encargados de tratamiento y destinatarios</h2>
          <p>
            No vendemos ni cedemos tus datos a terceros para fines propios de
            estos. Solo los tratan, por cuenta nuestra, los siguientes encargados:
          </p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th scope="col" className="text-left align-top py-2 pr-4 font-normal">Proveedor</th>
                  <th scope="col" className="text-left align-top py-2 pr-4 font-normal">Función</th>
                  <th scope="col" className="text-left align-top py-2 pr-4 font-normal">Ubicación</th>
                  <th scope="col" className="text-left align-top py-2 font-normal">Datos involucrados</th>
                </tr>
              </thead>
              <tbody className="text-neutral-600">
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Microsoft Azure</td>
                  <td className="align-top py-2 pr-4">Hospedaje y base de datos</td>
                  <td className="align-top py-2 pr-4">EE.&nbsp;UU.</td>
                  <td className="align-top py-2">Toda la base, incluidos correos de suscriptores</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Microsoft Azure OpenAI</td>
                  <td className="align-top py-2 pr-4">Clasificación, resumen y traducción con IA; búsqueda semántica</td>
                  <td className="align-top py-2 pr-4">EE.&nbsp;UU.</td>
                  <td className="align-top py-2">Contenido editorial de noticias de fuentes públicas —incluidos nombres, cargos y citas de terceros, y el pueblo indígena divulgado por la fuente (art. 16 a)— y, por separado, las consultas del buscador, que no se asocian a tu identidad</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Microsoft Azure AI Foundry</td>
                  <td className="align-top py-2 pr-4">Generación de imágenes editoriales</td>
                  <td className="align-top py-2 pr-4">Suecia (UE)</td>
                  <td className="align-top py-2">Texto descriptivo para generar imágenes (sin datos de lectores)</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Brevo</td>
                  <td className="align-top py-2 pr-4">Envío de boletines y correos; verificación de correo</td>
                  <td className="align-top py-2 pr-4">Unión Europea</td>
                  <td className="align-top py-2">Correo y nombre de suscriptores; métricas de apertura/clic</td>
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="align-top py-2 pr-4">Cloudflare R2</td>
                  <td className="align-top py-2 pr-4">Almacenamiento de imágenes</td>
                  <td className="align-top py-2 pr-4">EE.&nbsp;UU. / global</td>
                  <td className="align-top py-2">Imágenes editoriales (sin datos de lectores)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 7. Transferencias */}
          <h2 className="section-heading mt-10">Transferencias internacionales</h2>
          <p>
            Parte de la infraestructura opera fuera de Chile, según la tabla
            anterior: principalmente en <strong>EE.&nbsp;UU.</strong> (Microsoft
            Azure: base de datos y servicios de IA; Cloudflare) y en la{" "}
            <strong>Unión Europea</strong> (Brevo y la generación de imágenes en
            Suecia). Para los destinos respecto de los cuales no exista una
            declaración de nivel adecuado de protección, las transferencias se
            amparan en garantías idóneas, en particular las{" "}
            <strong>cláusulas contractuales tipo</strong> aprobadas por la
            autoridad chilena, y no se autorizan transferencias ulteriores sin
            base legal.
          </p>

          {/* 8. Conservación */}
          <h2 className="section-heading mt-10">Conservación</h2>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Suscriptores del boletín o alertas: mientras la suscripción esté activa; se eliminan o anonimizan tras la baja.</li>
            <li>Registros del servidor: hasta 14 días, luego se eliminan automáticamente.</li>
            <li>Tokens de sesión y enlaces mágicos: se purgan automáticamente al expirar.</li>
            <li>Feedback: hasta su procesamiento y por el plazo legal aplicable.</li>
            <li>Contenido editorial y datos de noticias de fuentes públicas: mientras tengan valor informativo o de archivo; se rectifican o suprimen ante solicitud fundada.</li>
          </ul>

          {/* 9. Derechos */}
          <h2 className="section-heading mt-10">Tus derechos (ARCO+P)</h2>
          <p>
            Puedes ejercer en cualquier momento tus derechos de acceso,
            rectificación, supresión (cancelación), oposición, portabilidad y
            bloqueo escribiéndonos a{" "}
            <ObfuscatedEmail className="text-brand-800 hover:text-brand-700" />.
            Responderemos dentro de <strong>30 días corridos</strong> desde tu
            solicitud, prorrogables por una sola vez hasta por 30 días corridos
            adicionales (art. 11 Ley 21.719), y acusaremos recibo. El ejercicio de
            los derechos de rectificación, supresión y oposición es{" "}
            <strong>siempre gratuito</strong>; el acceso es gratuito al menos una
            vez por trimestre.
          </p>
          <p className="mt-3">
            Cuando el tratamiento se basa en tu <strong>consentimiento</strong>{" "}
            (boletín y alertas), puedes <strong>retirarlo en cualquier momento</strong>{" "}
            por medios sencillos, gratuitos y permanentes (enlace de baja al pie de
            cada correo), sin que ello afecte la licitud del tratamiento anterior al
            retiro. La baja del boletín es inmediata.
          </p>
          <p className="mt-3">
            Si apareces mencionado en una noticia que cubrimos, también puedes
            solicitar la rectificación, supresión u oposición respecto de tus datos.
            Atenderemos tu solicitud salvo que existan motivos legítimos imperiosos
            para mantener el tratamiento (por ejemplo, el interés público de la
            información).
          </p>
          <p className="mt-3">
            Si rechazamos o no respondemos oportunamente tu solicitud, tienes
            derecho a reclamar ante la <strong>Agencia de Protección de Datos
            Personales</strong>.
          </p>

          {/* 10. Menores */}
          <h2 className="section-heading mt-10">Menores de edad</h2>
          <p>
            Nuestro servicio está dirigido a personas adultas. No recopilamos
            conscientemente datos personales de niños, niñas y adolescentes a
            través de los formularios del sitio. El tratamiento de datos de
            menores se rige por las condiciones reforzadas del artículo 16 quáter
            de la Ley 21.719. Si crees que un menor nos entregó datos sin la
            debida autorización, escríbenos y los suprimiremos.
          </p>

          {/* 11. Seguridad */}
          <h2 className="section-heading mt-10">Seguridad</h2>
          <p>
            Aplicamos medidas técnicas y organizativas razonables: cifrado en
            tránsito, contraseñas con hashing (bcrypt), control de acceso,
            rotación de tokens y registro de actividad. Ante un incidente que
            afecte datos personales, notificaremos conforme a la Ley 21.719.
          </p>

          {/* 12. Cookies / Términos */}
          <h2 className="section-heading mt-10">Cookies y términos</h2>
          <p>
            El uso de cookies se detalla en nuestra{" "}
            <Link to="/cookies" className="text-brand-800 hover:text-brand-700">Política de Cookies</Link>.
            El uso del sitio se rige por nuestros{" "}
            <Link to="/terminos" className="text-brand-800 hover:text-brand-700">Términos y Condiciones</Link>.
          </p>

          {/* 13. Cambios */}
          <h2 className="section-heading mt-10">Cambios</h2>
          <p>
            Podemos actualizar esta política. Publicaremos la versión vigente —
            con su número y fecha — en esta página, y los cambios sustanciales se
            informarán por los canales del sitio.
          </p>

          <p className="text-sm text-neutral-400 not-prose mt-10 border-t border-neutral-200 pt-4">
            Este texto es un borrador de cumplimiento fundado en la Ley 21.719; no
            constituye asesoría legal.
          </p>
        </div>
      </div>
    </>
  );
}
