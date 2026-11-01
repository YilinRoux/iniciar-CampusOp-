# CampusOps — Política de resiliencia (Semana 09)

## Objetivo

CampusOps debe permitir registrar y atender incidencias incluso cuando
el proveedor de ubicación o la conexión con el servidor fallen.

La prioridad es conservar la información del usuario, evitar solicitudes
sin límite y no duplicar operaciones que ya fueron guardadas.

## Proveedor externo

Se integró Open-Meteo Geocoding mediante el adaptador
`src/campusops/infrastructure/openMeteoGeocoding.ts`.

Endpoint:
https://geocoding-api.open-meteo.com/v1/search

La consulta utiliza GET con nombre de lugar, idioma español y formato JSON.
El proveedor devuelve nombres y coordenadas geográficas.

Se realizó una consulta externa con el término ficticio de prueba
"Puebla", obteniendo HTTP 200 y un resultado con:

- Nombre: Puebla de Zaragoza
- Latitud: 19.04778
- Longitud: -98.20723

Esta consulta comprueba conectividad real con el proveedor. No demuestra
la ubicación exacta de un edificio ni se utiliza para inventar coordenadas
de laboratorios.

Las pruebas de fallos utilizan respuestas simuladas y el backend
didáctico para no depender de la disponibilidad del servicio público.

## Caché

El adaptador conserva en memoria las ubicaciones válidas ya consultadas.
La clave se normaliza eliminando espacios exteriores y usando minúsculas.

Una consulta repetida reutiliza el resultado y evita otra solicitud HTTP.
No se guardan respuestas inválidas como ubicaciones confirmadas.

Limitación: la caché se pierde al reiniciar la aplicación. No se presenta
como almacenamiento persistente ni como fuente de datos actualizados
permanentemente.

## Validación y ubicación manual

La función `selectIncidentLocation` acepta resultados del proveedor
únicamente si incluyen una etiqueta no vacía y coordenadas numéricas
finitas dentro de los rangos válidos:

- Latitud: de -90 a 90.
- Longitud: de -180 a 180.

Ante resultados incompletos, coordenadas inválidas, JSON incorrecto,
timeout o indisponibilidad, se conserva una etiqueta manual.

La pantalla de creación permite buscar una ubicación y escribir una
referencia como edificio, laboratorio o zona.

La alternativa manual no inventa latitud ni longitud.

## Reintentos y límites

Las solicitudes GET pueden repetirse ante fallos transitorios, como
HTTP 429, errores 5xx y timeout.

La política limita cada operación a cuatro intentos como máximo.
No se programa otro intento después del cuarto.

Para fallos transitorios sin una indicación del servidor se utiliza
una espera progresiva. Las pruebas verificaron demoras de:

- 500 ms después del primer intento.
- 1000 ms después del segundo.
- 2000 ms después del tercero.

Ante HTTP 429 se respeta un encabezado Retry-After válido.
Una prueba comprobó una espera indicada de 2000 ms.

Las demoras anteriores son valores comprobados en pruebas con reloj
simulado; no representan mediciones de latencia de Internet.

Ante respuestas inválidas o errores que no son recuperables, se evita
repetir solicitudes innecesarias.

## Timeout y desconexión

El adaptador utiliza AbortController para cancelar solicitudes que
excedan el tiempo configurado.

La prueba de timeout simuló cuatro solicitudes que respondían al aborto.
Después del cuarto intento se conservó la ubicación manual.

La cancelación efectiva también depende de que el transporte HTTP
respete la señal de aborto. No se garantiza cancelar un transporte
que ignore esa señal.

Cuando no se puede recuperar la ubicación, el usuario puede continuar
con una referencia manual sin bloquear la creación de la incidencia.

## Operaciones POST e idempotencia

Las operaciones que modifican incidencias requieren una clave
`Idempotency-Key` estable.

Si una respuesta se pierde después de que el servidor guarda el cambio,
el cliente puede repetir exactamente la misma operación con la misma
clave y el mismo contenido.

La implementación limita los reintentos y evita repetir POST sin
identidad estable.

Una prueba de integración contra el backend didáctico utilizó
`timeout_after_commit`. El primer intento perdió su respuesta y
el segundo reutilizó la misma clave y el mismo cuerpo.

La versión de la incidencia aumentó una sola vez y el estado final
fue `in_progress`. Esto demuestra que el escenario probado no produjo
una segunda transición.

La prueba utilizó la acción `start`. No se afirma haber ejecutado
todavía el mismo escenario con `resolve` o `close`.

## Decisión de ingeniería

Se reintenta cuando el error parece temporal y repetir la solicitud
es seguro.

Se utiliza la ubicación manual cuando el proveedor no entrega datos
válidos o agota los intentos.

Se informa el fallo cuando la operación no puede completarse con
seguridad. Un rechazo definitivo, como HTTP 400, no debe generar
reintentos automáticos.

Para escrituras con respuesta perdida no se genera una clave nueva:
se conserva la identidad original de la operación.

## Alternativas consideradas

1. Depender completamente del proveedor externo.
   Es sencillo, pero impide continuar cuando falla Internet o la API.

2. Reintentar indefinidamente.
   Podría recuperar algunos fallos, pero consume recursos y aumenta
   la carga del servidor sin ofrecer un límite predecible.

3. Usar ubicación manual sin proveedor.
   Es robusto ante desconexiones, pero pierde la ayuda de búsqueda
   y las coordenadas que sí puede entregar un proveedor válido.

Se eligió combinar proveedor, caché, validación, reintentos limitados
y alternativa manual.

El costo es mayor complejidad de implementación y una caché que sólo
vive durante la sesión de la aplicación.

## Verificación reproducible

Pruebas de lógica y adaptadores:

`npx jest course-tests/integration/week-09-open-meteo.test.ts course-tests/integration/week-09-action-retry.test.ts course-tests/integration/week-09-geocoding.test.ts course-tests/public/week-09.test.ts --runInBand`

Resultado observado: 18 pruebas aprobadas.

Prueba de respuesta perdida contra backend local:

`CAMPUSOPS_LIVE_BACKEND=http://127.0.0.1:4310 npx jest course-tests/integration/week-09-backend-lost-response.test.ts --runInBand --verbose`

Resultado observado: 1 prueba aprobada.

Pruebas de escenarios del backend:

`CAMPUSOPS_LIVE_BACKEND=http://127.0.0.1:4310 npx jest course-tests/contract/backend-scenarios.test.ts --runInBand --verbose`

Resultado observado en una ejecución anterior: 7 pruebas aprobadas.

También se ejecutaron correctamente:

- `npm run typecheck`
- `npm run lint`

Las pruebas que requieren el backend necesitan ejecutar previamente
`make run-backend`.

## Alcance y limitaciones

Estas pruebas respaldan los escenarios ejecutados, no garantizan que
todos los proveedores, redes y dispositivos se comporten igual.

Quedan pendientes la verificación final de la entrega, la generación
de los reportes con el SHA definitivo y la evidencia individual
auténtica de los tres integrantes.

La asistencia de IA se utilizó para apoyar el desarrollo, la redacción
y la preparación de pruebas. Los resultados técnicos deben contrastarse
con las ejecuciones reales y la revisión humana del equipo.
