# Contrato de API — Semana 5 (cliente cloud de incidencias)

Este documento describe lo que el cliente `HttpIncidentRepository` envía y recibe del backend didáctico, cómo valida cada respuesta y cómo representa los errores. Todos los datos son ficticios. Las respuestas citadas se observaron con `curl` y con `course-tests/contract/backend-scenarios.test.ts` contra `make run-backend`.

## 1. Tres capas y sus límites

| Capa | Qué es | Dónde vive |
|---|---|---|
| **DTO** (dato remoto) | El sobre `{ id, version, status, payload }` tal como lo manda el servidor, con campos que la app no necesita (`reporterId`, `priority`, `notes`, `evidence`, `history`) | `parseRemoteEnvelope` en `src/campusops/domain/remoteResource.ts` |
| **Dominio** | `Incident`: `id`, `category`, `description`, `location`, `status`, `assignedTechnicianId` | `src/campusops/domain/incident.ts` |
| **Errores** | `RemoteError` con un campo `kind` distinguible | `src/campusops/domain/remoteError.ts` |

El paso del DTO al dominio ocurre en un solo lugar, `toIncident` (`src/campusops/infrastructure/incidentMapper.ts`). La UI y los casos de uso sólo conocen `Incident` y `IncidentRepository`; nunca ven el sobre ni hacen HTTP. El único punto donde se elige la implementación es `src/campusops/composition.ts`.

## 2. Solicitudes comunes

Todas las rutas usan estos encabezados (valores públicos del simulador, no secretos):

| Encabezado | Valor |
|---|---|
| `Authorization` | `Bearer course-valid-token` |
| `X-Course-Actor` | actor de prueba, por ejemplo `coordinator-1` |
| `Content-Type` | `application/json` (sólo en POST) |
| `Idempotency-Key` | sólo en POST; mínimo 8 caracteres |
| `X-Course-Scenario` | sólo para pruebas contra el backend didáctico |

El cliente recibe por inyección `fetch`, `baseUrl`, `actorId`, `token`, `timeoutMs` y `scenario`. No importa `fetch` directamente, así que las pruebas no dependen de ninguna red.

## 3. Operaciones

### 3.1 Lista — `GET /v1/incidents`

Respuesta `200`: `{ "items": [ <sobre>, ... ] }`.

```json
{"items":[{"id":"campus-inc-001","version":1,"status":"assigned","payload":{"category":"connectivity","description":"Sin conexión en laboratorio ficticio","location":"Edificio de prueba A","reporterId":"reporter-1","assignedTechnicianId":"technician-1","priority":"medium","notes":[],"evidence":[],"history":[]}}]}
```

Reglas del cliente:
- Cada elemento pasa por `parseRemoteEnvelope` y luego por `toIncident`.
- Los elementos con `payload: null` se omiten.
- Un solo elemento inválido invalida toda la lista (`invalid_response`); no se acepta una lista a medias.
- Si falta `items` o no es un arreglo, es `invalid_response`.

### 3.2 Detalle — `GET /v1/incidents/:id`

Respuesta `200`: un sobre.

| Caso | Respuesta observada | Resultado en el cliente |
|---|---|---|
| Existe | `{"id":"campus-inc-001","version":1,"status":"assigned","payload":{...}}` | `Incident` |
| Payload nulo válido (`nullable`) | `{"id":"campus-inc-001","version":1,"status":"assigned","payload":null}` | `null`, sin error y sin inventar datos |
| No existe | `404 {"code":"not_found"}` | `null` |

### 3.3 Crear — `POST /v1/incidents`

Cuerpo: `{ "category", "description", "location" }`. Requiere `Idempotency-Key` de al menos 8 caracteres.

Respuesta `201`. El sobre viene **envuelto**, no directo:

```json
{"incident":{"id":"campus-inc-101","version":1,"status":"open","payload":{"category":"water","description":"Fuga simulada","location":"Zona manual ficticia","reporterId":"reporter-1","assignedTechnicianId":null,"priority":"medium","notes":[],"evidence":[],"history":[]}},"operationId":"create-operation-0001","duplicate":false}
```

