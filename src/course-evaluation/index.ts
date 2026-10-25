import type {
  AuthEvent,
  JsonObject,
  ParseResult,
  PermissionEvent,
  RemoteResponse,
  SyncRecord,
} from './contracts';
import type { IncidentLocation } from '../campusops/contracts';
import { redactSensitive } from '../campusops/domain/redaction';
import { parseRemoteEnvelope } from '../campusops/domain/remoteResource';
import { initialSession, transitionSession } from '../campusops/domain/sessionMachine';

function pending(name: string): never {
  throw new Error(`${name} must be implemented in the assigned week`);
}

export function redactForTelemetry(input: unknown): unknown {
  return redactSensitive(input);
}

export function parseRemoteResource(input: unknown): ParseResult {
  return parseRemoteEnvelope(input);
}

export function coordinateRefresh(events: readonly AuthEvent[]): Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}> {
  // El contrato público comienza con una sesión de generación 0 expirada.
  // La app usará este mismo motor desde initialSession() al hacer login.
  let current: ReturnType<typeof initialSession> = {
    ...initialSession(),
    status: 'expired',
    activeGeneration: 0,
    sessionGeneration: 0,
    nextGeneration: 1,
  };

  for (const event of events) {
    current = transitionSession(current, event);
  }

  return {
    status: current.activeGeneration === null ? 'anonymous' : 'authenticated',
    activeGeneration: current.activeGeneration,
    refreshCalls: current.refreshCalls,
    retriedRequestIds: current.retriedRequestIds,
    persistedToken: current.persistedToken,
  };
}

export function resolveSync(
  base: SyncRecord,
  local: SyncRecord,
  remote: SyncRecord,
): Readonly<
  | { kind: 'merged'; fields: JsonObject }
  | { kind: 'conflict'; fields: readonly string[] }
> {
  // Compara valores JSON por contenido, no por referencia.
  // El orden de las propiedades de los objetos no afecta el resultado.
  const equal = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) {
      return true;
    }

    if (a === null || b === null) {
      return false;
    }

    if (typeof a !== 'object' || typeof b !== 'object') {
      return false;
    }

    if (Array.isArray(a) || Array.isArray(b)) {
      return (
        Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((value, index) => equal(value, b[index]))
      );
    }

    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) &&
          equal(left[key], right[key]),
      )
    );
  };

  // Objeto mutable durante la construcción del resultado.
  const merged: Record<string, unknown> = {};
  const conflicts: string[] = [];

  // Incluye todos los campos presentes en cualquiera de los registros.
  const keys = new Set([
    ...Object.keys(base.fields),
    ...Object.keys(local.fields),
    ...Object.keys(remote.fields),
  ]);

  for (const key of keys) {
    const baseValue = base.fields[key];
    const localValue = local.fields[key];
    const remoteValue = remote.fields[key];

    const localChanged = !equal(localValue, baseValue);
    const remoteChanged = !equal(remoteValue, baseValue);

    // Si ambos cambiaron el mismo campo de manera diferente,
    // se registra un conflicto sin sobrescribir ninguno.
    if (
      localChanged &&
      remoteChanged &&
      !equal(localValue, remoteValue)
    ) {
      conflicts.push(key);
      continue;
    }

    // Prioriza el cambio local si el remoto no entra en conflicto.
    if (localChanged) {
      if (Object.prototype.hasOwnProperty.call(local.fields, key)) {
        merged[key] = localValue;
      }
    } else if (Object.prototype.hasOwnProperty.call(remote.fields, key)) {
      // Conserva los cambios remotos cuando el campo local no cambió.
      merged[key] = remoteValue;
    }
  }

  // Los conflictos se devuelven ordenados alfabéticamente.
  if (conflicts.length > 0) {
    return {
      kind: 'conflict',
      fields: conflicts.sort(),
    };
  }

  return {
    kind: 'merged',
    fields: merged,
  };
}

export function deduplicateOperations<
  T extends Readonly<{ operationId: string }>
>(
  operations: readonly T[],
): readonly T[] {
  const seen = new Set<string>();

  return operations.filter((operation) => {
    // Conserva únicamente la primera aparición de cada operationId.
    if (seen.has(operation.operationId)) {
      return false;
    }

    seen.add(operation.operationId);
    return true;
  });
}

export function planRetry(_input: Readonly<{
  method: 'GET' | 'POST';
  status: number | 'timeout';
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>): Readonly<{
  retry: boolean;
  delayMs: number;
  requiresStableIdempotencyKey: boolean;
}> {
  return pending('planRetry');
}

export function reduceRemoteResponses(_input: Readonly<{
  activeRequestId: string;
  responses: readonly RemoteResponse[];
}>): Readonly<{
  state: 'success' | 'error' | 'loading';
  value?: unknown;
  error?: string;
}> {
  return pending('reduceRemoteResponses');
}

export function reducePermissionLifecycle(
  _events: readonly PermissionEvent[],
): Readonly<{
  status: 'available' | 'denied' | 'blocked';
  resourceActive: boolean;
}> {
  return pending('reducePermissionLifecycle');
}

/** Week 09: see docs/CAMPUSOPS_API.md; this is not a completed solution. */
export function selectIncidentLocation(
  _provider: unknown,
  _manualLabel: string,
): IncidentLocation {
  return pending('selectIncidentLocation');
}