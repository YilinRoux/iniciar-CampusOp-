import * as http from 'http';

const baseUrl = process.env.CAMPUSOPS_LIVE_BACKEND;
const runLive = baseUrl ? test : test.skip;

type HttpResult = {
  status: number;
  body: unknown;
};

function request(
  path: string,
  actor: string,
  options: {
    method?: string;
    body?: string;
    key?: string;
    scenario?: string;
    timeoutMs?: number;
  } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Authorization: 'Bearer course-valid-token',
      'X-Course-Actor': actor,
      'Content-Type': 'application/json',
    };

    if (options.key) headers['Idempotency-Key'] = options.key;
    if (options.scenario) headers['X-Course-Scenario'] = options.scenario;

    const req = http.request(
      `${baseUrl}${path}`,
      {
        method: options.method ?? 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');

          let body: unknown = null;
          try {
            body = text ? JSON.parse(text) as unknown : null;
          } catch {
            body = text;
          }

          resolve({
            status: res.statusCode ?? 0,
            body,
          });
        });
      },
    );

    req.on('error', reject);

    req.setTimeout(options.timeoutMs ?? 5000, () => {
      req.destroy(new Error('client_timeout'));
    });

    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

function envelope(value: unknown): {
  id: string;
  version: number;
  status: string;
} {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    !('version' in value) ||
    !('status' in value)
  ) {
    throw new Error(`Respuesta inesperada: ${JSON.stringify(value)}`);
  }

  return value as {
    id: string;
    version: number;
    status: string;
  };
}

describe('Semana 09 - backend real y respuesta perdida', () => {
  runLive('reintento con misma clave no duplica una accion', async () => {
    const path = '/v1/incidents/campus-inc-001';
    const actor = 'technician-1';

    const beforeResponse = await request(path, actor);
    expect(beforeResponse.status).toBe(200);

    const before = envelope(beforeResponse.body);

    // La incidencia inicial debe permitir la accion start.
    expect(before.status).toBe('assigned');

    const key = `week09-lost-${Date.now()}`;
    const body = JSON.stringify({
      action: 'start',
      baseVersion: before.version,
    });

    let firstLost = false;

    try {
      await request(`${path}/actions`, actor, {
        method: 'POST',
        key,
        body,
        scenario: 'timeout_after_commit',
        timeoutMs: 300,
      });
    } catch (error) {
      firstLost = true;
      expect(String(error)).toContain('client_timeout');
    }

    expect(firstLost).toBe(true);

    const repeated = await request(`${path}/actions`, actor, {
      method: 'POST',
      key,
      body,
    });

    expect(repeated.status).toBeGreaterThanOrEqual(200);
    expect(repeated.status).toBeLessThan(300);

    const afterResponse = await request(path, actor);
    expect(afterResponse.status).toBe(200);

    const after = envelope(afterResponse.body);

    expect(after.version).toBe(before.version + 1);
    expect(after.status).toBe('in_progress');
  }, 12000);
});
