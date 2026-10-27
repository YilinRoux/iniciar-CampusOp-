import { deduplicateOperations, resolveSync } from '../../course-evaluation';
import type { PendingIncidentOperation } from '../contracts';
import type { Incident } from '../domain/incident';
import { RemoteError } from '../domain/remoteError';

type IncidentWork = {
  assignedTechnicianId: string | null;
  status: Incident['status'];
};

export interface SyncStore {
  getPendingOperations(): Promise<PendingIncidentOperation[]>;
  removeConfirmedOperation(operationId: string): Promise<void>;
}

export interface SyncTransport {
  send(operation: PendingIncidentOperation): Promise<void>;
}

export function detectIncidentConflict(
  base: Incident,
  local: Incident,
  remote: Incident,
) {
  const fields = (incident: Incident) => ({
    work: {
      assignedTechnicianId: incident.assignedTechnicianId,
      status: incident.status,
    } satisfies IncidentWork,
  });

  if (
    base.id !== local.id ||
    base.id !== remote.id ||
    base.version === undefined ||
    local.version === undefined ||
    remote.version === undefined
  ) {
    throw new Error('No se puede sincronizar sin identidad y versiones validas');
  }

  return resolveSync(
    { id: base.id, version: base.version, fields: fields(base) },
    { id: local.id, version: local.version, fields: fields(local) },
    { id: remote.id, version: remote.version, fields: fields(remote) },
  );
}

export async function synchronizePendingOperations(
  store: SyncStore,
  transport: SyncTransport,
  actorId: string,
): Promise<{
  confirmed: string[];
  pending: string[];
  conflicts: string[];
}> {
  const operations = deduplicateOperations(
    await store.getPendingOperations(),
  );

  const confirmed: string[] = [];
  const pending: string[] = [];
  const conflicts: string[] = [];

  for (const operation of operations) {
    if (operation.actorId !== actorId) {
      pending.push(operation.operationId);
      continue;
    }

    try {
      await transport.send(operation);
      await store.removeConfirmedOperation(operation.operationId);
      confirmed.push(operation.operationId);
    } catch (error) {
      // Un 409, una desconexión o un timeout NO eliminan la operación.
      pending.push(operation.operationId);

      if (error instanceof RemoteError && error.status === 409) {
        conflicts.push(operation.operationId);
      }
    }
  }

  return { confirmed, pending, conflicts };
}

export interface OfflineIncidentStore extends SyncStore {
  getIncident(id: string): Promise<Incident | null>;
  enqueue(operation: PendingIncidentOperation): Promise<void>;
}

export async function queueOfflineStart(
  store: OfflineIncidentStore,
  incidentId: string,
  actorId: string,
  operationId: string,
): Promise<PendingIncidentOperation> {
  const existing = (await store.getPendingOperations()).find(
    (operation) =>
      operation.incidentId === incidentId &&
      operation.actorId === actorId &&
      operation.action === 'start',
  );

  if (existing !== undefined) {
    return existing;
  }

  const base = await store.getIncident(incidentId);

  if (
    base === null ||
    base.version === undefined ||
    !Number.isSafeInteger(base.version) ||
    base.version < 0
  ) {
    throw new Error('No hay una incidencia local con version valida');
  }

  if (base.assignedTechnicianId !== actorId || base.status !== 'assigned') {
    throw new Error('La incidencia no esta asignada al tecnico');
  }

  const operation: PendingIncidentOperation = {
    operationId,
    incidentId,
    actorId,
    baseVersion: base.version,
    action: 'start',
    payload: {
      baseIncident: base,
    },
  };

  await store.enqueue(operation);
  return operation;
}
