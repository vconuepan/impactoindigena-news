# Vulneraciones de seguridad: procedimiento y registro

> Procedimiento del responsable (Fundación KM) para el deber del **art. 14 sexies** de la
> Ley 19.628 en el texto que le da el artículo primero de la Ley 21.719 (Diario Oficial
> N° 44.023, 13-dic-2024), que **rige desde el 1-dic-2026** (art. primero transitorio: el
> primer día del mes vigésimo cuarto posterior a la publicación). Se aplica desde ya como
> práctica. No es asesoría legal: lo revisa el abogado junto con la consulta de octubre.

## Lo que la ley exige, textual y sin agregados

| Deber | Fuente | Qué dice |
|---|---|---|
| Reportar a la Agencia | art. 14 sexies inc. 1° | «por los medios más expeditos posibles y sin dilaciones indebidas», las vulneraciones que ocasionen «la destrucción, filtración, pérdida o alteración accidental o ilícita de los datos personales que trate o la comunicación o acceso no autorizados a dichos datos, cuando exista un riesgo razonable para los derechos y libertades de los titulares» |
| Registrar | art. 14 sexies inc. 2° | registrar **estas comunicaciones**, describiendo la naturaleza de las vulneraciones, sus efectos, las categorías de datos, el número aproximado de titulares afectados y las medidas adoptadas para gestionarlas y precaver incidentes futuros |
| Avisar a cada titular | art. 14 sexies inc. 3° | cuando la vulneración se refiera a **datos sensibles**, datos de **niños y niñas menores de catorce años** o datos de obligaciones económicas, financieras, bancarias o comerciales: en lenguaje claro y sencillo, singularizando los datos afectados, las posibles consecuencias y las medidas adoptadas; a cada titular, y si no es posible, con un aviso en un medio de comunicación social masivo y de alcance nacional |
| El encargado avisa al responsable | art. 15 bis inc. 4° | «Tratándose de una vulneración a las medidas de seguridad, el tercero o mandatario deberá reportar este hecho al responsable» |
| Probar las medidas | art. 14 quinquies inc. final | ante un incidente, corresponde al responsable acreditar la existencia y el funcionamiento de sus medidas de seguridad |
| Sanción | arts. 34 ter k) y 34 quáter f), art. 35 | omitir las comunicaciones o los registros es **grave** (multa hasta 10.000 UTM); omitirlas **en forma deliberada** es **gravísima** (hasta 20.000 UTM) |

**Lo que la ley no dice, y por eso este documento tampoco afirma:** no fija un plazo en
horas (las 72 horas son del RGPD europeo, no de Chile) ni exige «riesgo alto»: el umbral
para la Agencia es **riesgo razonable**, y el aviso a titulares depende del **tipo de dato**,
no de la gravedad. La Agencia fijará estándares diferenciados por instrucción general
(art. 14 septies); cuando la dicte, este documento se ajusta a ella.

**Registramos todo incidente, se reporte o no.** La ley obliga a registrar las
comunicaciones; registrar también los que se decidió no reportar, con el motivo, es lo que
permite acreditar las medidas (art. 14 quinquies inc. final).

## Qué datos personales trata Voces, y cuáles cambian la obligación

Fuente: Política de Privacidad v3.4 (`client/src/pages/PrivacyPage.tsx`) y
`server/prisma/schema.prisma`.

| Dónde | Qué | Si se vulnera |
|---|---|---|
| Base de producción (Azure PostgreSQL, Chile Central) | `users`, `pending_subscriptions`, `alert_subscriptions`, `magic_links`, `refresh_tokens`, `feedback`, `digest_exclusions`, `audit_log` | Correos de lectores: reportar a la Agencia si hay riesgo razonable |
| La misma base | `community_members` de comunidades de tipo **pueblo** | **Dato sensible** (origen étnico, art. 2° g): reportar a la Agencia **y avisar a cada titular** |
| Brevo (UE) | correo y nombre de suscriptores, métricas, contenido de cada correo (nombra la comunidad pueblo) | Igual que arriba; Brevo debe avisarnos (art. 15 bis) |
| Contenido editorial (base y sitio) | nombres, cargos, citas y, cuando la fuente lo dice, el pueblo de personas mencionadas en noticias públicas | Una **alteración** maliciosa (atribuir a alguien lo que no dijo) es vulneración de integridad aunque el dato original fuera público |
| Registros del servidor (14 días) | peticiones; los correos van enmascarados (`redactarCorreos`, `lib/logger.ts`) | Bajo riesgo; se evalúa caso a caso |

