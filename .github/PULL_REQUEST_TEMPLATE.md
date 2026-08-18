## Qué cambia y por qué

<!-- Describe el problema que resuelve, no solo lo que tocaste. Si hay un issue
     asociado, enlázalo con "Closes #123". -->

## Cómo se verificó

<!-- Marca lo que corriste de verdad. Un check sin correr es peor que sin marcar. -->

- [ ] `npm run test --prefix server`
- [ ] `npm run test --prefix client -- --run`
- [ ] Verificado en el navegador (di en qué ruta)
- [ ] No aplica — explica por qué

## Alcance

- [ ] Cambia comportamiento de dominio (reglas, transiciones, entidades nuevas)
      → **actualicé el `.specs/*.allium` correspondiente**
- [ ] Cambia detalles de implementación de un subsistema
      → **actualicé el `.context/*.md` correspondiente**
- [ ] Agrega o cambia variables de entorno
      → **las documenté en `server/.env.sample`**
- [ ] Requiere una migración de base de datos
      → **el SQL va aparte y se aplica a mano antes del deploy** (ver `.context/database-migrations.md`)
- [ ] Toca endpoints públicos de la API
      → **actualicé el esquema Zod y `server/src/lib/openapi.ts`**

## Notas para quien revisa

<!-- Lo que no se ve en el diff: decisiones que dudaste, algo que dejaste fuera a
     propósito, o una parte que conviene mirar con más cuidado. -->
