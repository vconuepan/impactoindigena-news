# Política de seguridad

Impacto Indígena es una plataforma editorial que publica en abierto y trata datos
personales de suscriptores y de miembros registrados. Nos importa que quien
encuentre una falla tenga una vía clara para contarla.

## Cómo reportar una vulnerabilidad

**Escribe a venancio.conuepan@empresasindigenas.org con el asunto `[SEGURIDAD]`.**

**No abras un issue público** para reportar una vulnerabilidad. Los issues son
visibles para cualquiera, y publicar una falla explotable antes de que exista
arreglo pone en riesgo a las personas cuyos datos custodiamos.

Incluye lo que tengas. Sirve todo esto, y sirve aunque falte parte:

- Qué falla y qué se puede lograr con ella
- Pasos para reproducirla
- Versión, rama o commit donde la viste
- Si depende de una configuración concreta
- Si ya está publicada en algún otro lado

Si prefieres cifrar el reporte, dilo en un primer correo sin detalles técnicos y
coordinamos la vía.

## Qué puedes esperar

Este proyecto lo mantiene **una sola persona**, y conviene decirlo antes que
prometer plazos que no se cumplirían:

| | |
|---|---|
| **Acuse de recibo** | Dentro de los 5 días hábiles |
| **Evaluación inicial** | Dentro de los 15 días hábiles: si es reproducible y qué severidad tiene |
| **Arreglo** | Sin plazo comprometido. Depende de la severidad y de la disponibilidad |
| **Aviso de cierre** | Te contamos qué se hizo, aunque la conclusión sea que no era una falla |

Si no recibes acuse en 5 días hábiles, insiste: probablemente el correo se perdió.

**No tenemos programa de recompensas.** No hay pago por reportes. Si quieres
crédito público por el hallazgo, dilo y lo damos con gusto en el commit que lo
arregla; si prefieres el anonimato, también.

Te pedimos que **no** hagas público el detalle hasta que exista arreglo
desplegado, o hasta que hayan pasado 90 días desde tu reporte, lo que ocurra
primero. Ese plazo corre incluso si no hemos respondido.

## Qué versiones se atienden

| Versión | Estado |
|---|---|
| `main` desplegada en impactoindigena.news | Se atiende |
| Cualquier fork o despliegue propio | No se atiende |

El proyecto no publica versiones etiquetadas: lo que corre en producción es la
punta de `main`. Si operas tu propio despliegue bajo la AGPL, la seguridad de esa
instancia es tuya, aunque igual agradecemos el reporte porque el arreglo
normalmente sirve a todos.

## Qué está fuera de alcance

No consideramos vulnerabilidades:

- Resultados de escáneres automáticos sin un impacto demostrado
- Ausencia de cabeceras que no aplican al caso, sin vector de ataque concreto
- Denegación de servicio por volumen bruto de peticiones
- Ingeniería social contra el equipo o los colaboradores
- Vulnerabilidades en servicios de terceros que usamos (Azure, Cloudflare,
  Brevo, las APIs de las redes sociales). Repórtalas a ellos
- El contenido de los artículos enlazados: son de sus medios de origen

Sí nos interesa, y mucho, cualquier cosa que permita: acceder a datos de
suscriptores o miembros, escalar privilegios a administrador, publicar o
despublicar contenido sin autorización, o hacer que la plataforma emita
peticiones a destinos que elija un tercero.

## Cómo probar sin causar daño

Si vas a investigar, hazlo contra un despliegue propio. Si tiene que ser contra
producción:

- No accedas a datos que no sean tuyos. Si tropiezas con datos de terceros,
  detente y cuéntanoslo
- No degrades el servicio ni corras pruebas de carga
- No modifiques ni borres contenido
- No uses ingeniería social ni ataques físicos

Un reporte de buena fe que respete esto no va a derivar en acciones legales de
nuestra parte.

## Qué hay implementado hoy

Esto no es una lista de garantías, sino el estado verificable del código, para
que no pierdas tiempo reportando lo que ya existe:

**Autenticación y sesiones**
- Contraseñas con bcrypt, 12 rondas
- Tokens de refresco con rotación y **detección de reutilización**: si un token
  ya rotado se vuelve a usar, se revoca la familia completa
- Cookies `httpOnly`, `secure` y `sameSite` en entornos con TLS
- Comparación en tiempo constante para claves de API y para el `state` de OAuth
- El tiempo de respuesta del login se iguala aunque el correo no exista

**Superficie HTTP**
- Cabeceras de seguridad vía Helmet, con Content-Security-Policy
- CORS diferenciado: abierto solo para lectura pública, restringido para
  autenticación, administración y suscripción
- Ocho limitadores de tasa distintos según el costo de la ruta
- Validación de entrada con Zod en los endpoints públicos
- Los detalles de error se ocultan en producción

**Datos**
- Consultas parametrizadas vía Prisma
- Jobs de retención que borran datos de autenticación, suscripciones y analítica
  vencidos, con plazos configurables
- Registro de auditoría para operaciones administrativas

**Cadena de suministro**
- `gitleaks` corre en cada pull request buscando secretos filtrados
- Las acciones de GitHub están ancladas por SHA, no por etiqueta móvil

**Tratamiento de contenido no confiable**
- El contenido de los artículos rastreados se sanea antes de entrar a los prompts
  del modelo. Un artículo es entrada no confiable, no una instrucción

## Datos personales

El tratamiento de datos personales se rige por la Ley 19.628 mientras esté
vigente, y por la Ley 21.719 desde el 1 de diciembre de 2026. El detalle está en
la [Política de Privacidad](https://impactoindigena.news/privacy) del sitio.

Si tu hallazgo expone datos personales, díselo explícitamente en el reporte: eso
cambia los plazos y las obligaciones de notificación.