No tratamos datos de obligaciones económicas o financieras (no hay pagos) ni recogemos a
sabiendas datos de menores. Si eso cambia (por ejemplo, una cuenta de donaciones con datos
de donantes), esta tabla se actualiza.

**Credenciales que valen como dato:** `DATABASE_URL` en `server/.env` del equipo del
director apunta a producción. Un equipo perdido o robado con esa sesión abierta es un
incidente aunque nadie haya entrado todavía: se contiene rotando la clave.

## Por dónde llega un aviso

- `SECURITY.md` (reportes de terceros, correo del responsable).
- Avisos de los encargados: Microsoft Azure, Brevo, Cloudflare, GitHub. **Pendiente
  verificar** a qué correo llegan los avisos de seguridad de cada cuenta (C-item en la lista
  de pendientes): si no llegan a una persona, el deber del art. 15 bis no sirve de nada.
- Lo que se ve en operación: errores en el log (`level >= 50`), reglas de firewall que nadie
  creó, secretos expuestos en el repo público, accesos raros en `audit_log`.

## Procedimiento

Los plazos de cada paso son **metas internas**, no plazos legales.

**Roles.** Coordina el representante legal del responsable. Hoy él mismo es el único con
acceso de escritura a Azure, a la base y a Brevo, así que también ejecuta la contención. Una
sesión del agente técnico puede preparar en solo lectura la evidencia (`az webapp log
download`, `git log`, lista de reglas del firewall) y los borradores, pero **no escribe en
producción ni rota credenciales**.

### 1 · Detectar y abrir el caso (de inmediato)
Anotar en el registro: fecha y hora de detección, quién detectó, por qué vía, y qué se sabe.
Desde aquí corre el «sin dilaciones indebidas».

### 2 · Contener y preservar (primeras horas)
**Primero se preserva, después se cambia.** Los registros del servidor se borran a los 14 días
y la rotación de credenciales cambia lo que se puede reconstruir.

```bash
# evidencia, solo lectura, al scratchpad o a una carpeta privada (no al repo: es público)
az webapp log download --name impactoindigena-news-api --resource-group impactoindigena-rg \
  --subscription 3c86db51-8e31-498f-a5c6-142db2efb9a9 --log-file <carpeta-privada>/logs-<fecha>.zip
az postgres flexible-server firewall-rule list --resource-group impactoindigena-rg \
  --name impactoindigena-db --subscription 3c86db51-8e31-498f-a5c6-142db2efb9a9 -o table
```

Contención según lo comprometido (la ejecuta el director):

| Si lo comprometido es | Se hace |
|---|---|
| Acceso a la base | Rotar la clave del servidor PostgreSQL y actualizar `DATABASE_URL` en el App Service; borrar reglas de firewall no reconocidas |
| Sesiones o el secreto JWT | Rotar `JWT_SECRET` (invalida todas las sesiones) y vaciar `refresh_tokens` |
| Brevo | Rotar la clave de API en Brevo y en el App Service |
| R2, redes sociales | Rotar las claves de R2 y los tokens de cada red |
| Un secreto en el repo público | Rotarlo **antes** de borrarlo del historial: en un repo público se da por copiado |
| El código desplegado | Volver al despliegue anterior y leer «Site is running with deployment version» en el docker log |

### 3 · Evaluar (meta: decidir dentro de 24 horas desde la detección)
Responder por escrito, en el registro:
1. ¿Hubo destrucción, filtración, pérdida, alteración o acceso no autorizado a datos personales? Si no, se registra como incidente sin vulneración y se cierra.
2. ¿Qué categorías de datos y cuántos titulares, aproximadamente? Si es incierto, el escenario más amplio que la evidencia no descarta.
3. ¿Hay **riesgo razonable** para los derechos y libertades de los titulares? Se razona en concreto: qué puede hacer un tercero con esos datos. Unos correos expuestos permiten suplantación y phishing; si son de miembros de una comunidad pueblo, además revelan origen étnico.
4. ¿Están entre los datos afectados **datos sensibles** (comunidades pueblo), de menores de 14 años o económicos? Si sí, se avisa también a cada titular (paso 5).

