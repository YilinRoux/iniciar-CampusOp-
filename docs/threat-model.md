# Modelo de amenazas — CampusOps

## Activos que se deben proteger

- **Datos de incidencias:** categoría, descripción, ubicación, diagnóstico y evidencia fotográfica de cada incidencia.
- **Identidad y asignaciones:** qué técnico está asignado a qué incidencia, y el historial de cambios de estado.
- **Credenciales de sesión:** tokens de acceso y refresh que identifican a un actor (reportante, técnico, coordinador).
- **Registros técnicos (logs):** trazas de ejecución del backend y del CI, que no deben exponer datos personales ni credenciales.

## Fronteras de confianza

- **App móvil ↔ backend de CampusOps:** la app confía en que el backend valida permisos por rol; el backend no debe confiar en que la app ya filtró correctamente los datos.
- **Reportante ↔ Coordinador/Técnico:** un reportante no debe poder ver ni modificar incidencias de otros reportantes; un técnico no debe ver incidencias que no le fueron asignadas.
- **Repositorio de código ↔ GitHub Actions:** el workflow de CI ejecuta el código del repositorio con permisos limitados (`contents: read`), y no debe requerir ni exponer secretos reales.

## Amenazas priorizadas

### 1. Consultar incidencias ajenas (prioridad alta)

- **Amenaza:** un actor autenticado (reportante o técnico) intenta consultar una incidencia que no le pertenece ni le fue asignada.
- **Control:** la función `visible()` en `course-backend/campusops.mjs` verifica que el actor sea coordinador, el reportante original, o el técnico asignado antes de mostrar una incidencia.
- **Verificación:** la prueba `campusops-self-test.mjs` incluye el caso `await call('/v1/incidents/campus-inc-001', 403, 'reporter-2');`, confirmando que un reportante ajeno recibe `403 forbidden`.
- **Riesgo residual:** si se agregan nuevos endpoints en el futuro, deben aplicar la misma verificación de visibilidad; no está automatizado a nivel de framework. Además, las pruebas disponibles no demuestran mediante solicitudes GET separadas todos los casos positivos descritos por el control (coordinador, reportante original, técnico asignado); solo se confirma el caso de rechazo a un reportante ajeno.

### 2. Alterar asignaciones sin autorización (prioridad alta)

- **Amenaza:** un actor sin permisos de coordinador intenta reasignar una incidencia a un técnico distinto.
- **Control:** las acciones de tipo `assign`, `prioritize`, `close` y `reopen` están restringidas a actores con rol `coordinator` en el backend.
- **Verificación:** la prueba incluye `await action('technician-1', { action: 'start', baseVersion: 1 }, 'offline-old-start', 403);` y casos equivalentes para acciones de coordinador ejecutadas por actores sin ese rol.
- **Riesgo residual:** la verificación de rol depende de que el token `Authorization` y el header `X-Course-Actor` no puedan ser falsificados; en producción esto requeriría autenticación real, fuera del alcance de esta semana.

### 3. Filtrar datos sensibles en registros (prioridad media)

- **Amenaza:** los logs del backend o del CI exponen tokens, contraseñas, nombres de reportantes u otra información personal.
- **Control:** el escaneo de secretos (`secret_scan`) del evaluador revisa todos los archivos del repositorio en busca de patrones concretos de credenciales (claves privadas, tokens de GitHub, claves de AWS, variables `EXPO_PUBLIC_*SECRET*`), excluyendo binarios y `.env.example`. Este control no cubre automáticamente cualquier dato sensible de negocio (por ejemplo, nombres de reportantes en texto libre dentro de logs), solo los patrones de credenciales que reconoce.
- **Verificación:** ejecutar `make verify-week-03` incluye el check `secret_scan`, que debe reportar `hits=[]`.
- **Riesgo residual:** el escaneo detecta patrones conocidos, no garantiza la ausencia de cualquier dato sensible; el equipo debe seguir revisando manualmente antes de cada commit.

### 4. Exponer credenciales reales (prioridad alta)

- **Amenaza:** se sube por error una credencial real (token, clave privada, contraseña) al repositorio público.
- **Control:** el archivo `.gitignore` excluye `.env` y archivos de firma (`.jks`, `.keystore`, `.p8`, `.p12`); además, el `secret_scan` del evaluador bloquea la entrega si detecta patrones de credenciales reales.
- **Verificación:** `make verify-week-03` y `make public-test-week-03` deben reportar `secret_scan` con `hits=[]`.
- **Riesgo residual:** si una credencial no coincide con los patrones conocidos por el escáner, no sería detectada automáticamente.

## Amenaza que se atiende primero

Se prioriza **"consultar incidencias ajenas"**, porque es la amenaza con mayor probabilidad de explotarse por accidente (cualquier actor autenticado podría intentarlo sin necesitar habilidades técnicas especiales) y con impacto directo sobre la privacidad de los reportantes. El control ya existente (`visible()`) es simple de verificar y ya cuenta con una prueba automatizada que lo confirma en cada ejecución del backend.
