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

// Enmascara secretos incrustados en texto libre (por ejemplo, mensajes de error).
export function redactText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\b(access_?token|refresh_?token|password|token)=[^&\s]+/gi, `$1=${REDACTED}`);
}
