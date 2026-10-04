import { RemoteError } from '../../src/campusops/domain/remoteError';
import {
  FetchLike,
  HttpIncidentRepository,
} from '../../src/campusops/infrastructure/httpIncidentRepository';

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

async function errorOf(promise: Promise<unknown>): Promise<RemoteError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RemoteError) return error;
    throw error;
  }
  throw new Error('se esperaba un RemoteError y no hubo error');
}

describe('cliente HTTP: respuestas rechazadas (rejected)', () => {
  test('403 en getIncidents produce RemoteError con kind rejected y status 403', async () => {
    const body = 'cuerpo-sensible-no-debe-aparecer-403';
    const error = await errorOf(repo(reply(403, body)).getIncidents());
    expect(error.kind).toBe('rejected');
    expect(error.status).toBe(403);
    expect(error.message).not.toContain(body);
  });

  test('422 en getIncidentById produce RemoteError con kind rejected y status 422', async () => {
    const body = 'cuerpo-sensible-no-debe-aparecer-422';
    const error = await errorOf(repo(reply(422, body)).getIncidentById('campus-inc-001'));
    expect(error.kind).toBe('rejected');
    expect(error.status).toBe(422);
    expect(error.message).not.toContain(body);
  });

  test('404 en getIncidentById NO es rejected: devuelve null', async () => {
    const incident = await repo(reply(404, 'no encontrado')).getIncidentById('campus-inc-001');
    expect(incident).toBeNull();
  });
});