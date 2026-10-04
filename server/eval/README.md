# Eval del gate de sensibilidad

`gate-golden-set.jsonl` es un conjunto de casos etiquetados a mano para verificar
el gate editorial (`server/src/lib/gate.ts`, protocolo editorial seccion 7). El
runner es un test de vitest (`server/src/lib/gate.golden.test.ts`), asi que
**corre en CI en cada push** (job *Server tests*).

Portado del fork `otras-voces` el 2026-10-03 (decision D1 del director: del
fork se rescata solo el gate). El gate aun no esta cableado al pipeline.

## Formato (una linea JSON por caso)

```json
{"id": "s01", "label": "sensible", "category": "atentado", "narrativeFrame": "confrontacion", "text": "..."}
```

- `label`: `sensible` (debe ir a `held_for_review`) o `neutral` (debe `auto_publish`).
- `narrativeFrame`: el encuadre que asignaria el clasificador (`confrontacion` /
  `resiliencia` / `protagonismo` / `alianza`, el enum `NarrativeFrame` del
  esquema), o `null` si no aplica.
- `category`: solo documental (desalojo, atentado, deporte, cultura, etc.).

## Reglas del eval

1. **Cero falsos negativos (dura):** ningun caso `sensible` puede salir a
   `auto_publish`. Es el fallo que este eval existe para atrapar. Si falla, el
   build cae y nombra los casos.
2. **Falsos positivos (blanda):** un `neutral` retenido es aceptable por la regla
   de oro (seccion 7.3, sesgo al falso positivo). Para el set curado se mantiene
   en cero; al agregar noticias reales (mas ruidosas), relajar esta prueba a un
   umbral de tasa.

## Estado

48 casos: 18 del set inicial curado del lado chileno (10 sensibles / 8 neutrales),
24 del Puelmapu agregados el 2026-10-04 (12 sensibles `ps*` / 12 neutrales `pn*`) y
6 de la refutacion adversarial del mismo dia (`ps13`-`ps16`, `pn13`-`pn14`),
parafrasis de titulares reales de prensa argentina sin nombres de personas
privadas. Los neutrales del Puelmapu prueban a proposito terminos de la Lista B
sin corroboracion (Villa Mascardi como lugar turistico, el INAI firmando
convenios, la Gendarmeria en controles de transito, el «Festival de la
Resistencia Mapuche»): deben pasar.

## Como se midio el vocabulario del Puelmapu

Corpus: 888 titulares unicos de Google News con pais Argentina (12 busquedas),
las 387 notas publicadas de la vertical Mapuche y 400 notas globales recientes.
Cada termino se midio con una replica exacta del cotejo del gate (hits y
palabras distintas que lo disparan). Reglas: un termino entra solo con
evidencia en algun corpus; las siglas se cotejan como palabra completa; la
identidad (lof, nacion mapuche, wiñoy tripantu, trawün, lengua, ceremonia)
queda fuera; a la Lista A va lo que es conflicto, proceso penal, violencia o
encuadre que deslegitima; a la B, organos del Estado, justicia, actores,
lugares y encuadres que necesitan corroboracion. Resultado tras la
refutacion adversarial (tres lentes independientes, 2026-10-04): la Lista A
retiene 480 de los 888 titulares argentinos (antes de todo esto, 101),
119 de las 387 notas publicadas de la vertical Mapuche (antes 69) y
65 de 400 globales (antes 46).

## Lo que la refutacion corrigio (2026-10-04)

- **NNA bajan a la Lista B** (`nino`, `nina`, `adolescente`; `menor` y `nna`
  siguen en A): el protocolo 7.3.3 acota la retencion a NNA en contexto de
  violencia o conflicto, y «niños» solo retenia 12 notas de lengua, educacion y
  salud de 18. Se agrego `adopciones ilegales` a la A para no perder el unico
  caso real que dependia de «niños».
- **`violacion` baja a la B**: en 17 de 17 notas publicadas significaba
  «violacion de derechos»; la violencia sexual la cubren `violencia sexual`,
  `violacion sexual` y `violador`.
- **Inflexiones que el prefijo dejaba pasar**: `detienen`, `condeno`, `allano`,
  `presas`, `atacad`/`atacar`/`ataco`/`atacan`, `incendian`, y raices de
  genero y numero (`formalizad`, `encapuchad`, `homicid`, `balead`, `profug`,
  `detenid`, `imput`, `acusa`).
- **Suben de B a A**, por doctrina y medicion: `criminaliza`, `persecucion`,
  `delincuen` (7.3.7), `ppm` (misma categoria que «presos politicos», 7.3.5),
  `violent`, `violencia rural` (misma vara que `violencia policial`, 3.1).
- **Nuevos en A**: etapas judiciales (`veredicto`, `sentencia`, `turbacion`),
  despliegue militar (`militariz`, `estado de excepcion`), hostilidad
  institucional (`arremet`, `atropell`, `desplazad`), fallecimientos y violencia
  de genero (`fallecio`, `fallecimiento`, `murio`, `machismo`, `machista`,
  `violencia de genero`), encuadres que atribuyen (`grupos mapuches`,
  `violencia mapuche`, `banderazo`...) y los casos publicos del Gulumapu
  (`grollmus`, `llaitul`, `nirripil`, `caso lautaro`, `catrillanca`,
  `luchsinger`, `macarena valdes`, `matias catrileo`).
- **Nuevos en B**: `conflicto`, `fallo`, `litigio`, `amparo`, `posesion`,
  `disputa`, `tension`, `terrateniente`, `latifund`, `legitima defensa`,
  `prefectura`, `ensan`, `encaden`. Regla: el umbral de evidencia en corpus rige
  para la A, donde el ruido retiene; en la B un termino solo corrobora.

## Ruido conocido de la Lista A (linea base para la proxima medicion)

Medido sobre 787 notas publicadas: `ataque` dispara en 2 notas por «ataques
politicos»; `usurp` en 2 por «usurpacion de cargos electorales» y la reseña de
un libro; y siete terminos con exactamente un falso positivo cada uno
(`detencion`: «centro de detencion» en una nota cultural; `detenid`: «no ha
detenido la extraccion»; `acusa`: una obra de teatro; `sabotaje`, `represion`,
`muerte`, `huelga de hambre`: contexto historico). Es el precio del sesgo al
falso positivo (7.3) y no se corrige con la lista.

## Dos cambios de regla que esperan decision de la direccion

1. **Dos aciertos de la Lista B de familias distintas corroboran** (lugar del
   conflicto + fuerza u operativo; justicia + territorio). Medido: retendria
   ademas 34 titulares argentinos (26 pertinentes), 16 notas de la vertical y 4
   globales. Hoy el unico corroborador de la B es la A o el encuadre del LLM.
2. **`grupo mapuche` en singular** como encuadre que atribuye: retendria 10
   titulares argentinos y una nota cultural («el grupo mapuche Los Peñis del
   Sur», musical). Quedo fuera por esa colision; entra si la direccion prefiere
   el falso positivo. El corpus
y la linea base viven en `otras-voces/estrategia/datos/puelmapu-2026-10-03/`.

**Pendientes:** ampliar a 30-50 noticias reales etiquetadas a mano (curacion
humana) y revisar el ruido de tres terminos chilenos de la Lista A que la
medicion dejo a la vista: «violacion» dispara por «violaciones de derechos»,
«abuso» por «abusos graves», «nino» por «niños indigenas» en notas de educacion.
Correr y ampliar en cada cambio del prompt de `NarrativeFrame` o de las listas.
