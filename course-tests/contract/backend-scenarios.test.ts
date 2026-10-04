import * as http from 'http';

import { RemoteError } from '../../src/campusops/domain/remoteError';
import { FetchLike, HttpIncidentRepository } from '../../src/campusops/infrastructure/httpIncidentRepository';

// Corrida real contra el backend didactico. Solo se ejecuta si se define
// CAMPUSOPS_LIVE_BACKEND (por ejemplo http://127.0.0.1:4310); sin esa variable
// se omite, para que las pruebas nunca dependan de un servicio real.
const liveUrl = process.env.CAMPUSOPS_LIVE_BACKEND;
const describeLive = liveUrl === undefined || liveUrl === '' ? describe.skip : describe;

// Adaptador FetchLike sobre http de Node: el fetch global de Jest/React Native esta simulado.
const nodeFetch: FetchLike = (url, init) =>
  new Promise((resolve, reject) => {
    const req = http.request(url, { method: init.method, headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode ?? 0,
          headers: {
            get: (name: string) => {
              const value = res.headers[name.toLowerCase()];
              return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
            },
          },
          text: async () => body,
        });
      });
    });
    req.on('error', reject);
    init.signal.addEventListener('abort', () => req.destroy(new Error('aborted')));
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });

function client(scenario: string, timeoutMs = 8000, actorId = 'coordinator-1') {
  return new HttpIncidentRepository({
    baseUrl: liveUrl ?? '',
    actorId,
    token: 'course-valid-token',
    fetch: nodeFetch,
    timeoutMs,
    scenario,
  });
}

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    const value = await promise;
    return value === null ? 'null' : 'ok';
  } catch (error) {
    return error instanceof RemoteError ? error.kind : `excepcion-no-controlada:${String(error)}`;
  }
}

describeLive('cliente contra el backend didactico (variantes X-Course-Scenario)', () => {
  test('success -> lista con datos', async () => {
    const incidents = await client('success').getIncidents();
    expect(incidents.length).toBeGreaterThan(0);
  });

  test('nullable -> detalle null, sin error', async () => {
    expect(await client('nullable').getIncidentById('campus-inc-001')).toBeNull();
  });

  test('malformed -> invalid_response', async () => {
    expect(await outcome(client('malformed').getIncidents())).toBe('invalid_response');
  });

  test('server_error -> server_error', async () => {
    expect(await outcome(client('server_error').getIncidents())).toBe('server_error');
  });

  test('rate_limited -> rate_limited con Retry-After', async () => {
    try {
      await client('rate_limited').getIncidents();
      throw new Error('se esperaba rate_limited');
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteError);
      expect((error as RemoteError).kind).toBe('rate_limited');
      expect((error as RemoteError).retryAfterMs).toBe(1000);
    }
  });

  test('slow con timeout corto -> timeout', async () => {
    expect(await outcome(client('slow', 50).getIncidents())).toBe('timeout');
  });

  test('crear con la misma clave dos veces no duplica', async () => {
    const input = { category: 'water', description: 'Fuga simulada', location: 'Zona manual ficticia' };
    const key = `week5-${Date.now()}`;
    const reporter = client('success', 8000, 'reporter-1');
    const first = await reporter.createIncident(input, key);
    const second = await reporter.createIncident(input, key);
    expect(second.id).toBe(first.id);
  });
});