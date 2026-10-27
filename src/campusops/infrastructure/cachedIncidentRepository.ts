import type { Incident, IncidentRepository } from '../domain/incident';
import type { SqliteIncidentStore } from './sqliteIncidentStore';

export class CachedIncidentRepository implements IncidentRepository {
  constructor(
    private readonly remote: IncidentRepository,
    private readonly store: Promise<SqliteIncidentStore>,
  ) {}

  async getIncidents(): Promise<Incident[]> {
    try {
      const incidents = await this.remote.getIncidents();
      const database = await this.store;

      for (const incident of incidents) {
        if (incident.version !== undefined) {
          await database.saveIncident(incident);
        }
      }

      return incidents;
    } catch (error) {
      // Sin conexión, no devolvemos incidencias de otros usuarios.
      throw error;
    }
  }

  async getIncidentById(id: string): Promise<Incident | null> {
    try {
      const incident = await this.remote.getIncidentById(id);

      if (incident !== null && incident.version !== undefined) {
        await (await this.store).saveIncident(incident);
      }

      return incident;
    } catch (error) {
      // El fallback local se conectará cuando filtremos por actor.
      throw error;
    }
  }
}
