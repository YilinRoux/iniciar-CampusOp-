import { Incident, IncidentRepository } from '../domain/incident';

export async function getIncidentDetail(repository: IncidentRepository, id: string): Promise<Incident | null> {
  return repository.getIncidentById(id);
}
