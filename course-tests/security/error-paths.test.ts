import { reportError } from '../../src/campusops/application/reportError';

function capture(error: unknown, context: Record<string, unknown> = {}): string {
  const lines: string[] = [];
  reportError((line) => lines.push(line), error, context);
  return lines.join('\n');
}

test('un error de red con cabecera Authorization no deja el token en el registro', () => {
  const output = capture(new Error('POST /v1/incidents fallo: Authorization: Bearer tok-ficticio-777'));
  expect(output).not.toContain('tok-ficticio-777');
});

test('el registro solo contiene level, message y context, sin la pila del error', () => {
  const output = capture(new Error('fallo simulado'));
  expect(Object.keys(JSON.parse(output))).toEqual(['level', 'message', 'context']);
});

test('el contexto con listas anidadas se sanitiza y conserva datos tecnicos', () => {
  const output = capture(new Error('fallo'), {
    attempts: [{ attempt: 1, reporterId: 'reporter-1' }, { attempt: 2, photos: ['synthetic-photo-1'] }],
    correlationId: 'corr-001',
  });
  expect(output).not.toContain('reporter-1');
  expect(output).not.toContain('synthetic-photo-1');
  expect(output).toContain('corr-001');
});

test('el contexto original no se modifica al registrar el error', () => {
  const context = { profile: { email: 'persona@campusops.test' } };
  const snapshot = JSON.parse(JSON.stringify(context));
  capture(new Error('fallo'), context);
  expect(context).toEqual(snapshot);
});