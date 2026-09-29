import { Incident, IncidentRepository } from '../domain/incident';
import { reportError, LogSink } from './reportError';

export async function getIncidents(
  repository: IncidentRepository,
  onError: LogSink = () => {},
): Promise<Incident[]> {
  try {
    return await repository.getIncidents();
  } catch (error) {
    reportError(onError, error, { operation: 'getIncidents' });
    throw error;
  }
}