Si no se reporta, el motivo queda escrito en el registro.

### 4 · Reportar a la Agencia (apenas haya base razonable)
Por el medio más expedito disponible. Se reporta con lo que se sabe y se completa después:
esperar a tener todo no es «sin dilaciones». Contenido mínimo, el mismo que pide el registro:
naturaleza, efectos, categorías de datos, número aproximado de titulares, medidas adoptadas
y previstas, y un contacto.

**Canal: por confirmar.** Al 6-nov-2026 no se verificó un canal publicado por la Agencia.
Antes del 1-dic hay que confirmarlo y escribirlo aquí (C-item en la lista de pendientes).

### 5 · Avisar a los titulares (si el paso 3.4 dio sí)
A cada titular, por correo, en lenguaje claro y sencillo: qué datos suyos, qué puede pasar y
qué hicimos. Si no es posible llegar a cada uno, aviso en un medio de comunicación social
masivo y de alcance nacional. Borrador base:

> El [fecha] detectamos que [qué pasó, en una frase]. Entre los datos afectados está [dato
> suyo, por ejemplo: su correo y su membresía en la comunidad X]. Esto puede [consecuencia
> posible, por ejemplo: permitir que alguien le escriba haciéndose pasar por nosotros, o que
> se conozca su pertenencia a la comunidad]. Ya [medidas]. Si quiere saber más o ejercer sus
> derechos, escríbanos a [correo de privacidad].

El aviso no pide datos ni contraseñas, y no lleva enlaces de acceso: un aviso de incidente
es justo lo que un tercero imitaría.

### 6 · Cerrar y corregir
Causa raíz, medida para que no se repita, test o candado si es código, y actualización de
este documento y de la Política si algo de lo que promete dejó de ser cierto.

## El registro

**El registro con datos reales no vive en este repositorio**, que es público. Lo lleva el
responsable en un lugar privado, con acceso restringido e historial de cambios (dónde, lo
decide el director: C-item en la lista de pendientes). Se escribe solo hacia adelante: una
entrada no se borra ni se reescribe; se corrige con otra entrada que la cite.

Campos de cada entrada (los cinco del inc. 2° del art. 14 sexies, más los que permiten
acreditar la diligencia):

| Campo | Fuente |
|---|---|
| N° correlativo · fecha y hora de detección · quién detectó y por qué vía | práctica |
| **Naturaleza de la vulneración** (qué pasó y cómo) | art. 14 sexies inc. 2° |
| **Efectos** | art. 14 sexies inc. 2° |
| **Categorías de datos** afectados | art. 14 sexies inc. 2° |
| **Número aproximado de titulares** | art. 14 sexies inc. 2° |
| **Medidas adoptadas** para gestionarla **y para precaver** incidentes futuros | art. 14 sexies inc. 2° |
| ¿Riesgo razonable? Sí/No, con el razonamiento | art. 14 sexies inc. 1° |
| ¿Datos sensibles, de menores de 14 o económicos? | art. 14 sexies inc. 3° |
| Fecha, medio y contenido de la comunicación a la Agencia, o motivo de no reportar | art. 14 sexies inc. 1° y 2° |
| Fecha y medio del aviso a titulares, o motivo de no avisar | art. 14 sexies inc. 3° |
| Encargado involucrado y fecha en que avisó | art. 15 bis |
| Evidencia preservada (dónde) · causa raíz · cierre | art. 14 quinquies inc. final |

## Archivos

| Archivo | Para qué |
|---|---|
| `SECURITY.md` | Canal público para reportar una vulnerabilidad |
| `client/src/pages/PrivacyPage.tsx` | Promesa pública: «notificaremos sin dilaciones indebidas» (Seguridad) |
| `server/src/lib/logger.ts` | Registros: retención de 14 días, correos enmascarados |
| `server/src/services/supresion.ts` | Borrado completo por correo, si un titular pide supresión tras un incidente |
| `.context/logging.md` | Dónde están los registros y cuánto duran |
