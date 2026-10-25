# Semana 08 — Modelo de datos y persistencia

## Objetivo

Conservar incidencias y operaciones pendientes durante interrupciones de conectividad, sin perder la identidad de los cambios ni sobrescribir modificaciones remotas incompatibles.

## Almacenamiento

CampusOps utiliza `expo-sqlite` con la base local `campusops.db`. El esquema actual tiene versión 2, registrada mediante `PRAGMA user_version`.

La sesión y sus credenciales mantienen el mecanismo de almacenamiento seguro de Semana 06; no se guardan tokens en las tablas de incidencias.

## Entidades y relaciones

### Incidencia

La tabla `incidents` contiene:

- `id TEXT PRIMARY KEY NOT NULL`: identificador de incidencia.
- `data TEXT NOT NULL`: representación JSON de la incidencia.

El JSON conserva los atributos del dominio, incluidos identificador, categoría, descripción, ubicación, estado, técnico asignado y versión cuando está disponible.

### Operación pendiente

La tabla `pending_operations` contiene:

- `operation_id TEXT PRIMARY KEY NOT NULL`: identidad estable de la operación.
- `incident_id TEXT NOT NULL`: incidencia afectada.
- `data TEXT NOT NULL`: representación JSON de la operación.
- `created_at TEXT NOT NULL DEFAULT ''`: columna añadida en versión 2.

Cada operación contiene `operationId`, `incidentId`, `actorId`, `baseVersion`, `action` y `payload`. La relación con la incidencia se establece mediante `incidentId`. El esquema actual no declara una clave foránea SQL.

`operationId` es único en la tabla. La inserción con `INSERT OR IGNORE` evita sustituir una operación existente con la misma identidad.

## Versiones y migraciones

- Versión 0: base sin esquema inicializado.
- Versión 1: tablas `incidents` y `pending_operations`.
- Versión 2: añade `created_at` a `pending_operations`.

`SqliteIncidentStore.open()` ejecuta la migración dentro de `withExclusiveTransactionAsync`. Si ocurre una excepción, la apertura falla y se cierra la conexión. La intención es que la transacción revierta el cambio incompleto.

La prueba `node scripts/week-08/test-migration.cjs` comprueba con SQLite nativo un esquema equivalente: estado inicial v1, falla inyectada, rollback, reapertura, recuperación v1 a v2 e idempotencia de la migración. Esta prueba todavía no sustituye una comprobación directa de la migración de `expo-sqlite` en la aplicación.

## Conservación de operaciones

`enqueue()` persiste el JSON antes de intentar sincronizar. `getPendingOperations()` recupera las operaciones en orden de inserción. `removeConfirmedOperation()` elimina una operación únicamente después de recibir una confirmación exitosa del transporte.

La operación de inicio offline incorpora una copia de la incidencia base en `payload.baseIncident`, necesaria para comparar la intención local con el estado remoto.

## Límites pendientes de comprobación

Todavía debe comprobarse en la aplicación la recuperación de la cola después de cerrar y reabrir el proceso, así como el almacenamiento y recuperación de notas o referencias de fotografías pendientes. Una referencia de fotografía no equivale a una imagen subida al servidor.
