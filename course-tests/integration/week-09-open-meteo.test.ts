import { OpenMeteoGeocoding } from '../../src/campusops/infrastructure/openMeteoGeocoding';
import type { FetchLike } from '../../src/campusops/infrastructure/httpIncidentRepository';

const puebla = {
  results: [{
    name: 'Puebla de Zaragoza',
    admin1: 'Estado de Puebla',
    country: 'México',
    latitude: 19.04778,
    longitude: -98.20723,
  }],
};

function response(status: number, payload: unknown, retryAfter?: string) {
  return {
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null,
    },
    text: async () => JSON.stringify(payload),
  } as Awaited<ReturnType<FetchLike>>;
}

describe('Semana 09 - proveedor externo Open-Meteo', () => {
  test('interpreta la respuesta real del proveedor', async () => {
    const fetchMock = jest.fn(async () => response(200, puebla));
    const adapter = new OpenMeteoGeocoding({
      fetch: fetchMock as FetchLike,
      timeoutMs: 1000,
    });

    const result = await adapter.resolve('Puebla', 'Edificio ficticio');

    expect(result.location).toEqual({
      source: 'provider',
      label: 'Puebla de Zaragoza, Estado de Puebla, México',
      latitude: 19.04778,
      longitude: -98.20723,
    });
    expect(result.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('geocoding-api.open-meteo.com/v1/search'),
      expect.objectContaining({ method: 'GET', headers: {} }),
    );
  });

  test('reutiliza cache sin repetir la consulta', async () => {
    const fetchMock = jest.fn(async () => response(200, puebla));
    const adapter = new OpenMeteoGeocoding({
      fetch: fetchMock as FetchLike,
      timeoutMs: 1000,
    });

    await adapter.resolve('Puebla', 'Manual');
    const second = await adapter.resolve('puebla', 'Manual');

    expect(second.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('respeta Retry-After ante 429', async () => {
    const delays: number[] = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(429, {}, '2'))
      .mockResolvedValueOnce(response(200, puebla));

    const adapter = new OpenMeteoGeocoding({
      fetch: fetchMock as FetchLike,
      timeoutMs: 1000,
      sleep: async (ms) => { delays.push(ms); },
    });

    const result = await adapter.resolve('Puebla', 'Manual');

    expect(result.location.source).toBe('provider');
    expect(result.attempts).toBe(2);
    expect(delays).toEqual([2000]);
  });

  test('rechaza coordenadas invalidas y usa ubicacion manual', async () => {
    const fetchMock = jest.fn(async () => response(200, {
      results: [{
        name: 'Lugar incorrecto',
        latitude: 999,
        longitude: -98,
      }],
    }));

    const adapter = new OpenMeteoGeocoding({
      fetch: fetchMock as FetchLike,
      timeoutMs: 1000,
    });

    const result = await adapter.resolve('Lugar', 'Laboratorio ficticio');

    expect(result.location).toEqual({
      source: 'manual',
      label: 'Laboratorio ficticio',
    });
  });

  test('JSON malformado no provoca reintentos innecesarios', async () => {
    const fetchMock = jest.fn(async () => ({
      status: 200,
      headers: { get: () => null },
      text: async () => '{json incorrecto',
    } as Awaited<ReturnType<FetchLike>>));

    const adapter = new OpenMeteoGeocoding({
      fetch: fetchMock as FetchLike,
      timeoutMs: 1000,
    });

    const result = await adapter.resolve('Puebla', 'Ubicacion manual');

    expect(result.location.source).toBe('manual');
    expect(result.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
