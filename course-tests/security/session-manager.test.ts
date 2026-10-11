import { SessionManager } from '../../src/campusops/application/sessionManager';
import type { LoginSession, RenewedSession, SessionTransport } from '../../src/campusops/domain/session';
import { HttpSessionTransport, authenticatedFetch } from '../../src/campusops/infrastructure/httpSessionTransport';
import { HttpIncidentRepository } from '../../src/campusops/infrastructure/httpIncidentRepository';
import type { FetchLike } from '../../src/campusops/infrastructure/httpIncidentRepository';
import { SecureSessionStore } from '../../src/campusops/infrastructure/secureSessionStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const fixture: LoginSession = {
  actorId: 'technician-1', role: 'technician', accessToken: 'fixture-access-0',
  refreshToken: 'fixture-refresh-0', expiresIn: 60,
};
const renewed: RenewedSession = { accessToken: 'fixture-access-1', refreshToken: 'fixture-refresh-1', expiresIn: 60 };

function harness() {
  let saved: string | null = null;
  let time = 1000;
  const storage = {
    setItemAsync: jest.fn(async (_key: string, value: string) => { saved = value; }),
    getItemAsync: jest.fn(async () => saved),
    deleteItemAsync: jest.fn(async () => { saved = null; }),
  };
  const transport = { login: jest.fn(async () => fixture), refresh: jest.fn(async () => renewed) };
  const logs: string[] = [];
  const manager = new SessionManager({
    store: new SecureSessionStore(storage), transport,
    now: () => time, onError: (line) => logs.push(line),
  });
  return { manager, storage, transport, logs, saved: () => saved, clock: (value: number) => { time = value; } };
}

test('login guarda en SecureStore y logout elimina la sesión', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  expect(h.manager.view()).toEqual({ status: 'authenticated', role: 'technician', actorId: 'technician-1' });
  expect(h.storage.setItemAsync).toHaveBeenCalledWith('campusops.session', expect.any(String));
  await h.manager.logout();
  expect(h.saved()).toBeNull();
  expect(h.manager.view().status).toBe('anonymous');
});

test('expiración usa reloj inyectado y renueva una vez para tres solicitudes', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  const send = jest.fn(async (_session: { accessToken: string }) => ({ status: 200 }));
  h.clock(60999);
  await h.manager.request(send);
  expect(h.transport.refresh).not.toHaveBeenCalled();
  h.clock(61000);
  await Promise.all([h.manager.request(send), h.manager.request(send), h.manager.request(send)]);
  expect(h.transport.refresh).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(4);
  expect(send.mock.calls[1]?.[0]).toHaveProperty('accessToken', renewed.accessToken);
});

test('tres 401 simultáneos comparten la llamada HTTP de refresh', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  const gate = deferred<RenewedSession>();
  const started = deferred<void>();
  h.transport.refresh.mockImplementation(() => { started.resolve(); return gate.promise; });
  const attempts = [0, 0, 0];
  const requests = attempts.map((_, index) => h.manager.request(async () => ({ status: ++attempts[index]! === 1 ? 401 : 200 })));
  await started.promise;
  expect(h.transport.refresh).toHaveBeenCalledTimes(1);
  gate.resolve(renewed);
  expect((await Promise.all(requests)).map((r) => r.status)).toEqual([200, 200, 200]);
  expect(attempts).toEqual([2, 2, 2]);
});

test('un segundo 401 termina la sesión, sin bucle', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  const send = jest.fn(async () => ({ status: 401 }));
  await expect(h.manager.request(send)).rejects.toThrow('Sesion no disponible');
  expect(send).toHaveBeenCalledTimes(2);
  expect(h.transport.refresh).toHaveBeenCalledTimes(1);
  expect(h.saved()).toBeNull();
});

test('renovación fallida borra tokens sin exponer el error remoto en logs', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  h.transport.refresh.mockRejectedValue(new Error(`token=${fixture.accessToken} ${fixture.refreshToken}`));
  await expect(h.manager.request(async () => ({ status: 401 }))).rejects.toThrow('Sesion no disponible');
  expect(h.saved()).toBeNull();
  expect(h.manager.view().status).toBe('anonymous');
  expect(h.logs.join('')).not.toContain(fixture.accessToken);
  expect(h.logs.join('')).not.toContain(fixture.refreshToken);
});

