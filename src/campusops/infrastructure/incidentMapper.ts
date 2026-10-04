import type { Incident, IncidentStatus } from '../domain/incident';
import { parseRemoteEnvelope } from '../domain/remoteResource';
import { RemoteError } from '../domain/remoteError';

const STATUSES: readonly string[] = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
const invalid = () => new RemoteError('invalid_response', 'Respuesta remota invalida');

// null = sobre valido con payload null: no se inventan datos.
export function toIncident(raw: unknown): Incident | null {
  const parsed = parseRemoteEnvelope(raw);
  if (!parsed.ok) throw invalid();
  const { id, status, payload } = parsed.value;
  if (payload === null) return null;

  const { category, description, location } = payload;
  const technician = payload.assignedTechnicianId ?? null;
  if (
    !STATUSES.includes(status) ||
    typeof category !== 'string' || typeof description !== 'string' || typeof location !== 'string' ||
    (technician !== null && typeof technician !== 'string')
  ) {
    throw invalid();
  }
  return { id, category, description, location, status: status as IncidentStatus, assignedTechnicianId: technician };
}