Reglas del cliente:
- Desenvuelve `incident`, lo valida y lo convierte con `toIncident`.
- Un `payload: null` al crear es `invalid_response`: una creación exitosa debe devolver datos.
- Clave menor de 8 caracteres: el servidor responde `400 {"code":"idempotency_key_required"}`, que el cliente representa como `rejected`.
- La clave la genera quien llama, no el repositorio. Si la respuesta se pierde (timeout) y se reintenta con la **misma** clave, el servidor no duplica. Con el backend didáctico, la prueba `crear con la misma clave dos veces no duplica` obtuvo el mismo `id` en ambos intentos.

## 4. Validación del sobre

`parseRemoteEnvelope` (la lógica real detrás de `parseRemoteResource`) acepta sólo si:

- La entrada es un objeto (no `null`, no arreglo).
- `id` y `status` son cadenas no vacías.
- `version` es un entero seguro mayor o igual que 0.
- `payload` es un objeto o `null`.

Los campos extra del sobre se ignoran y no se propagan. Después, `toIncident` valida el dominio: `status` debe ser uno de `open`, `assigned`, `in_progress`, `resolved`, `closed`; `category`, `description` y `location` deben ser texto; `assignedTechnicianId` debe ser texto o nulo. Los campos internos del DTO se descartan.

## 5. Representación de errores

El cliente nunca deja escapar una excepción genérica: todo fallo se convierte en `RemoteError` con un `kind`.

| `kind` | Cuándo | Observado con |
|---|---|---|
| `invalid_response` | JSON ilegible, sobre inválido, estado fuera del dominio, lista sin `items` | variante `malformed` |
| `timeout` | La solicitud supera `timeoutMs` y se aborta | variante `slow` con límite corto |
| `server_error` | Estado 5xx | `500 {"code":"controlled_failure"}` (variante `server_error`) |
| `rate_limited` | Estado 429; incluye `retryAfterMs` leído de `Retry-After` | `429` con `retry-after: 1` (variante `rate_limited`) |
| `network_error` | El `fetch` falla sin que haya timeout | doble de `fetch` que lanza |
| `rejected` | Otros 4xx (403, 400, etc.) | `400 idempotency_key_required` |

Los mensajes de error son fijos y no incluyen el cuerpo de la respuesta, así que datos como `location` o `assignedTechnicianId` no pasan al mensaje. Los casos de uso registran con `reportError`, que redacta el mensaje y el contexto (`location` y `assignedTechnicianId` salen como `[REDACTED]`) y no incluye la pila.

Un 404 en el detalle no es un error: se devuelve `null`, igual que `InMemoryIncidentRepository`.

## 6. Cómo se comprueba

| Qué | Dónde |
|---|---|
| Parser del sobre | `course-tests/public/week-05.test.ts` |
| Cliente con doble de `fetch` (válida, `payload: null`, malformado, timeout, 500, 429, red caída, 4xx, crear, reintento con la misma clave, logs sanitizados, separación DTO/dominio) | `course-tests/contract/httpIncidentRepository.test.ts` |
| Cliente contra las variantes del backend didáctico | `course-tests/contract/backend-scenarios.test.ts`; se omite si no se define `CAMPUSOPS_LIVE_BACKEND` |

Las pruebas con doble de `fetch` no requieren red. La corrida contra el backend didáctico se activa con:

```bash
make run-backend
CAMPUSOPS_LIVE_BACKEND=http://127.0.0.1:4310 npx jest --no-watchman --cacheDirectory .jest-cache --ci --runInBand course-tests/contract/backend-scenarios.test.ts
```

La prueba contra el backend usa el módulo `http` de Node, porque el preset de React Native para Jest sustituye el `fetch` global y las respuestas no llegan al servidor.

## 7. Decisiones y límites conocidos

- La interfaz `IncidentRepository` no cambió. Crear vive en una interfaz aparte, `IncidentCreator`, para no romper dobles de prueba existentes que sólo implementan lectura.
- `composition.ts` elige el cliente HTTP si existe `EXPO_PUBLIC_CAMPUSOPS_BACKEND_URL`; si no, usa el repositorio en memoria. Así las pruebas nunca intentan conectarse a un servidor.
- Las pantallas capturan el error con `.catch` y no se rompen. Hoy no muestran un mensaje de error: la lista queda vacía y el detalle se queda en "Cargando...".
- No hay pantalla de creación; la creación se prueba mediante el cliente.
- No hay reintento automático. La política de reintentos (`planRetry`) corresponde a la semana 9.
- La identidad (`coordinator-1`) y el token son fixtures públicos del simulador. Ninguna app real debe confiar en un rol enviado por el cliente.