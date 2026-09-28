import { reportError } from '../../src/campusops/application/reportError';
import { SecureKeyValue, SecureSessionStore } from '../../src/campusops/infrastructure/secureSessionStore';

function fakeBackend(): SecureKeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async setItemAsync(key: string, value: string) { data.set(key, value); },
    async getItemAsync(key: string) { return data.get(key) ?? null; },
    async deleteItemAsync(key: string) { data.delete(key); },
  };
}

test('la sesion vive solo en el almacen seguro y desaparece al cerrarla', async () => {
  const backend = fakeBackend();
  const store = new SecureSessionStore(backend);
  await store.save('tok-ficticio-123');
  expect(await store.load()).toBe('tok-ficticio-123');
  expect([...backend.data.keys()]).toEqual(['campusops.session']);
  await store.clear();
  expect(await store.load()).toBeNull();
  expect(backend.data.size).toBe(0);
});

test('el registro de errores no contiene token ni datos personales pero conserva contexto tecnico', () => {
  const lines: string[] = [];
  reportError(
    (line) => lines.push(line),
    new Error('Fallo con Authorization: Bearer tok-ficticio-123'),
    { profile: { email: 'persona@campusops.test' }, incidentId: 'campus-inc-001', attempt: 1 },
  );
  const output = lines.join('\n');
  expect(output).not.toContain('tok-ficticio-123');
  expect(output).not.toContain('persona@campusops.test');
  expect(output).toContain('campus-inc-001');
});

test('un error que no es Error tambien se sanitiza', () => {
  const lines: string[] = [];
  reportError((line) => lines.push(line), 'intento con token=abc123 fallido');
  expect(lines.join('\n')).not.toContain('abc123');
});
