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
          content="Política de privacidad de Voces Indígenas. Regida por la Ley 19.628 y en adecuación a la Ley 21.719, vigente desde diciembre de 2026. Analítica sin cookies, datos mínimos y tus derechos."
        />
        <meta
          property="og:title"
          content={`Política de Privacidad - ${SEO.siteName}`}
        />
        <meta
          property="og:description"
          content="Política de privacidad de Voces Indígenas, en adecuación a la Ley 21.719 de Chile."
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
            Versión 2.8 · vigente desde el 17 de agosto de 2026.
          </p>

          {/* 1. Responsable */}
          <h2 className="section-heading mt-4">Responsable del tratamiento</h2>
          <p>
            El responsable del tratamiento de datos personales de este sitio es la{" "}
            <strong>Fundación Coñuepan-Millaquir</strong> (RUT 65.191.983-5),
            organización sin fines de lucro con domicilio en Chile, que opera el
            medio <strong>vocesindigenas.org</strong> como programa con fines
            exclusivamente informativos y educativos. Su representante legal es{" "}
            <strong>Venancio Coñuepan Mesías</strong>. No hemos designado un
            delegado de protección de datos: la Ley 19.628 vigente no contempla esa
            figura, y el artículo 50 de la Ley 21.719 la establece como
            facultativa ("podrá designar"). Las consultas de privacidad las
            atiende directamente el responsable. Para ejercer tus derechos o
            cualquier consulta de privacidad, escríbenos a{" "}
            <ObfuscatedEmail className="text-brand-800 hover:text-brand-700" />.
          </p>

          {/* 2. Marco legal */}
          <h2 className="section-heading mt-10">Marco legal</h2>
          <p>
            La normativa de protección de datos personales vigente hoy en Chile
            es la <strong>Ley N° 19.628</strong> sobre Protección de la Vida
            Privada, y conforme a ella tratamos tus datos. El envío del boletín
            y de las alertas se apoya en tu consentimiento (artículo 4°); el
            origen étnico que puede revelar tu membresía a una comunidad de tipo{" "}
            <em>pueblo</em>, en tu consentimiento expreso (artículo 10); y
            nuestra labor editorial sobre noticias publicadas por medios de
            acceso público, en el régimen que el artículo 9° reconoce a los datos
            provenientes de fuentes accesibles al público.
          </p>
          <p className="mt-3">
            La <strong>Ley N° 21.719</strong>, que regula la protección de los
            datos personales y crea la Agencia de Protección de Datos Personales,{" "}
            <strong>entrará en vigencia el 1 de diciembre de 2026</strong>.
            Estamos adecuando la plataforma a lo que esa ley mandata, con el
            objeto de cumplirla desde el día en que corresponda. Las referencias
            que esta política hace a sus artículos describen el estándar al que
            estamos migrando y la forma en que operaremos a partir de esa fecha;{" "}
            <strong>no importan la asunción de obligaciones exigibles con
            anterioridad a su entrada en vigencia</strong>.
          </p>
          <p className="mt-3">
            Como medio dedicado a pueblos indígenas, adherimos además a los
            principios del Convenio 169 de la OIT y de la Declaración de las
            Naciones Unidas sobre los Derechos de los Pueblos Indígenas (UNDRIP),
            y a los principios de licitud, lealtad, transparencia y minimización
            de datos.
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
            <li><strong>Métricas de uso:</strong> páginas vistas, fuente de tráfico, país y tipo de dispositivo (móvil/escritorio), de forma agregada y sin identificación personal, mediante analítica propia sin cookies (un contador en nuestra propia base de datos, sin proveedores de terceros). Para estimar visitantes únicos por día y el país, procesamos tu dirección IP y tu navegador <strong>en el momento y de forma transitoria</strong>: no los almacenamos. Solo guardamos el país, la categoría de dispositivo y un identificador diario no reversible que cambia cada día, de modo que no permite seguirte entre días ni identificarte.</li>
            <li><strong>Búsqueda:</strong> el texto que escribes se procesa con nuestro proveedor de IA para la búsqueda semántica; no se asocia a tu identidad ni se usa para entrenar modelos.</li>
          </ul>
          <p className="mt-3">
            <strong>(b) Datos provenientes de fuentes de acceso público.</strong>{" "}
            Nuestra labor editorial consiste en rastrear noticias publicadas por{" "}
            <strong>medios de comunicación de acceso público</strong> y organizarlas
            para divulgarlas. Ese contenido puede incluir datos personales de
            terceros que aparecen en las noticias (por ejemplo, autoridades,
            dirigentes y personas citadas): sus nombres, declaraciones y el texto
            de los artículos. Te informamos que esta parte de los datos proviene de fuentes de acceso
            público y la tratamos con deber de secreto. Desde el 1 de diciembre
            de 2026, esa información al titular será exigida por el artículo 14
            ter letra j) de la Ley 21.719 y el deber de secreto por su artículo
            14 bis; nos estamos adecuando a ambos.
          </p>
          <p className="mt-3">
            El universo de personas comprendido abarca: suscriptores del boletín y
            de alertas, miembros de comunidades, personal administrativo del medio,
            quienes envían feedback, y personas mencionadas en las noticias de
            fuentes públicas que cubrimos.
          </p>

          {/* 4. Finalidades y base de licitud */}
          <h2 className="section-heading mt-10">Finalidades y base de licitud</h2>
          <p className="mt-2">
            Para cada finalidad indicamos la base que la ampara bajo la ley
            vigente y, cuando difiere, aquella en que se apoyará una vez que rija
            la Ley 21.719.
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Enviarte el boletín o las alertas que solicitaste — tu <strong>consentimiento</strong>, que puedes retirar cuando quieras. Es la misma base en ambos regímenes.</li>
            <li>Operar y asegurar el sitio (sesiones de miembros y administración) — el tratamiento es <strong>necesario para prestarte el servicio que tú mismo solicitaste</strong> al iniciar sesión, y se limita a eso. Desde el 1 de diciembre de 2026 se apoyará además en el <strong>interés legítimo</strong> en la seguridad de la información y la prevención de abuso.</li>
            <li>Medir audiencia de forma agregada — <strong>no tratamos datos personales para esto</strong>: no almacenamos tu IP ni tu navegador, y el identificador diario no es reversible ni permite seguirte entre días. Al no haber dato que permita identificarte, no se requiere una base de licitud.</li>
            <li>Rastrear, organizar y divulgar noticias de pueblos indígenas publicadas por medios de acceso público — el <strong>artículo 9° de la Ley 19.628</strong>, que exceptúa a los datos provenientes de fuentes accesibles al público de la limitación de finalidad, en cumplimiento de nuestra misión sin fines de lucro, informativa y educativa. Desde el 1 de diciembre de 2026 se sumará el <strong>interés legítimo</strong> en informar sobre asuntos indígenas de interés público.</li>
            <li>Cumplir obligaciones legales — <strong>obligación legal</strong>. Es la misma base en ambos regímenes.</li>
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
            No requerimos datos personales sensibles (salud, origen étnico,
            creencias, orientación sexual, datos biométricos o genéticos) para leer
            el Sitio ni para suscribirte al boletín o a las alertas. Como cubrimos
            asuntos de pueblos indígenas, el contenido editorial proveniente de medios públicos
            puede, en ciertos casos, revelar el <strong>origen étnico</strong> de
            personas identificables. Cuando ello ocurre respecto de declaraciones o
            información que la propia persona o la fuente hicieron{" "}
            <strong>manifiestamente públicas</strong>, el tratamiento se limita a los
            fines informativos en que fueron publicadas. Desde el 1 de diciembre
            de 2026 ese supuesto queda expresamente recogido en el artículo 16
            letra a) de la Ley 21.719. Aplicamos minimización: evitamos
            exponer atributos sensibles de personas privadas más allá de lo que la
            noticia de interés público requiere, y atendemos solicitudes de
            rectificación o supresión.
          </p>
          <p className="mt-3">
            Además, si decides unirte a una comunidad de tipo <em>pueblo</em>, esa
            membresía puede revelar tu propio <strong>origen étnico</strong>. Solo
            tratamos ese dato con tu <strong>consentimiento expreso</strong>, que te
            solicitamos de forma específica al unirte y que puedes retirar en cualquier
            momento abandonando la comunidad. Su base de licitud es el consentimiento
            del titular, que hoy admite el artículo 10 de la Ley 19.628 y que
            desde el 1 de diciembre de 2026 recogerá el artículo 16 de la Ley
            21.719.
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
                  <td className="align-top py-2 pr-4">Chile (Región Chile Central)</td>
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
                <tr>
                  <td className="align-top py-2 pr-4">Diffbot</td>
                  <td className="align-top py-2 pr-4">Extracción del texto de noticias de fuentes de acceso público</td>
                  <td className="align-top py-2 pr-4">EE.&nbsp;UU.</td>
                  <td className="align-top py-2">Texto de los artículos de fuentes públicas, que puede incluir nombres, cargos y citas de terceros mencionados en la noticia (sin datos de lectores)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 7. Transferencias */}
          <h2 className="section-heading mt-10">Transferencias internacionales</h2>
          <p>
            Nuestra base de datos y el hospedaje principal permanecen en{" "}
            <strong>Chile</strong> (Microsoft Azure, Región Chile Central). Solo
            algunos servicios auxiliares operan fuera de Chile, según la tabla
            anterior: en <strong>EE.&nbsp;UU.</strong> los servicios de IA de
            Azure OpenAI, Cloudflare (imágenes) y Diffbot (extracción); y en la{" "}
            <strong>Unión Europea</strong> Brevo y la generación de imágenes en
            Suecia. Para los destinos respecto de los cuales no exista una
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
            <li>Métricas de audiencia: el registro diario de visitantes (país, categoría de dispositivo e identificador diario no reversible) se conserva hasta <strong>12 meses</strong> y luego se suprime automáticamente, para poder comparar la audiencia año contra año. El conteo de páginas vistas se conserva como estadística histórica: es un dato agregado, sin identificación de personas.</li>
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
            Acusaremos recibo y <strong>nos pronunciaremos sobre tu solicitud
            dentro de dos días hábiles</strong>, que es el plazo que hoy fija el
            artículo 16 de la Ley 19.628; si no lo hiciéramos, puedes recurrir al
            juez de letras en lo civil de nuestro domicilio. Desde el 1 de
            diciembre de 2026, cuando rija la Ley 21.719, el plazo de respuesta
            pasará a ser de <strong>30 días corridos</strong>, prorrogable por una
            sola vez hasta por 30 días adicionales (artículo 11). El ejercicio de
            los derechos de rectificación, supresión y oposición es{" "}
            <strong>siempre gratuito</strong>; el acceso es gratuito al menos una
            vez por trimestre.
          </p>
          <p className="mt-3">
            Si eres miembro con sesión iniciada, puedes además{" "}
            <strong>descargar todos tus datos</strong> y <strong>eliminar tu cuenta</strong>{" "}
            (con todos tus datos asociados) directamente desde tu{" "}
            <Link to="/perfil" className="text-brand-800 hover:text-brand-700">perfil</Link>.
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
            menores se regirá por las condiciones reforzadas del artículo 16 quáter
            de la Ley 21.719 desde su entrada en vigencia. Si crees que un menor nos entregó datos sin la
            debida autorización, escríbenos y los suprimiremos.
          </p>

          {/* 11. Seguridad */}
          <h2 className="section-heading mt-10">Seguridad</h2>
          <p>
            Aplicamos medidas técnicas y organizativas razonables: cifrado en
            tránsito, contraseñas con hashing (bcrypt), control de acceso,
            rotación de tokens y registro de actividad. Ante un incidente que
            afecte datos personales, notificaremos sin dilaciones indebidas,
            conforme al estándar que la Ley 21.719 exigirá desde el 1 de
            diciembre de 2026.
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
