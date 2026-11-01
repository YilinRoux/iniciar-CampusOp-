import { HttpIncidentActions } from '../../src/campusops/infrastructure/httpIncidentActions';
import type { FetchLike } from '../../src/campusops/infrastructure/httpIncidentRepository';

type Request = {
  method: string;
  headers: Record<string, string>;
  body?: string | undefined;
};

const incident = {
  id: 'incident-001',
  version: 1,
  status: 'open',
  payload: {
    category: 'connectivity',
    description: 'Falla ficticia de conexion',
    location: 'Laboratorio A',
  },
};

function reply(status: number, data: unknown, retryAfter?: string) {
  return {
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null,
    },
    text: async () => JSON.stringify(data),
  } as Awaited<ReturnType<FetchLike>>;
}

describe('Semana 09 - reintentos idempotentes de acciones', () => {
  test('conserva clave y cuerpo cuando se pierde la respuesta', async () => {
    const posts: Request[] = [];
    let committed = false;
    let commits = 0;

    const fetchMock: FetchLike = async (_url, init) => {
      if (init.method === 'GET') {
        return reply(200, incident);
      }

      posts.push({
        method: init.method,
        headers: init.headers,
        body: init.body,
      });

      if (!committed) {
        committed = true;
        commits++;
        throw new Error('Respuesta perdida despues del commit');
      }

      return reply(200, {
        incident: { ...incident, status: 'in_progress', version: 2 },
        duplicate: true,
      });
    };

    const actions = new HttpIncidentActions({
      baseUrl: 'http://localhost:4310',
      fetch: fetchMock,
      timeoutMs: 1000,
    });

    const result = await actions.perform('incident-001', 'start');

    expect(result).toBe('in_progress');
    expect(posts).toHaveLength(2);
    expect(posts[0]?.headers['Idempotency-Key']).toBeTruthy();
    expect(posts[0]?.headers['Idempotency-Key'])
      .toBe(posts[1]?.headers['Idempotency-Key']);
    expect(posts[0]?.body).toBe(posts[1]?.body);
    expect(commits).toBe(1);
  }, 10000);

  test('no reintenta una accion rechazada con HTTP 400', async () => {
    let posts = 0;

    const fetchMock: FetchLike = async (_url, init) => {
      if (init.method === 'GET') {
        return reply(200, incident);
      }

      posts++;
      return reply(400, { code: 'invalid_action' });
    };

    const actions = new HttpIncidentActions({
      baseUrl: 'http://localhost:4310',
      fetch: fetchMock,
      timeoutMs: 1000,
    });

    await expect(actions.perform('incident-001', 'start'))
      .rejects.toMatchObject({ status: 400 });

    expect(posts).toBe(1);
  });

  test('respeta Retry-After ante HTTP 429', async () => {
    const delays: number[] = [];
    let posts = 0;

    const fetchMock: FetchLike = async (_url, init) => {
      if (init.method === 'GET') return reply(200, incident);

      posts++;
      if (posts === 1) return reply(429, {}, '2');

      return reply(200, {
        incident: { ...incident, status: 'in_progress', version: 2 },
      });
    };

    const actions = new HttpIncidentActions({
      baseUrl: 'http://localhost:4310',
      fetch: fetchMock,
      timeoutMs: 1000,
      sleep: async (ms) => { delays.push(ms); },
    });

    const result = await actions.perform('incident-001', 'start');

    expect(result).toBe('in_progress');
    expect(posts).toBe(2);
    expect(delays).toEqual([2000]);
  });

  test('detiene los reintentos despues de cuatro errores HTTP 500', async () => {
    const delays: number[] = [];
    let posts = 0;

    const fetchMock: FetchLike = async (_url, init) => {
      if (init.method === 'GET') return reply(200, incident);

      posts++;
      return reply(500, {});
    };

    const actions = new HttpIncidentActions({
      baseUrl: 'http://localhost:4310',
      fetch: fetchMock,
      timeoutMs: 1000,
      sleep: async (ms) => { delays.push(ms); },
    });

    await expect(actions.perform('incident-001', 'start'))
      .rejects.toMatchObject({ status: 500 });

    expect(posts).toBe(4);
    expect(delays).toEqual([500, 1000, 2000]);
  });

});
