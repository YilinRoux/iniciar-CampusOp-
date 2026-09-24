# Auditoría de seguridad — Semana 4
Abraham Moreno Vasquez — CampusOps

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Token de prueba escrito como literal en `course-tests/security/assign-authorization.test.mjs` | Si se replicara este patrón con un token real, quedaría expuesto de forma permanente en el historial de Git y sería difícil de rotar | Se movió a `process.env.COURSE_TEST_TOKEN` con fallback al valor de fixture, y se documentó en `.env.example` | docs/evidence/token-corregido.txt |
| 2 | El endpoint `/v1/session/login` devuelve `accessToken` y `refreshToken` completos; un `console.log` de depuración los expondría en logs | Los tokens de sesión podrían quedar visibles en la terminal o en logs compartidos, permitiendo a terceros reutilizarlos | Se creó `course-tests/security/session-log-audit.mjs`, que registra solo `actorId`, `role` y `authenticated`, nunca los tokens | docs/evidence/logs-sanitizados.txt |
| 3 | `evidence/week-02/individual.json` y `evidence/week-03/individual.json` contienen nombre completo y matrícula real de los 3 integrantes del equipo, subidos a GitHub | Expone datos personales reales de estudiantes en un repositorio de código | No corregido: el formato con `studentId` es requerido por la rúbrica del curso para la evaluación. Se recomienda mantener el repositorio privado como mitigación | docs/evidence/hallazgo-3-datos-personales.txt |

## Hallazgo 1 — Token escrito directamente en código

### Problema encontrado
En `course-tests/security/assign-authorization.test.mjs`, el header `Authorization` usaba el literal `'Bearer course-valid-token'` directamente en el código.

### Riesgo
Cualquier persona con acceso al repositorio ve el valor exacto del token en el historial de Git. Si en el futuro se usara un token real siguiendo este mismo patrón, quedaría expuesto permanentemente.

### Solución
Se extrajo a una constante que lee de variable de entorno, con fallback al valor de fixture del curso, y se agregó `COURSE_TEST_TOKEN=` a `.env.example`.

### Antes
\`\`\`javascript
Authorization: 'Bearer course-valid-token',
\`\`\`

### Después
\`\`\`javascript
const AUTH_TOKEN = process.env.COURSE_TEST_TOKEN ?? 'course-valid-token';
// ...
Authorization: \`Bearer \${AUTH_TOKEN}\`,
\`\`\`

### Evidencia
docs/evidence/token-corregido.txt

## Hallazgo 2 — Riesgo de exponer tokens de sesión en logs

### Problema encontrado
El endpoint `/v1/session/login` devuelve `accessToken` y `refreshToken` en texto plano dentro del body de respuesta. No existía ningún ejemplo en el proyecto de cómo manejar esa respuesta de forma segura, dejando abierta la posibilidad de que alguien agregara `console.log(response)` durante depuración.

### Riesgo
Un log de depuración olvidado en el código expondría credenciales de sesión completas en la terminal o en sistemas de logs compartidos.

### Solución
Se creó `course-tests/security/session-log-audit.mjs`, que confirma que la respuesta real trae el token (con `assert`, sin imprimirlo) y solo registra en consola un resumen sin datos sensibles: `{ actorId, role, authenticated }`.

### Antes (patrón inseguro, no implementado en el repo)
\`\`\`javascript
console.log(data); // expondria accessToken y refreshToken completos
\`\`\`

### Después
\`\`\`javascript
console.log('Login procesado:', { actorId: data.actorId, role: data.role, authenticated: true });
\`\`\`

### Evidencia
docs/evidence/logs-sanitizados.txt

## Hallazgo 3 — Datos personales de integrantes en archivos de evidencia

### Problema encontrado
`evidence/week-02/individual.json` y `evidence/week-03/individual.json` contienen el campo `studentId` con nombre completo y matrícula real de los 3 integrantes del equipo.

### Riesgo
Expone datos personales identificables de estudiantes en un repositorio de código, que podría ser público o compartido más allá del curso.

### Estado
No corregido. El campo `studentId` es un requisito explícito de la rúbrica del curso para poder evaluar la aportación individual de cada integrante, por lo que eliminarlo rompería el proceso de evaluación. Como mitigación se recomienda mantener el repositorio en modo privado y limitar el acceso solo al equipo y al docente.

### Evidencia
docs/evidence/hallazgo-3-datos-personales.txt