import { reportError } from '../../src/campusops/application/reportError';
import { RemoteError } from '../../src/campusops/domain/remoteError';
import { toIncident } from '../../src/campusops/infrastructure/incidentMapper';
import {
  FetchLike,
  HttpIncidentRepository,
} from '../../src/campusops/infrastructure/httpIncidentRepository';

const payload = {
  category: 'connectivity',
  description: 'Falla ficticia',
  location: 'Edificio de prueba A',
  reporterId: 'reporter-1',
  assignedTechnicianId: 'technician-1',
};
const envelope = (p: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => ({
  id: 'campus-inc-001',
  version: 1,
  status: 'assigned',
  payload: p,
  ...extra,
});

function reply(status: number, body: string, headers: Record<string, string> = {}): FetchLike {
  return async () => ({
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  });
}

function repo(fetch: FetchLike, timeoutMs = 50) {
  return new HttpIncidentRepository({
    baseUrl: 'http://test',
    actorId: 'coordinator-1',
    token: 'course-valid-token',
    fetch,
    timeoutMs,
  });
}

const hangUntilAbort: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });

async function errorOf(promise: Promise<unknown>): Promise<RemoteError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RemoteError) return error;
    throw error;
  }
  throw new Error('se esperaba un RemoteError y no hubo error');
}

describe('cliente HTTP: datos validos y vacios', () => {
  test('respuesta valida: detalle se mapea a Incident de dominio', async () => {
    const incident = await repo(reply(200, JSON.stringify(envelope(payload)))).getIncidentById('campus-inc-001');
    expect(incident).toEqual({
      id: 'campus-inc-001',
      category: 'connectivity',
      description: 'Falla ficticia',
      location: 'Edificio de prueba A',
      status: 'assigned',
      assignedTechnicianId: 'technician-1',
    });
    expect(incident).not.toHaveProperty('reporterId');
  });

  test('payload null valido: detalle devuelve null, no error ni datos inventados', async () => {
    const incident = await repo(reply(200, JSON.stringify(envelope(null)))).getIncidentById('campus-inc-001');
    expect(incident).toBeNull();
  });

  test('lista: omite elementos con payload null y mapea el resto', async () => {
    const body = JSON.stringify({ items: [envelope(payload), envelope(null, { id: 'campus-inc-002' })] });
    const incidents = await repo(reply(200, body)).getIncidents();
    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.id).toBe('campus-inc-001');
  });

  test('campos extra del sobre se ignoran', async () => {
    const incident = await repo(reply(200, JSON.stringify(envelope(payload, { future: 'x' })))).getIncidentById('campus-inc-001');
    expect(incident?.id).toBe('campus-inc-001');
  });

  test('404 en detalle devuelve null', async () => {
    expect(await repo(reply(404, '{"code":"not_found"}')).getIncidentById('nope')).toBeNull();
  });
});

describe('cliente HTTP: fallas', () => {
  test('JSON malformado -> invalid_response', async () => {
    const error = await errorOf(repo(reply(200, '{"items": [')).getIncidents());
    expect(error.kind).toBe('invalid_response');
  });

  test('objeto con forma invalida (version como texto) -> invalid_response', async () => {
    const bad = { ...envelope(payload), version: '1' };
    const error = await errorOf(repo(reply(200, JSON.stringify(bad))).getIncidentById('campus-inc-001'));
    expect(error.kind).toBe('invalid_response');
  });

  test('estado fuera del dominio -> invalid_response', async () => {
    const bad = { ...envelope(payload), status: 'teleported' };
    const error = await errorOf(repo(reply(200, JSON.stringify(bad))).getIncidentById('campus-inc-001'));
    expect(error.kind).toBe('invalid_response');
  });

  test('un elemento corrupto invalida toda la lista', async () => {
    const body = JSON.stringify({ items: [envelope(payload), { id: '', version: 1, status: 'open', payload: null }] });
    const error = await errorOf(repo(reply(200, body)).getIncidents());
    expect(error.kind).toBe('invalid_response');
  });

  test('lista sin items -> invalid_response', async () => {
    const error = await errorOf(repo(reply(200, '{}')).getIncidents());
    expect(error.kind).toBe('invalid_response');
  });

  test('timeout -> timeout', async () => {
    const error = await errorOf(repo(hangUntilAbort, 20).getIncidents());
    expect(error.kind).toBe('timeout');
  });

  test('500 -> server_error', async () => {
    const error = await errorOf(repo(reply(500, '{"code":"controlled_failure"}')).getIncidents());
    expect(error.kind).toBe('server_error');
    expect(error.status).toBe(500);
  });

  test('429 -> rate_limited con retryAfterMs', async () => {
    const error = await errorOf(repo(reply(429, '{"code":"rate_limited"}', { 'retry-after': '1' })).getIncidents());
    expect(error.kind).toBe('rate_limited');
    expect(error.retryAfterMs).toBe(1000);
  });

  test('red caida -> network_error', async () => {
    const failing: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };
    const error = await errorOf(repo(failing).getIncidents());
    expect(error.kind).toBe('network_error');
  });

  test('4xx -> rejected', async () => {
    const error = await errorOf(repo(reply(403, '{"code":"forbidden"}')).getIncidents());
    expect(error.kind).toBe('rejected');
  });
});

