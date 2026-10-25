# Semana 08 — Política de sincronización y conflictos

## Principio

CampusOps conserva las operaciones locales hasta que el servidor confirma su aplicación. Una desconexión, timeout, rechazo o conflicto no autoriza eliminar una intención pendiente.

## Identidad e idempotencia

Cada operación contiene `operationId` estable. El transporte lo envía en el encabezado HTTP `Idempotency-Key` al endpoint de acciones de incidencias.

La función `deduplicateOperations` conserva la primera aparición de una identidad repetida sin modificar las entradas. El servidor comprueba la idempotencia y evita aplicar dos veces una misma operación válida.

La cola SQLite usa `operation_id` como clave primaria y `INSERT OR IGNORE`. Reintentar una operación pendiente conserva su identidad original.

## Autorización

Las operaciones de inicio requieren una sesión autenticada de técnico. Antes de encolar, CampusOps comprueba que la incidencia local esté asignada a ese técnico y se encuentre en estado `assigned`.

La comprobación local no reemplaza la autorización del backend. El servidor mantiene la autoridad sobre el rol, la asignación vigente y la versión de la incidencia.

## Sincronización

1. Recuperar operaciones persistidas.
2. Deduplicarlas por identidad.
3. Procesar las operaciones del actor autenticado.
4. Enviar acción, versión base y clave de idempotencia.
5. Retirar únicamente operaciones confirmadas.
6. Conservar las operaciones que produzcan errores, timeout o conflicto.

Las operaciones de otro actor no se envían durante la sincronización de la sesión actual.

## Conflictos de reasignación

Si un técnico inicia atención offline desde una versión base y coordinación reasigna la incidencia en el servidor, la operación local puede recibir HTTP 409.

CampusOps conserva la operación pendiente y consulta el estado remoto para diagnosticar el conflicto mediante `resolveSync`. El campo lógico `work` agrupa estado y técnico asignado. Una incompatibilidad en ese grupo se declara conflicto; no se impone la asignación local antigua sobre la remota.

La resolución requiere intervención o una decisión explícita posterior. El código actual detecta y conserva el conflicto, pero no implementa una interfaz completa para resolverlo manualmente.

## Cambios independientes

`resolveSync` calcula la combinación de cambios independientes y enumera campos incompatibles en orden. La prueba pública verifica esa función. La implementación actual no envía automáticamente al backend el resultado de una combinación calculada; por tanto, no se afirma que exista aplicación remota automática de merges.

## Reintentos y fallas

Una operación confirmada se retira de la cola. Ante un fallo de red o timeout permanece pendiente para un reintento posterior con el mismo `operationId`. Ante HTTP 409 también permanece pendiente y se registra como conflicto.

El flujo actual intenta sincronizar al ejecutar `start` y cuando se activa la sincronización asociada a la sesión del técnico. No se afirma que exista un monitor continuo de conectividad ni sincronización garantizada en segundo plano.

## Comprobaciones observadas

- `npm run backend:self-test`: contratos de roles, reasignación, idempotencia y respuesta perdida aprobados.
- `make public-test-week-08`: las tres pruebas Jest de Semana 08 aprobaron; el evaluador general todavía falla por archivos obligatorios ausentes.
- `node scripts/week-08/test-migration.cjs`: cinco comprobaciones SQLite aprobadas sobre el esquema equivalente.

Pendientes: prueba directa de migración `expo-sqlite`, reinicio real de la app con operación pendiente, notas o referencias fotográficas persistidas y verificación integral del flujo de sincronización en dispositivo o emulador.
