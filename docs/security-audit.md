# Auditoría de seguridad — Semana 4

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Se encontraron tokens de autenticación escritos directamente en el código del backend (`course-backend/campusops.mjs` y `course-backend/server.mjs`). | Una persona con acceso al repositorio podía conocer los tokens y utilizarlos para realizar solicitudes autenticadas. | Se eliminaron los tokens del código y se configuraron mediante variables de entorno. | Búsqueda de tokens en los archivos corregidos. |
| 2 | El backend tenía CORS configurado con `Access-Control-Allow-Origin: *` en `course-backend/server.mjs`. | Cualquier origen podía realizar solicitudes al backend, aumentando la superficie de exposición del servicio. | Se reemplazó `*` por un origen configurable mediante `COURSE_BACKEND_ALLOWED_ORIGIN`. | Código corregido de `server.mjs`. |
| 3 | El endpoint `/v1/session/login` solamente comprueba que el `actorId` exista y no solicita una contraseña u otra credencial adicional. | Una persona que conozca un `actorId` válido podría obtener una sesión dentro del fixture sin demostrar otra forma de autenticación. | Se documentó como una limitación del fixture educativo y no se modificó. | Código del endpoint `/v1/session/login`. |

## Hallazgo 1 — Tokens escritos directamente en el código

### Problema encontrado

En el backend existían valores de token escritos directamente dentro del código fuente.

### Riesgo

Una persona con acceso al repositorio podía obtener esos valores y utilizarlos para realizar solicitudes autenticadas.

### Solución

Se eliminaron los valores de los tokens del código y se configuraron mediante variables de entorno:

```js
const ACCESS_TOKEN = process.env.COURSE_ACCESS_TOKEN;
const REFRESH_TOKEN = process.env.COURSE_REFRESH_TOKEN;