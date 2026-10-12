# Eval del gate de sensibilidad

`gate-golden-set.jsonl` es un conjunto de casos etiquetados a mano para verificar
el gate editorial (`server/src/lib/gate.ts`, protocolo editorial seccion 7). El
runner es un test de vitest (`server/src/lib/gate.golden.test.ts`), asi que
**corre en CI en cada push** (job *Server tests*).

Portado del fork `otras-voces` el 2026-10-03 (decision D1 del director: del
fork se rescata solo el gate). Desde el 2026-10-04 lo usa la retencion por
vertical (D4, `server/src/services/communityReview.ts`); la casa grande sigue
publicando sin el.

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

52 casos: 18 del set inicial curado del lado chileno (10 sensibles / 8 neutrales),
24 del Puelmapu agregados el 2026-10-04 (12 sensibles `ps*` / 12 neutrales `pn*`),
4 de la regla B+B del 2026-10-11 (`bb01`-`bb02` sensibles, `bn01`-`bn02`
neutrales: dos terminos de contexto no se corroboran, una sola familia tampoco) y
6 de la refutacion adversarial del 2026-10-04 (`ps13`-`ps16`, `pn13`-`pn14`),
parafrasis de titulares reales de prensa argentina sin nombres de personas
privadas. Los neutrales del Puelmapu prueban a proposito terminos de la Lista B
sin corroboracion (Villa Mascardi como lugar turistico, el INAI firmando
convenios, la Gendarmeria en controles de transito, el «Festival de la
Resistencia Mapuche»): deben pasar.

## Como se midio el vocabulario del Puelmapu

Corpus: 888 titulares unicos de Google News con pais Argentina (12 busquedas),
las 387 notas publicadas de la vertical Mapuche y 400 notas globales recientes.
Cada termino se midio con una replica exacta del cotejo del gate (hits y
palabras distintas que lo disparan). **Campos medidos:** solo el titulo en los
888 titulares argentinos; titulo + resumen en las 387 y las 400 notas
publicadas. Ninguna cifra de este archivo incluye el cuerpo de la fuente
(`sourceContent`): si el gate se cablea con el texto completo, retendra mas que
lo que dice aqui. Ver `.plans/2026-10-04_retencion-por-vertical.md`, seccion 5. Reglas: un termino entra solo con
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

## B+B: dos familias de la Lista B se corroboran (decidido el 2026-10-11)

**Decision del director:** «sí» a que dos señales B de familias distintas
corroboren, con puntaje 1 en la cola. La propuesta del 2026-10-04 daba dos
ejemplos (lugar del conflicto + fuerza u operativo; justicia + territorio) y
unas cifras (34 titulares argentinos, 16 notas de la vertical, 4 globales), pero
no dejo escritas las familias: no se pudieron recuperar, y se definieron y
midieron de nuevo.

**Las familias** (`FAMILIAS_B` en `gate.ts`): `fuerza` (operativos, protocolo
7.3.2), `justicia` (Fiscalia, tribunales y proceso penal, 7.3.8) y `contexto`
(todo lo demas: lugar, partes, organismos, encuadre, hechos). Dos de contexto
no se corroboran.

**Como se eligieron, medido el 2026-10-11.** Corpus: 433 notas de Voces Mapuche,
121 de Voces Araucania y 400 globales (API publica, titulo + etiqueta +
resumen, el texto corto que evalua el gate) y los 888 titulares argentinos.
Matcher: `evaluateGate` real, sin encuadre (la API publica no lo expone: para
las verticales las cifras son un techo, porque parte de esas notas ya la retiene
el encuadre «confrontacion»). Con nueve familias finas y cualquier par, B+B
sumaba 98 textos sin termino de la Lista A. Cada uno lo juzgaron contra el
protocolo (7.2 y 7.3) dos jueces independientes de lentes opuestas («aplica el
protocolo» y «defiende al lector de una cola inutil»), con desempate en los 16
desacuerdos: 57 pertinentes, 41 ruido.

| Regla | Retiene | Pertinentes | Ruido |
|---|---|---|---|
| Cualquier par de nueve familias | 98 | 57 (58 %) | 41 |
| Dos familias de un «nucleo» (territorio, fuerza, justicia, hecho, organizacion) | 27 | 20 (74 %) | 7 |
| Solo los dos pares de la propuesta (territorio + fuerza, justicia + territorio) | 16 | 15 (94 %) | 1 |
| **Fuerza o justicia + otra familia (la elegida)** | **34** | **31 (91 %)** | **3** |
| La elegida + encuadre con territorio | 61 | 45 (74 %) | 16 |

Por par: justicia con territorio 10 de 11 pertinentes, justicia con encuadre 8
de 9, fuerza con territorio 7 de 7, fuerza con justicia 4 de 4. El ruido estaba
en «contexto + contexto»: encuadre con territorio, 13 de 30 ruido («conflicto» y
«territorio ancestral» en notas culturales); organismos con territorio, 7 de 11
ruido (CONADI y «restitucion» en notas presupuestarias); e «incendio forestal». Los
tres falsos positivos de la elegida: una advertencia politica que menciona
«tribunales internacionales», un debate constitucional en Quebec con un fallo de
la Corte Suprema, y una columna mexicana donde «fallo» es el verbo fallar.

Lo que la elegida suma, sin encuadre y sin aprendizaje: 8 notas de Voces
Mapuche, 2 de Araucania, 6 globales y 21 titulares argentinos. Comprobado contra
el gate anterior en 11.052 evaluaciones (cada texto con y sin encuadre, con y
sin aprendizaje): B+B no quita ninguna retencion ni ninguna razon; solo agrega.

**Lo que deja fuera a sabiendas** (26 de los 57 pertinentes): sobre todo
categorias 7.3.12 y 7.3.13 (cultura en territorio en conflicto, personas
identificables) y ocho titulares argentinos sobre Villa Mascardi, cinco de
ellos con «conflicto». Ampliar a «encuadre + territorio» los cubriria a cambio de 13
falsos positivos mas por cada 14 aciertos; si se quiere, es un cambio de una
linea y se mide igual.

## Un cambio de regla que espera decision de la direccion

1. **`grupo mapuche` en singular** como encuadre que atribuye: retendria 10
   titulares argentinos y una nota cultural («el grupo mapuche Los Peñis del
   Sur», musical). Quedo fuera por esa colision; entra si la direccion prefiere
   el falso positivo. **Remedido el 2026-10-11 con el matcher real y las listas
   vigentes:** de los 10 titulares argentinos, 9 ya los retiene la Lista A por
   otro termino (`ram`, `usurp`, `acusa`, `delincuen`, `desaloj`...); el unico
   que aportaria es «Grupo mapuche declara "la guerra" a Argentina y Chile». En
   las verticales (430 Mapuche, 121 Araucania, texto corto) aparece en 3 y 2
   notas: las del conflicto ya estan retenidas por la A y la unica que sumaria es
   la cultural de Los Peñis del Sur, en las dos. Aporte neto: un acierto en 888
   contra un falso positivo cultural por vertical. El corpus
y la linea base viven en `otras-voces/estrategia/datos/puelmapu-2026-10-03/`.

**Pendientes:** ampliar a 30-50 noticias reales etiquetadas a mano (curacion
humana) y revisar el ruido de tres terminos chilenos de la Lista A que la
medicion dejo a la vista: «violacion» dispara por «violaciones de derechos»,
«abuso» por «abusos graves», «nino» por «niños indigenas» en notas de educacion.
Correr y ampliar en cada cambio del prompt de `NarrativeFrame` o de las listas.
