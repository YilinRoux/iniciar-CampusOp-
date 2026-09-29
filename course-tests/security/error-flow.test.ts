import { getIncidents } from '../../src/campusops/application/getIncidents';
import { createInMemoryTelemetrySink } from '../../src/campusops/infrastructure/inMemoryTelemetrySink';
import { Incident, IncidentRepository } from '../../src/campusops/domain/incident';

function failingRepository(message: string): IncidentRepository {
  return {
    async getIncidents(): Promise<Incident[]> {
      throw new Error(message);
    },
    async getIncidentById(): Promise<Incident | null> {
      throw new Error(message);
    },
  };
}

test('un fallo real del repositorio se reporta sanitizado a traves del sink de composicion', async () => {
  const { sink, entries } = createInMemoryTelemetrySink();
  const repository = failingRepository('fallo con Authorization: Bearer tok-real-123 al leer incidentes');

  await expect(getIncidents(repository, sink)).rejects.toThrow();

  expect(entries).toHaveLength(1);
  expect(entries[0]).not.toContain('tok-real-123');
  expect(entries[0]).toContain('getIncidents');
});
