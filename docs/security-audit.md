# Auditoría de seguridad — Semana 4

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Se encontraron tokens de autenticación escritos directamente en el código del backend (`course-backend/campusops.mjs` y `course-backend/server.mjs`). | Una persona con acceso al repositorio podía conocer los tokens y utilizarlos para realizar solicitudes autenticadas. | Se eliminaron los tokens del código y se configuraron mediante variables de entorno. | `docs/evidence/token-corregido.txt` |
| 2 | El backend tenía CORS configurado con `Access-Control-Allow-Origin: *` en `course-backend/server.mjs`. | Cualquier origen podía realizar solicitudes al backend, aumentando la superficie de exposición del servicio. | Se reemplazó `*` por un origen configurable mediante `COURSE_BACKEND_ALLOWED_ORIGIN`. | `docs/evidence/cors-corregido.txt` |
| 3 | El endpoint `/v1/session/login` solamente comprueba que el `actorId` exista y no solicita una contraseña u otra credencial adicional. | Una persona que conozca un `actorId` válido podría obtener una sesión dentro del fixture sin demostrar otra forma de autenticación. | Se documentó como una limitación del fixture educativo y no se modificó. | `docs/evidence/hallazgo-3.txt` |

## Hallazgo 1 — Tokens escritos directamente en el código

### Problema encontrado

En el backend existían valores de token escritos directamente dentro del código fuente.

### Riesgo

Una persona con acceso al repositorio podía obtener esos valores y utilizarlos para realizar solicitudes autenticadas.

### Solución

Los tokens fueron retirados del código y configurados mediante variables de entorno:

```js
const ACCESS_TOKEN = process.env.COURSE_ACCESS_TOKEN;
const REFRESH_TOKEN = process.env.COURSE_REFRESH_TOKEN;
```

También se agregaron las variables correspondientes a `.env.example`:

```env
COURSE_ACCESS_TOKEN=
COURSE_REFRESH_TOKEN=
COURSE_REFRESH_NEXT_TOKEN=
```

### Antes

Los archivos del backend contenían valores literales de los tokens de demostración.

### Después

Los archivos utilizan las variables `COURSE_ACCESS_TOKEN`, `COURSE_REFRESH_TOKEN` y `COURSE_REFRESH_NEXT_TOKEN`.

### Evidencia

La revisión del código actual y del historial del commit confirma que los valores literales anteriores fueron reemplazados por variables de entorno.

Ver `docs/evidence/token-corregido.txt`.

---

## Hallazgo 2 — CORS abierto

### Problema encontrado

En `course-backend/server.mjs` el backend utilizaba:

```js
'access-control-allow-origin': '*',
```

Esto permitía solicitudes desde cualquier origen.

### Riesgo

Permitir cualquier origen aumenta la superficie de exposición del backend.

### Solución

Se configuró un origen permitido mediante una variable de entorno:

```js
const allowedOrigin =
  process.env.COURSE_BACKEND_ALLOWED_ORIGIN ??
  'http://localhost:8081';
```

Y se utiliza en la respuesta:

```js
'access-control-allow-origin': allowedOrigin,
```

### Antes

El servidor permitía cualquier origen mediante `*`.

### Después

El origen permitido se obtiene de `COURSE_BACKEND_ALLOWED_ORIGIN`, con `http://localhost:8081` como valor predeterminado para el entorno local.

### Evidencia

La revisión del código actual y del historial del commit confirma que `Access-Control-Allow-Origin: *` fue reemplazado por un origen configurable.

Ver `docs/evidence/cors-corregido.txt`.

---

## Hallazgo 3 — Autenticación basada únicamente en actorId

### Problema encontrado

El endpoint `POST /v1/session/login` comprueba que el `actorId` exista, pero no solicita una contraseña u otra credencial adicional.

### Riesgo

Una persona que conozca un `actorId` válido podría obtener una sesión dentro del fixture.

### Solución

Se documentó esta situación como una limitación del fixture educativo. No se modificó porque el propio archivo del backend indica que se trata de un fixture público de enseñanza y que no debe utilizarse como autenticación institucional.

### Evidencia

El hallazgo se verificó directamente en el endpoint `/v1/session/login` de `course-backend/campusops.mjs`.

Ver `docs/evidence/hallazgo-3.txt`.

---

## Comprobación final

- La rama utilizada es `week4/security-audit-josmar`.
- El commit final es `e949372`.
- La rama local se encuentra sincronizada con `origin/week4/security-audit-josmar`.
- `.env` está incluido en `.gitignore`.
- `.env` no está rastreado por Git.
- `.env.example` existe y utiliza variables sin credenciales reales.
- Los valores `course-valid-token` y `course-refresh-0` encontrados en el historial corresponden a datos ficticios del fixture educativo y no son credenciales reales.

## Conclusión

La auditoría permitió identificar tres problemas de seguridad relacionados con el backend.

Se corrigieron dos de ellos: los tokens escritos directamente en el código y la configuración de CORS abierta. El tercer problema, relacionado con la autenticación mediante `actorId`, quedó documentado como una limitación del fixture educativo.

La evidencia asociada se encuentra dentro de `docs/evidence/`.
