import { GeocodingAdapter } from '../../src/campusops/infrastructure/geocodingAdapter';
import type { FetchLike } from '../../src/campusops/infrastructure/httpIncidentRepository';

const validLocation = {
  label: 'Laboratorio ficticio A',
  latitude: 19.04,
  longitude: -98.2,
};

function response(status: number, data: unknown, retryAfter?: string) {
  return {
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null,
    },
    text: async () => JSON.stringify(data),
  } as Awaited<ReturnType<FetchLike>>;
}

describe('Semana 09 - adaptador de geocodificacion', () => {
  test('consulta una vez y reutiliza la cache', async () => {
    const fetchMock = jest.fn(async () => response(200, validLocation));
    const adapter = new GeocodingAdapter({
      baseUrl: 'http://localhost:4310',
      fetch: fetchMock as FetchLike,
      timeoutMs: 1000,
    });

    const first = await adapter.resolve('Laboratorio A', 'Ubicacion manual');
    const second = await adapter.resolve('laboratorio a', 'Ubicacion manual');

    expect(first.location.source).toBe('provider');
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('respeta Retry-After en un error 429', async () => {
    const delays: number[] = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(429, {}, '2'))
      .mockResolvedValueOnce(response(200, validLocation));

    const adapter = new GeocodingAdapter({
      baseUrl: 'http://localhost:4310',
      fetch: fetchMock as FetchLike,
      timeoutMs: 1000,
      sleep: async (ms) => { delays.push(ms); },
    });

    const result = await adapter.resolve('Laboratorio A', 'Manual');

    expect(result.location.source).toBe('provider');
    expect(result.attempts).toBe(2);
    expect(delays).toEqual([2000]);
  });

  test('rechaza coordenadas invalidas y conserva ubicacion manual', async () => {
    const fetchMock = jest.fn(async () =>
      response(200, { label: 'Invalido', latitude: 999, longitude: 0 }),
    );

    const adapter = new GeocodingAdapter({
      baseUrl: 'http://localhost:4310',
      fetch: fetchMock as FetchLike,
      timeoutMs: 1000,
    });

    const result = await adapter.resolve('Edificio ficticio', 'Entrada principal');

    expect(result.location).toEqual({
      source: 'manual',
      label: 'Entrada principal',
    });
    expect(result.fromCache).toBe(false);
  });

  test('limita reintentos ante errores del servidor', async () => {
    const fetchMock = jest.fn(async () => response(500, {}));
    const adapter = new GeocodingAdapter({
      baseUrl: 'http://localhost:4310',
      fetch: fetchMock as FetchLike,
      timeoutMs: 1000,
      sleep: async () => {},
    });

    const result = await adapter.resolve('Edificio ficticio', 'Ubicacion manual');

    expect(result.location.source).toBe('manual');
    expect(result.attempts).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
