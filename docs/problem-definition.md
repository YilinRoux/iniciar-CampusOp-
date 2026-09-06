# Definición del problema — CampusOps

## Problema

En el campus ficticio, estudiantes y personal reportan incidencias (fallas eléctricas, daños en laboratorios, fugas de agua, problemas de conectividad, equipos descompuestos y riesgos de seguridad) sin un canal centralizado. Esto provoca que los reportes se pierdan o se dupliquen, que no quede claro quién debe atenderlos, y que no exista evidencia de si una incidencia realmente fue resuelta. CampusOps atiende este problema dando un canal único donde reportar, priorizar, asignar, atender y cerrar incidencias, con historial verificable de cada cambio.

## Alcance

### Incluye

- Definir actores, flujo de estados y criterios de aceptación del ciclo reportar → asignar → atender → cerrar.
- Verificar que el proyecto base (starter) instale y se ejecute correctamente antes de introducir cambios.
- Diseñar, reproducir, diagnosticar y corregir una falla controlada en el proyecto base, distinguiendo síntoma de causa.

### No incluye

- Implementación funcional de inicio de sesión, pantallas completas o persistencia offline (corresponde a semanas posteriores).
- Integración real con servicios de mapas, geocodificación o notificaciones push.
- Publicación en tiendas de aplicaciones o distribución pública del APK.

## Actores y responsabilidades

- **Reportante:** crea una incidencia, elige categoría, la describe, adjunta evidencia fotográfica, indica ubicación, y consulta el estado de sus propios reportes.
- **Técnico:** consulta las incidencias que le fueron asignadas, inicia su atención, registra diagnóstico y evidencia, y marca la incidencia como resuelta.
- **Coordinador:** consulta el conjunto de incidencias, las prioriza, asigna o reasigna técnicos, revisa historial y evidencias, y decide el cierre o la reapertura de un caso.

## Flujo principal

1. Reportar: el reportante crea la incidencia con categoría, descripción, ubicación y evidencia opcional; queda en estado `open`.
2. Asignar: el coordinador revisa la incidencia, la prioriza y la asigna a un técnico; el estado cambia a `assigned`.
3. Atender: el técnico inicia el trabajo (`in_progress`), registra diagnóstico y evidencia, y al terminar marca la incidencia como `resolved`.
4. Cerrar: el coordinador revisa la resolución y cierra el caso (`closed`), o lo reabre hacia `assigned` si detecta que sigue pendiente y existe técnico asignado.

## Criterios de aceptación verificables

1. Dado que un reportante crea una incidencia nueva, cuando se guarda, entonces debe quedar en estado `open` y visible en la lista que consulta el coordinador.
2. Dado que una incidencia ya fue reasignada por el coordinador a otro técnico, cuando el técnico original intenta modificarla, entonces la operación debe rechazarse.
3. Dado que se reenvía la misma operación de cierre (`closed`) sobre una incidencia ya cerrada, cuando el sistema la procesa de nuevo, entonces no debe duplicar eventos, evidencias ni historial de la incidencia.