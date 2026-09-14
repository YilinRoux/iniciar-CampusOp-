import { getIncidents } from '../../src/campusops/application/getIncidents';
import { Incident, IncidentRepository } from '../../src/campusops/domain/incident';

const fakeRepository: IncidentRepository = {
  async getIncidents(): Promise<Incident[]> {
    return [{
      id: 'test-1',
      category: 'water',
      description: 'Fuga de prueba',
      location: 'Zona de prueba',
      status: 'open',
      assignedTechnicianId: null,
    }];
  },
  async getIncidentById(): Promise<Incident | null> {
    return null;
  },
};

test('getIncidents delega en el repositorio inyectado sin conocer su implementacion', async () => {
  const incidents = await getIncidents(fakeRepository);
  expect(incidents).toHaveLength(1);
  const [incident] = incidents;
  expect(incident?.category).toBe('water');
});