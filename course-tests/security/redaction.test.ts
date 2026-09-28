import { redactForTelemetry } from '../../src/course-evaluation';

test('sanitiza estructuras anidadas y listas con claves snake_case y kebab-case', () => {
  const result = redactForTelemetry({
    events: [{ user: { access_token: 'abc', email: 'a@campusops.test' }, incidentId: 'campus-inc-001', attempt: 2 }],
    meta: { 'refresh-token': 'r', durationMs: 5 },
  });
  expect(result).toEqual({
    events: [{ user: { access_token: '[REDACTED]', email: '[REDACTED]' }, incidentId: 'campus-inc-001', attempt: 2 }],
    meta: { 'refresh-token': '[REDACTED]', durationMs: 5 },
  });
});

test('no modifica la entrada original', () => {
  const input = { profile: { email: 'a@campusops.test' }, photos: ['synthetic-photo-1'] };
  const snapshot = JSON.parse(JSON.stringify(input));
  redactForTelemetry(input);
  expect(input).toEqual(snapshot);
});

test('conserva primitivos y null', () => {
  expect(redactForTelemetry(null)).toBeNull();
  expect(redactForTelemetry('texto')).toBe('texto');
  expect(redactForTelemetry([1, 'a'])).toEqual([1, 'a']);
});
