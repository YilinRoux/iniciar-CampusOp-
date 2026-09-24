# Auditoría de seguridad — Semana 4 (CampusOps)

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Token de autenticación (`course-valid-token`) escrito directamente en el código del backend de pruebas | Cualquier persona con acceso al repositorio conoce el valor exacto que el backend acepta como credencial válida | Identificado y documentado; no corregido (ver justificación abajo) | `token-hardcodeado-identificado.txt` |
| 2 | La app móvil no verificaba quién pedía una incidencia antes de mostrarla | Un actor sin permiso podía obtener datos de una incidencia ajena si la app no aplicaba ningún filtro propio, dependiendo por completo del backend | Se agregó un control de visibilidad por actor/rol en la capa de aplicación (`getIncidents`, `getIncidentDetail`) | `getIncidents-test-pass.txt`, `control-acceso-typecheck.txt`, `diff-control-acceso.txt` |
| 3 | La pantalla de detalle no distinguía "cargando" de "acceso denegado" | Un rechazo de acceso se mostraba igual que una carga normal, sin informar al usuario que no tiene permiso, y sin registrar ese caso como un estado distinto | Se agregó un estado explícito `forbidden` en `IncidentDetailScreen` | `diff-control-acceso.txt`, `control-acceso-typecheck.txt` |

## Hallazgo 1 — Token de autenticación hardcodeado

### Problema encontrado

El valor `'course-valid-token'` está escrito directamente, como texto literal, en varios archivos de `course-backend/`: `campusops.mjs`, `server.mjs`, `self-test.mjs`, `campusops-self-test.mjs` y documentado en `README.md`. Es el token que el backend acepta como válido para autenticar cualquier actor.

### Riesgo

Cualquier persona con acceso de lectura al repositorio conoce, sin necesidad de ningún ataque, el valor exacto de la credencial que el sistema acepta. Si este patrón se replicara sin cuidado hacia un entorno con datos reales, la credencial quedaría expuesta desde el primer commit del repositorio.

### Por qué no se corrigió

`course-backend/` es el fixture de backend provisto por el curso desde el primer commit del proyecto (`ac64cf6`, "chore: iniciar CampusOps"), no código escrito por el equipo. Modificarlo podría romper la compatibilidad con los evaluadores automáticos de otras semanas, que dependen de que ese token exacto sea aceptado. Por eso se documenta como hallazgo identificado, sin aplicar una corrección directa sobre el fixture del curso.

### Evidencia

Ver `docs/evidence/token-hardcodeado-identificado.txt`: lista las 9 líneas donde aparece el valor literal `course-valid-token` dentro de `course-backend/`.

---

## Hallazgo 2 — Falta de control de acceso en la capa de aplicación móvil

### Problema encontrado

Las funciones `getIncidentDetail(repository, id)` y `getIncidents(repository)`, en `src/campusops/application/`, recibían únicamente el repositorio y el identificador de la incidencia. No recibían ni verificaban quién era el actor que solicitaba los datos, ni su rol.

### Riesgo

Aunque el backend real (`course-backend/campusops.mjs`) sí valida permisos con la función `visible()`, la aplicación móvil no aplicaba ningún control equivalente en su propia capa. Esto contradice la frontera de confianza documentada en `docs/threat-model.md`: *"el backend no debe confiar en que la app ya filtró correctamente los datos"* — el caso inverso también aplica: la app no debería depender ciegamente del backend como única línea de defensa.

### Solución

Se agregó el tipo `Actor` (con `id` y `role`) y la función `isIncidentVisibleToActor()` en `src/campusops/domain/incident.ts`, que reproduce la misma regla que ya usa el backend: el coordinador ve todo, el reportante solo lo suyo, el técnico solo lo asignado. Las funciones `getIncidents` y `getIncidentDetail` ahora reciben un `Actor` y aplican esta regla antes de devolver los datos.

### Antes

```ts
export async function getIncidentDetail(repository: IncidentRepository, id: string): Promise<Incident | null> {
  return repository.getIncidentById(id);
}
```

### Después

```ts
export async function getIncidentDetail(
  repository: IncidentRepository,
  id: string,
  actor: Actor,
): Promise<IncidentDetailResult> {
  const incident = await repository.getIncidentById(id);
  if (!incident) return { status: 'not_found' };
  if (!isIncidentVisibleToActor(incident, actor)) return { status: 'forbidden' };
  return { status: 'ok', incident };
}
```

### Evidencia

- `docs/evidence/control-acceso-typecheck.txt`: `npm run typecheck` sin errores tras el cambio.
- `docs/evidence/getIncidents-test-pass.txt`: la prueba de arquitectura sigue en `PASS` con la nueva firma.
- `docs/evidence/diff-control-acceso.txt`: diferencia completa entre el código anterior y el corregido.

---

## Hallazgo 3 — La pantalla de detalle no distinguía "cargando" de "acceso denegado"

### Problema encontrado

`IncidentDetailScreen.tsx` solo manejaba dos estados: `incident === null` (que interpretaba como "Cargando...") o el objeto completo de la incidencia. No existía ningún estado para un acceso rechazado.

### Riesgo

Al conectar el control de acceso del Hallazgo 2, un rechazo real se hubiera visto igual que una carga en progreso indefinida, sin informar al usuario que no tiene permiso para ver esa incidencia — un mensaje de error mal manejado que oculta información en lugar de comunicarla con claridad.

### Solución

Se definió el tipo `IncidentDetailResult` con tres estados posibles (`ok`, `not_found`, `forbidden`), y la pantalla ahora muestra un mensaje explícito para cada uno.

### Antes

```tsx
if (!incident) return <Text>Cargando...</Text>;
```

### Después

```tsx
if (!result) return <Text>Cargando...</Text>;
if (result.status === 'forbidden') return <Text>No tienes permiso para ver esta incidencia.</Text>;
if (result.status === 'not_found') return <Text>Incidencia no encontrada.</Text>;
```

### Evidencia

Ver `docs/evidence/diff-control-acceso.txt` y `docs/evidence/control-acceso-typecheck.txt` (el nuevo manejo de estados compila sin errores).

---

## Comprobación final

Se ejecutó `git stash` para comparar el comportamiento de las pruebas antes y después de los cambios: ambas corridas mostraron el mismo resultado (`21 failed, 6 passed` de 27 pruebas totales), confirmando que las pruebas que ya fallaban antes de esta auditoría (funcionalidades de semanas futuras aún no implementadas, como `week-04` a `week-13`) no fueron afectadas por estos cambios, y que la prueba relevante (`course-tests/architecture/getIncidents.test.ts`) y la entrega de la semana 3 (`course-tests/public/week-03.test.ts`) siguen pasando correctamente.

No se utilizaron credenciales, tokens ni datos personales reales en ningún momento de esta auditoría.