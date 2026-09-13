import { Incident, IncidentRepository } from '../domain/incident';

export async function getIncidents(repository: IncidentRepository): Promise<Incident[]> {
  return repository.getIncidents();
}
