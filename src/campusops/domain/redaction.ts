export const REDACTED = '[REDACTED]';

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

const SENSITIVE_KEYS = new Set(
  [
    'authorization', 'password', 'token', 'accessToken', 'refreshToken',
    'email', 'displayName', 'name', 'userId', 'reporterId', 'technicianId',
    'assignedTechnicianId', 'location', 'latitude', 'longitude', 'photos',
    'evidence', 'internalComments', 'assignmentHistory',
  ].map(normalizeKey),
);

// Devuelve una copia sanitizada; nunca modifica la entrada original.
export function redactSensitive(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redactSensitive);
  if (input !== null && typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      output[key] = SENSITIVE_KEYS.has(normalizeKey(key)) ? REDACTED : redactSensitive(value);
    }
    return output;
  }
  return input;
}
