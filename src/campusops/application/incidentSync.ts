import type { IncidentRepository } from '../domain/incident';
import type { PendingIncidentOperation } from '../contracts';

export type OfflineStartErrorCode =
  | 'incident_not_found'
  | 'technician_not_assigned'
  | 'invalid_base_version'
  | 'invalid_operation_id';

export class OfflineStartError extends Error {
  readonly code: OfflineStartErrorCode;

  constructor(code: OfflineStartErrorCode, message: string) {
    super(message);
    Object.setPrototypeOf(this, OfflineStartError.prototype);
    this.name = 'OfflineStartError';
    this.code = code;
  }
}

export interface PendingIncidentOperationQueue {
  enqueue(operation: PendingIncidentOperation): Promise<void>;
}

export interface QueueOfflineStartInput {
  incidentRepository: Pick<IncidentRepository, 'getIncidentById'>;
  operationQueue: PendingIncidentOperationQueue;
  incidentId: string;
  actorId: string;
  operationId: string;
  baseVersion?: unknown;
}

function isValidBaseVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export async function queueOfflineStart(input: QueueOfflineStartInput): Promise<PendingIncidentOperation> {
  const incident = await input.incidentRepository.getIncidentById(input.incidentId);
  if (incident === null) {
    throw new OfflineStartError('incident_not_found', 'No se encontró la incidencia');
  }
  if (incident.assignedTechnicianId !== input.actorId) {
    throw new OfflineStartError('technician_not_assigned', 'El técnico no está asignado a la incidencia');
  }
  if (!isValidBaseVersion(input.baseVersion)) {
    throw new OfflineStartError('invalid_base_version', 'La versión base debe ser un entero no negativo');
  }
  if (input.operationId.trim().length === 0) {
    throw new OfflineStartError('invalid_operation_id', 'La operación debe tener una identidad estable');
  }

  const operation: PendingIncidentOperation = {
    operationId: input.operationId,
    incidentId: incident.id,
    baseVersion: input.baseVersion,
    actorId: input.actorId,
    action: 'start',
    payload: {},
  };
  await input.operationQueue.enqueue(operation);
  return operation;
}
