# Evidencia individual — DMI Semana 8

- **Nombre:** Josmar Olivera Perez
- **Matrícula:** 3522110243
- **Actividad:** Persistencia y sincronización de CampusOps
- **Aportación:** `course-tests/integration/week-08-validation-josmar.test.ts`

## Alcance

La prueba usa la función real `queueOfflineStart` y sustituye solamente sus dependencias externas: el repositorio de lectura de incidencias y el escritor de operaciones pendientes. J1 comprueba el rechazo cuando el repositorio devuelve `null`; J2, el rechazo cuando el actor no coincide con el técnico asignado; y J3, el rechazo de una versión ausente, de tipo incorrecto, negativa, fraccionaria o fuera del rango entero seguro. Cada rechazo comprueba el código de validación y que `enqueue` no fue invocado. Una prueba positiva comprueba que el caso válido sí produce una única operación con los campos del contrato existente.

La función recibe una identidad de operación estable y la versión base como entrada; el modelo actual `Incident` no contiene versión. La cola se inyecta mediante una interfaz de escritura y no se presenta como persistencia duradera. El adaptador de almacenamiento persistente, la recuperación tras reinicio, las migraciones y la sincronización completa siguen fuera de esta aportación individual.

## Verificaciones

- `npm ci`: completó usando el lockfile existente; instaló 971 paquetes. NPM informó 10 vulnerabilidades altas en el árbol instalado. No se ejecutó `npm audit fix` ni se cambiaron versiones declaradas.
- `npm test -- --no-watchman --ci --runInBand course-tests/integration/week-08-validation-josmar.test.ts`: pasó, 1 suite y 8 pruebas.
- `npm test -- --no-watchman --ci --runInBand course-tests/public/week-08.test.ts`: falló en sus 3 pruebas porque `resolveSync` y `deduplicateOperations` siguen llamando a `pending()` en `src/course-evaluation/index.ts`. Estas funciones generales no se modificaron.
- `npm test -- --no-watchman --ci --runInBand course-tests/security/session-manager.test.ts course-tests/security/session-machine.test.ts course-tests/security/session-backend.test.ts course-tests/public/week-06.test.ts`: pasó, 4 suites y 24 pruebas; se conservaron login, logout, autorización y renovación concurrente.
- `npm run typecheck`: pasó (`tsc --noEmit`, código 0).
- `npm run lint`: pasó (`eslint .`, código 0).
- Se ejecutó también una comprobación directa con Node y aserciones sobre J1, J2, cinco valores de versión inválidos y el encolado válido; terminó con código 0. No sustituye la ejecución de Jest, registrada por separado.

## Uso de IA

Se utilizó un asistente de IA para inspeccionar los contratos del proyecto y preparar la función mínima y las pruebas descritas. La implementación y sus resultados deben ser revisados por el estudiante; no se atribuyen ejecuciones no realizadas.

## Identificación de versión

No se incluye SHA de commit porque no se realizaron operaciones Git para crear uno.
