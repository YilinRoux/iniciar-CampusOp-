import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as http from 'node:http';
import { SessionManager } from '../../src/campusops/application/sessionManager';
import { HttpSessionTransport, authenticatedFetch } from '../../src/campusops/infrastructure/httpSessionTransport';
import { HttpIncidentRepository } from '../../src/campusops/infrastructure/httpIncidentRepository';
import type { FetchLike } from '../../src/campusops/infrastructure/httpIncidentRepository';
import { HttpIncidentActions } from '../../src/campusops/infrastructure/httpIncidentActions';

jest.setTimeout(20000);
let process: ChildProcess;
let baseUrl = '';

const nodeFetch: FetchLike = (url, init) => new Promise((resolve, reject) => {
  if (init.signal.aborted) { reject(new Error('aborted')); return; }
  const request = http.request(url, { method: init.method, headers: init.headers }, (response) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('error', reject);
    response.on('end', () => resolve({
      status: response.statusCode ?? 0,
      headers: { get: (name) => {
        const value = response.headers[name.toLowerCase()];
        return Array.isArray(value) ? value[0] ?? null : value ?? null;
      } },
      text: async () => Buffer.concat(chunks).toString('utf8'),
    }));
  });
  const abort = () => { request.destroy(new Error('aborted')); };
  init.signal.addEventListener('abort', abort);
  request.on('close', () => init.signal.removeEventListener('abort', abort));
  request.on('error', reject);
  if (init.body !== undefined) request.write(init.body);
  request.end();
});

beforeAll(async () => {
  process = spawn('node', ['course-backend/server.mjs'], {
    env: { ...global.process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    let output = '';
    process.once('error', reject);
    process.once('exit', () => reject(new Error('El backend termino antes de iniciar')));
    process.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { baseUrl = match[0]; resolve(); }
    });
  });
});

afterAll(async () => {
  if (!process || process.exitCode !== null) return;
  await new Promise<void>((resolve) => { process.once('exit', () => resolve()); process.kill(); });
});

async function client(actorId: string) {
  let saved: string | null = null;
  let now = 0;
  const transport = new HttpSessionTransport({ baseUrl, fetch: nodeFetch, timeoutMs: 2000 });
  const manager = new SessionManager({
    transport, now: () => now,
    store: { save: async (value) => { saved = value; }, load: async () => saved, clear: async () => { saved = null; } },
  });
  await manager.login(actorId);
  const fetch = authenticatedFetch(manager, nodeFetch);
  return {
    manager, transport, saved: () => saved, clock: (value: number) => { now = value; },
    repository: new HttpIncidentRepository({ baseUrl, actorId: '', token: '', fetch, timeoutMs: 2000 }),
    actions: new HttpIncidentActions({ baseUrl, fetch, timeoutMs: 2000 }),
  };
}

test('los perfiles se autentican y el servidor restringe sus operaciones', async () => {
  const reporter = await client('reporter-1');
  const technician = await client('technician-1');
  const otherTechnician = await client('technician-2');
  const coordinator = await client('coordinator-1');
  expect(reporter.manager.view().role).toBe('reporter');
  expect(technician.manager.view().role).toBe('technician');
  expect(coordinator.manager.view().role).toBe('coordinator');
  expect(await otherTechnician.repository.getIncidents()).toEqual([]);
  await expect(otherTechnician.actions.perform('campus-inc-001', 'start')).rejects.toMatchObject({ status: 403 });
  const otherTechnicianSession = await otherTechnician.transport.login('technician-2');
  const directResolve = await nodeFetch(`${baseUrl}/v1/incidents/campus-inc-001/actions`, {
    method: 'POST',
    signal: new AbortController().signal,
    headers: {
      Authorization: `Bearer ${otherTechnicianSession.accessToken}`,
      'X-Course-Actor': 'technician-2',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'week06-unassigned-resolve',
    },
    body: JSON.stringify({
      action: 'resolve', baseVersion: 1, diagnosis: 'Diagnostico ficticio no autorizado',
    }),
  });
  expect(directResolve.status).toBe(403);
  expect(await directResolve.text()).toContain('forbidden');
  await expect(reporter.actions.perform('campus-inc-001', 'resolve', 'Prueba')).rejects.toMatchObject({ status: 403 });
  await expect(coordinator.actions.perform('campus-inc-001', 'start')).rejects.toMatchObject({ status: 403 });
  await expect(coordinator.actions.perform('campus-inc-001', 'close')).rejects.toMatchObject({ status: 409 });
  expect(await technician.actions.perform('campus-inc-001', 'start')).toBe('in_progress');
  expect(await technician.actions.perform('campus-inc-001', 'resolve', 'Diagnostico ficticio')).toBe('resolved');
  await expect(technician.actions.perform('campus-inc-001', 'close')).rejects.toMatchObject({ status: 403 });
  expect(await coordinator.actions.perform('campus-inc-001', 'close')).toBe('closed');
  expect(await coordinator.actions.perform('campus-inc-001', 'reopen')).toBe('assigned');
  const input = { category: 'connectivity', description: 'Falla ficticia', location: 'Zona ficticia' };
  await expect(coordinator.repository.createIncident(input, 'week06-forbidden-create')).rejects.toMatchObject({ status: 403 });
  expect((await reporter.repository.createIncident(input, 'week06-reporter-create')).status).toBe('open');
  const otherReporter = await client('reporter-2');
  expect(await otherReporter.repository.getIncidents()).toEqual([]);
});

test('expiración concurrente renueva por HTTP y logout elimina lo persistido', async () => {
  const technician = await client('technician-1');
  const refresh = jest.spyOn(technician.transport, 'refresh');
  technician.clock(60000);
  await Promise.all([
    technician.repository.getIncidents(), technician.repository.getIncidents(), technician.repository.getIncidents(),
  ]);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(technician.manager.view().role).toBe('technician');
  await technician.manager.logout();
  expect(technician.saved()).toBeNull();
  expect(technician.manager.view().status).toBe('anonymous');
});

test('el fixture rechaza un segundo refresh y la app vuelve a no autenticado', async () => {
  const technician = await client('technician-1');
  technician.clock(60000);
  await technician.repository.getIncidents();
  technician.clock(120000);
  await expect(technician.repository.getIncidents()).rejects.toThrow();
  expect(technician.manager.view().status).toBe('anonymous');
  expect(technician.saved()).toBeNull();
});
