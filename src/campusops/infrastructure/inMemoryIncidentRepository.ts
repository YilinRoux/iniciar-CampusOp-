import { Incident, IncidentCreator, IncidentRepository, NewIncident } from '../domain/incident';

const fixtureIncidents: Incident[] = [
  {
    id: 'campus-inc-001',
    category: 'connectivity',
    description: 'Sin conexion en laboratorio ficticio',
    location: 'Edificio de prueba A',
    status: 'assigned',
    assignedTechnicianId: 'technician-1',
  },
  {
    id: 'campus-inc-002',
    category: 'electrical',
    description: 'Falla electrica simulada en laboratorio B',
    location: 'Edificio de prueba B',
    status: 'open',
    assignedTechnicianId: null,
  },
];

export class InMemoryIncidentRepository implements IncidentRepository, IncidentCreator {
  async getIncidents(): Promise<Incident[]> {
    return fixtureIncidents;
  }

  async getIncidentById(id: string): Promise<Incident | null> {
    return fixtureIncidents.find((incident) => incident.id === id) ?? null;
  }

  async createIncident(input: NewIncident): Promise<Incident> {
    const incident: Incident = {
      id: `campus-inc-${String(fixtureIncidents.length + 1).padStart(3, '0')}`,
      ...input,
      status: 'open',
      assignedTechnicianId: null,
    };
    fixtureIncidents.push(incident);
    return incident;
  }
}