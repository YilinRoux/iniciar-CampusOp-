import { Actor, Incident, IncidentRepository, isIncidentVisibleToActor } from '../domain/incident';

export type IncidentDetailResult =
  | { status: 'ok'; incident: Incident }
  | { status: 'not_found' }
  | { status: 'forbidden' };

export async function getIncidentDetail(
  repository: IncidentRepository,
  id: string,
  actor: Actor,
): Promise<IncidentDetailResult> {
  const incident = await repository.getIncidentById(id);
  if (!incident) return { status: 'not_found' };
  if (!isIncidentVisibleToActor(incident, actor)) return { status: 'forbidden' };
  return { status: 'ok', incident };
}