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

42 casos: 18 del set inicial curado del lado chileno (10 sensibles / 8 neutrales)
y 24 del Puelmapu agregados el 2026-10-04 (12 sensibles `ps*` / 12 neutrales `pn*`),
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
lugares y encuadres que necesitan corroboracion. Resultado: la Lista A pasa de
retener 101 a 426 de los 888 titulares argentinos, y de 69 a 115 de las 387
notas de la vertical (las 46 nuevas son desalojos, juicios y causas). El corpus
y la linea base viven en `otras-voces/estrategia/datos/puelmapu-2026-10-03/`.

**Pendientes:** ampliar a 30-50 noticias reales etiquetadas a mano (curacion
humana) y revisar el ruido de tres terminos chilenos de la Lista A que la
medicion dejo a la vista: «violacion» dispara por «violaciones de derechos»,
«abuso» por «abusos graves», «nino» por «niños indigenas» en notas de educacion.
Correr y ampliar en cada cambio del prompt de `NarrativeFrame` o de las listas.