describe('cliente HTTP: crear', () => {
  const created = {
    incident: { id: 'campus-inc-101', version: 1, status: 'open', payload: { ...payload, assignedTechnicianId: null } },
    operationId: 'create-operation-0001',
    duplicate: false,
  };
  const input = { category: 'connectivity', description: 'Falla ficticia', location: 'Edificio de prueba A' };

  test('desenvuelve la respuesta y manda Idempotency-Key', async () => {
    const calls: Parameters<FetchLike>[1][] = [];
    const fetch: FetchLike = async (_url, init) => {
      calls.push(init);
      return { status: 201, headers: { get: () => null }, text: async () => JSON.stringify(created) };
    };
    const incident = await repo(fetch).createIncident(input, 'create-operation-0001');
    expect(incident.id).toBe('campus-inc-101');
    expect(incident.status).toBe('open');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers['Idempotency-Key']).toBe('create-operation-0001');
  });

  test('reintento tras timeout reutiliza la misma clave', async () => {
    const keys: (string | undefined)[] = [];
    let attempt = 0;
    const fetch: FetchLike = (_url, init) => {
      keys.push(init.headers['Idempotency-Key']);
      attempt += 1;
      if (attempt === 1) return hangUntilAbort(_url, init);
      return Promise.resolve({
        status: 201,
        headers: { get: () => null },
        text: async () => JSON.stringify({ ...created, duplicate: true }),
      });
    };
    const client = repo(fetch, 20);
    const first = await errorOf(client.createIncident(input, 'create-operation-0001'));
    expect(first.kind).toBe('timeout');
    const second = await client.createIncident(input, 'create-operation-0001');
    expect(second.id).toBe('campus-inc-101');
    expect(keys).toEqual(['create-operation-0001', 'create-operation-0001']);
  });

  test('crear con payload null -> invalid_response', async () => {
    const body = JSON.stringify({ incident: { id: 'x', version: 1, status: 'open', payload: null } });
    const error = await errorOf(repo(reply(201, body)).createIncident(input, 'create-operation-0001'));
    expect(error.kind).toBe('invalid_response');
  });

  test('clave corta rechazada por el servidor -> rejected', async () => {
    const error = await errorOf(repo(reply(400, '{"code":"idempotency_key_required"}')).createIncident(input, 'demo-1'));
    expect(error.kind).toBe('rejected');
  });
});

describe('separacion DTO / dominio y logs', () => {
  test('toIncident descarta campos internos del DTO', () => {
    const incident = toIncident(envelope({ ...payload, internalComments: ['secreto'], history: [] }));
    expect(Object.keys(incident ?? {}).sort()).toEqual(
      ['assignedTechnicianId', 'category', 'description', 'id', 'location', 'status'],
    );
  });

  test('un error remoto no filtra datos sensibles en el log', async () => {
    const lines: string[] = [];
    const error = await errorOf(repo(reply(500, JSON.stringify({ location: 'Edificio de prueba A' }))).getIncidents());
    reportError((line) => lines.push(line), error, {
      operation: 'getIncidents',
      location: 'Edificio de prueba A',
      assignedTechnicianId: 'technician-1',
    });
    const output = lines.join('\n');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('Edificio de prueba A');
    expect(output).not.toContain('technician-1');
    expect(output).not.toContain('course-valid-token');
  });
});
