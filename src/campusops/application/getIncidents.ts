import { Actor, Incident, IncidentRepository, isIncidentVisibleToActor } from '../domain/incident';

export async function getIncidents(repository: IncidentRepository, actor: Actor): Promise<Incident[]> {
  const incidents = await repository.getIncidents();
  return incidents.filter((incident) => isIncidentVisibleToActor(incident, actor));
}