test('logout durante refresh rechaza el resultado tardío', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  const gate = deferred<RenewedSession>();
  const started = deferred<void>();
  h.transport.refresh.mockImplementation(() => { started.resolve(); return gate.promise; });
  const request = h.manager.request(async () => ({ status: 401 }));
  const rejected = expect(request).rejects.toThrow('Sesion no disponible');
  await started.promise;
  await h.manager.logout();
  gate.resolve(renewed);
  await rejected;
  expect(h.saved()).toBeNull();
  expect(h.manager.view().status).toBe('anonymous');
});

test('un refresh antiguo no reemplaza un nuevo login', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  const gate = deferred<RenewedSession>();
  const started = deferred<void>();
  h.transport.refresh.mockImplementation(() => { started.resolve(); return gate.promise; });
  const old = h.manager.request(async () => ({ status: 401 }));
  const rejected = expect(old).rejects.toThrow('Sesion no disponible');
  await started.promise;
  await h.manager.logout();
  await h.manager.login('technician-1');
  const current = h.saved();
  gate.resolve(renewed);
  await rejected;
  expect(h.saved()).toBe(current);
  expect(h.manager.view().status).toBe('authenticated');
});

test('logout espera un save iniciado y borra después', async () => {
  const h = harness();
  const gate = deferred<void>();
  const started = deferred<void>();
  const original = h.storage.setItemAsync.getMockImplementation()!;
  h.storage.setItemAsync.mockImplementation(async (key, value) => { started.resolve(); await gate.promise; await original(key, value); });
  const login = h.manager.login('technician-1');
  const rejected = expect(login).rejects.toThrow('Sesion no disponible');
  await started.promise;
  const logout = h.manager.logout();
  gate.resolve();
  await Promise.all([logout, rejected]);
  expect(h.saved()).toBeNull();
});

test('se restaura una sesión guardada y se detecta expiración', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  const restored = new SessionManager({ store: new SecureSessionStore(h.storage), transport: h.transport, now: () => 61000 });
  await restored.restore();
  expect(restored.view().status).toBe('expired');
  await restored.request(async () => ({ status: 200 }));
  expect(h.transport.refresh).toHaveBeenCalledTimes(1);
});

test('una respuesta de incidencias posterior a logout no llega a la UI', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  const gate = deferred<{ status: number }>();
  const request = h.manager.request(() => gate.promise);
  const rejected = expect(request).rejects.toThrow('Sesion no disponible');
  await h.manager.logout();
  gate.resolve({ status: 200 });
  await rejected;
});

test('el cliente de incidencias usa sesión y reintenta con headers renovados', async () => {
  const h = harness();
  await h.manager.login('technician-1');
  const headers: Record<string, string>[] = [];
  const fetch: FetchLike = async (_url, init) => {
    headers.push(init.headers);
    return { status: headers.length === 1 ? 401 : 200, headers: { get: () => null }, text: async () => '{"items":[]}' };
  };
  const repository = new HttpIncidentRepository({ baseUrl: 'http://fixture', actorId: '', token: '', timeoutMs: 1000, fetch: authenticatedFetch(h.manager, fetch) });
  expect(await repository.getIncidents()).toEqual([]);
  expect(headers.map((item) => item.Authorization)).toEqual(['Bearer fixture-access-0', 'Bearer fixture-access-1']);
  expect(headers[1]?.['X-Course-Actor']).toBe('technician-1');
});

test('login HTTP inválido se rechaza y queda no autenticado', async () => {
  const fetch: FetchLike = async () => ({ status: 200, headers: { get: () => null }, text: async () => '{"actorId":"technician-1"}' });
  const h = harness();
  const transport: SessionTransport = new HttpSessionTransport({ baseUrl: 'http://fixture', fetch, timeoutMs: 1000 });
  const manager = new SessionManager({ transport, store: new SecureSessionStore(h.storage), now: () => 0 });
  await expect(manager.login('technician-1')).rejects.toThrow('Sesion no disponible');
  expect(manager.view().status).toBe('anonymous');
  expect(h.saved()).toBeNull();
});
