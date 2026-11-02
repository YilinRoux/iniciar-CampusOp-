import { planRetry } from '../../src/course-evaluation';

// Semana 09 (Abraham): casos límite de la política de reintentos e
// idempotencia. Se prueba la función real planRetry; devuelve la
// planificación, así que no se usan temporizadores ni esperas reales.

describe('Semana 09 (Abraham): política de reintentos e idempotencia', () => {
  test('1. límite de intentos: GET con 500 en el intento 4 ya no se reintenta', () => {
    expect(planRetry({ method: 'GET', status: 500, attempt: 4 })).toEqual({
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: false,
    });
  });

  test('2. POST sin clave estable no se reintenta y exige una clave', () => {
    expect(planRetry({ method: 'POST', status: 'timeout', attempt: 1 })).toEqual({
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: true,
    });
  });

  test('3. POST con clave estable sí se puede reintentar y ya no exige clave', () => {
    const plan = planRetry({
      method: 'POST',
      status: 'timeout',
      attempt: 1,
      idempotencyKey: 'operacion-ficticia-001',
    });

    expect(plan.retry).toBe(true);
    expect(plan.requiresStableIdempotencyKey).toBe(false);
  });

  test('4. HTTP 429 usa Retry-After como espera', () => {
    expect(
      planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 2000 }),
    ).toEqual({
      retry: true,
      delayMs: 2000,
      requiresStableIdempotencyKey: false,
    });
  });

  test('5. backoff progresivo de 500, 1000 y 2000 ms; sin reintento desde el intento 4', () => {
    const delays = [1, 2, 3].map((attempt) => {
      const plan = planRetry({ method: 'GET', status: 500, attempt });
      expect(plan.retry).toBe(true);
      return plan.delayMs;
    });

    expect(delays).toEqual([500, 1000, 2000]);
    expect(planRetry({ method: 'GET', status: 500, attempt: 4 }).retry).toBe(false);
  });

  test('6. HTTP 400 no se reintenta', () => {
    expect(planRetry({ method: 'GET', status: 400, attempt: 1 })).toEqual({
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: false,
    });
  });
});