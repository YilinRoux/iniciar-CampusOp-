# Controles de seguridad y privacidad — CampusOps (semana 4)

## Dónde termina la información

| Lugar | Qué podría conservar | Situación |
|---|---|---|
| Registros técnicos (logs) | Tokens en mensajes de error, correos, ubicaciones, fotos, comentarios internos | `reportError` redacta mensaje y contexto y no incluye la pila. No existe ningún `console.*` en `src/` ni en `App.tsx` (búsqueda vacía). |
| Almacenamiento de sesión | Token de acceso | Antes no había ningún almacenamiento (búsqueda de AsyncStorage y SecureStore vacía). Ahora hay un contrato `SessionStore` con implementación sobre `expo-secure-store`. |
| Reportes y evidencias (`reports/`, `evidence/`) | Comandos, salidas y textos pegados | Los revisa el escaneo de secretos; resultado en `reports/week-04/secret-scan.json`. |
| Código fuente | Secretos escritos en el código | No hay ninguno en `src/`, `App.tsx` ni `index.ts`. Los valores con forma de credencial (`course-valid-token`, `course-refresh-0`) viven en `course-backend/`, que es el servidor didáctico del curso con datos sintéticos. No se modifican porque las pruebas de semanas anteriores dependen de ellos. |

## Controles implementados

1. **Sanitización de telemetría.** `redactSensitive` (`src/campusops/domain/redaction.ts`) recorre objetos y listas y devuelve una copia; nunca modifica la entrada. Compara las claves en minúsculas y sin `_` ni `-`, y sustituye el valor completo por `[REDACTED]` en los campos del contrato de `docs/CAMPUSOPS_API.md`. Conserva contexto técnico como `incidentId`, `attempt` y `durationMs`. `redactForTelemetry` llama a esta lógica.
2. **Errores seguros.** `reportError` (`src/campusops/application/reportError.ts`) enmascara con `redactText` los secretos incrustados en el mensaje (`Bearer ...`, `token=...`), sanitiza el contexto con `redactSensitive` y solo escribe `level`, `message` y `context`, nunca la pila del error.
3. **Almacenamiento seguro de sesión.** La app depende del contrato `SessionStore` (dominio). `SecureSessionStore` guarda una única clave en `expo-secure-store` (Keychain en iOS, Keystore en Android). Solo `expoSecureStore.ts` conoce el módulo nativo, y el adaptador lo recibe por parámetro para poder probarlo sin código nativo.
4. **Escaneo de secretos.** `secret_scan` del evaluador revisa todos los archivos versionados. `reports/week-04/secret-scan.json` conserva el caso limpio y una falla controlada con una cadena sintética.

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

- Todavía no existe inicio de sesión (semana 6): el almacén está listo y probado, pero ningún flujo real guarda un token en él.
- La redacción se basa en nombres de clave. Un dato sensible en una clave que no está en la lista, o dentro de texto libre, no se enmascara; `redactText` solo cubre los patrones `Bearer` y `token=`. El contrato lo define como un mínimo.
- `npm audit` reporta 2 vulnerabilidades altas en dependencias internas de las herramientas de Expo (`@xmldom/xmldom` y `js-yaml`). El control `audit:ci` solo falla en nivel crítico. No se corrigen aquí para no alterar las versiones fijadas.
- Los tokens sintéticos de `course-backend/` siguen en el repositorio; deben permanecer ficticios y nunca reemplazarse por credenciales reales.
- El almacén nativo no protege un dispositivo comprometido (root o jailbreak).
