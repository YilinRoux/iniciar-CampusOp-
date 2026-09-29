# Controles de seguridad y privacidad — CampusOps (semana 4)

## Dónde termina la información

| Lugar | Qué podría conservar | Situación |
|---|---|---|
| Registros técnicos (logs) | Tokens en mensajes de error, correos, ubicaciones, fotos, comentarios internos | `reportError` redacta mensaje y contexto y no incluye la pila, pero no está conectado al flujo actual de la app. La búsqueda no encontró `console.*` en `src/` ni en `App.tsx`. |
| Almacenamiento de sesión | Token de acceso | No se encontró uso de AsyncStorage ni localStorage. Existe el contrato `SessionStore` y un adaptador sobre `expo-secure-store`, pero `createSessionStore` no está conectado a la composición actual de la app. |
| Reportes y evidencias (`reports/`, `evidence/`) | Comandos, salidas y textos pegados | Los revisa el escaneo de secretos; resultado en `reports/week-04/secret-scan.json`. |
| Código fuente | Secretos escritos en el código | Los valores con forma de credencial (`course-valid-token`, `course-refresh-0`) viven en `course-backend/`, que es el servidor didáctico del curso con datos sintéticos. El reporte guardado registra un escaneo limpio, pero ese resultado no se volvió a ejecutar durante esta revisión. No se modifican porque las pruebas de semanas anteriores dependen de ellos. |

## Controles implementados

1. **Sanitización de telemetría.** `redactSensitive` (`src/campusops/domain/redaction.ts`) recorre objetos y listas y devuelve una copia; nunca modifica la entrada. Compara las claves en minúsculas y sin `_` ni `-`, y sustituye el valor completo por `[REDACTED]` en los campos del contrato de `docs/CAMPUSOPS_API.md`. Conserva contexto técnico como `incidentId`, `attempt` y `durationMs`. `redactForTelemetry` llama a esta lógica.
2. **Errores seguros.** `reportError` (`src/campusops/application/reportError.ts`) enmascara con `redactText` los secretos incrustados en el mensaje (`Bearer ...`, `token=...`), sanitiza el contexto con `redactSensitive` y solo escribe `level`, `message` y `context`, nunca la pila del error. El helper está probado, pero no está conectado al flujo actual de la app.
3. **Almacenamiento seguro de sesión.** Existe el contrato `SessionStore` (dominio). `SecureSessionStore` guarda una única clave en `expo-secure-store` (Keychain en iOS, Keystore en Android). Solo `expoSecureStore.ts` conoce el módulo nativo y lo inyecta al adaptador para probarlo sin código nativo. El adaptador no está conectado a la composición actual de la app.
4. **Escaneo de secretos.** `secret_scan` del evaluador recorre los archivos legibles del árbol del proyecto con exclusiones de directorios y formatos; no consulta qué archivos están versionados en Git. `reports/week-04/secret-scan.json` conserva resultados registrados, incluidos un caso limpio y una falla controlada con una cadena sintética; no representa una ejecución de esta revisión.

## Relación con las amenazas de `docs/threat-model.md`

| Amenaza | Control | Verificación |
|---|---|---|
| Filtrar datos sensibles en registros | Controles 1 y 2 | `course-tests/public/week-04.test.ts`, `course-tests/security/redaction.test.ts` y `course-tests/security/sensitive-paths.test.ts` (lista anidada, claves con `_` y `-`, entrada sin modificar, error con token, contexto con correo). |
| Exponer credenciales reales | Controles 3 y 4, más `.gitignore` de `.env` y llaves de firma | `secret_scan` (`reports/week-04/secret-scan.json`) y prueba de que `clear()` deja vacío el almacén. |

## Elección del almacenamiento

Alternativas consideradas:

- **AsyncStorage:** simple, pero guarda en texto plano; cualquier lectura del archivo expone el token.
- **Solo memoria:** no deja rastro, pero la sesión se pierde al cerrar la app y obliga a iniciar sesión de nuevo.
- **`expo-secure-store` (elegida):** cifra con el almacén nativo del sistema y ya está integrado con Expo.

Beneficio: el token no queda en texto plano. Costo: una dependencia nueva, un plugin en `app.json` y que en Jest no se ejecuta el módulo nativo, por eso se prueba el adaptador con un doble. Se comprobó que `npm ci` desde cero y `make feedback` siguen pasando.

## Riesgo residual

- Todavía no existe inicio de sesión (semana 6): el adaptador está probado de forma aislada, pero no está conectado a la composición y ningún flujo real guarda un token en él.
- La redacción se basa en nombres de clave. Un dato sensible en una clave que no está en la lista, o dentro de texto libre, no se enmascara; `redactText` solo cubre los patrones `Bearer` y `token=`. El contrato lo define como un mínimo.
- `npm audit` reporta 2 vulnerabilidades altas en dependencias internas de las herramientas de Expo (`@xmldom/xmldom` y `js-yaml`). El control `audit:ci` solo falla en nivel crítico. No se corrigen aquí para no alterar las versiones fijadas.
- Los tokens sintéticos de `course-backend/` siguen en el repositorio; deben permanecer ficticios y nunca reemplazarse por credenciales reales.
- El almacén nativo no protege un dispositivo comprometido (root o jailbreak).
