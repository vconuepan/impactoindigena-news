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

Set **inicial curado** de 18 casos derivados de las categorias del protocolo
(10 sensibles / 8 neutrales), todos del lado chileno. **Pendientes:** (a) ampliar
a 30-50 **noticias reales** etiquetadas a mano (curacion humana); (b) cubrir el
Puelmapu: el ambito de Voces Mapuche es el Wallmapu entero, Chile y Argentina,
y las listas de hoy solo conocen el vocabulario del conflicto en Chile. Correr y
ampliar en cada cambio del prompt de `NarrativeFrame` o de las listas del gate.
