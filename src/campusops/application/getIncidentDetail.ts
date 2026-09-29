import { Incident, IncidentRepository } from '../domain/incident';
import { reportError, LogSink } from './reportError';

export async function getIncidentDetail(
  repository: IncidentRepository,
  id: string,
  onError: LogSink = () => {},
): Promise<Incident | null> {
  try {
    return await repository.getIncidentById(id);
  } catch (error) {
    reportError(onError, error, { operation: 'getIncidentDetail', incidentId: id });
    throw error;
  }
}
