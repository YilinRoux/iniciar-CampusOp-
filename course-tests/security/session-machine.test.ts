import { coordinateRefresh } from '../../src/course-evaluation';
import { initialSession, transitionSession } from '../../src/campusops/domain/sessionMachine';

test('login, expiración y cierre tienen transiciones explícitas', () => {
  const start = transitionSession(initialSession(), { type: 'loginStarted' });
  expect(start.status).toBe('logging_in');
  const logged = transitionSession(start, { type: 'loginSucceeded', generation: 0, token: 'fixture' });
  expect(logged.status).toBe('authenticated');
  expect(transitionSession(logged, { type: 'expired' }).status).toBe('expired');
  const closing = transitionSession(logged, { type: 'logout' });
  expect(closing.status).toBe('closing');
  expect(closing.persistedToken).toBeNull();
  expect(transitionSession(closing, { type: 'logoutCompleted' }).status).toBe('anonymous');
});

test('un login fallido vuelve a no autenticado', () => {
  const start = transitionSession(initialSession(), { type: 'loginStarted' });
  expect(transitionSession(start, { type: 'loginFailed' }).status).toBe('anonymous');
});

test('401 repetidos comparten renovación y no duplican solicitudes', () => {
  const result = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'request401', requestId: 'b', generation: 0 },
    { type: 'refreshSucceeded', generation: 1, token: 'fixture' },
  ]);
  expect(result.refreshCalls).toBe(1);
  expect(result.retriedRequestIds).toEqual(['a', 'b']);
});

test('fallo de renovación borra el token y rechaza un éxito tardío', () => {
  const result = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'refreshFailed', generation: 1 },
    { type: 'refreshSucceeded', generation: 1, token: 'late-fixture' },
  ]);
  expect(result.status).toBe('anonymous');
  expect(result.persistedToken).toBeNull();
  expect(result.retriedRequestIds).toEqual([]);
});

test('logout durante refresh impide que su respuesta restaure la sesión', () => {
  const result = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'logout' },
    { type: 'refreshSucceeded', generation: 1, token: 'late-fixture' },
  ]);
  expect(result.status).toBe('anonymous');
  expect(result.persistedToken).toBeNull();
});

test('un segundo 401 de la misma solicitud no inicia otro refresh', () => {
  const result = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'refreshSucceeded', generation: 1, token: 'fixture' },
    { type: 'request401', requestId: 'a', generation: 1 },
  ]);
  expect(result.status).toBe('anonymous');
  expect(result.refreshCalls).toBe(1);
  expect(result.persistedToken).toBeNull();
});

test('un 401 tardío usa la generación renovada sin otro refresh', () => {
  const result = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'refreshSucceeded', generation: 1, token: 'fixture' },
    { type: 'request401', requestId: 'b', generation: 0 },
  ]);
  expect(result.refreshCalls).toBe(1);
  expect(result.retriedRequestIds).toEqual(['a', 'b']);
});
