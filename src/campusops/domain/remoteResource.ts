import type { JsonObject, ParseResult } from '../../course-evaluation/contracts';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseRemoteEnvelope(input: unknown): ParseResult {
  if (!isPlainObject(input)) return { ok: false, error: 'contract' };
  const { id, version, status, payload } = input;
  if (!isNonEmptyString(id) || !isNonEmptyString(status)) return { ok: false, error: 'contract' };
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    return { ok: false, error: 'contract' };
  }
  if (payload !== null && !isPlainObject(payload)) return { ok: false, error: 'contract' };
  return { ok: true, value: { id, version, status, payload: payload as JsonObject | null } };
}