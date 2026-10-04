export type IncidentStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  category: string;
  description: string;
  location: string;
  status: IncidentStatus;
  assignedTechnicianId: string | null;
}

// Contrato que la capa de aplicación necesita. La infraestructura lo implementa.
export interface IncidentRepository {
  getIncidents(): Promise<Incident[]>;
  getIncidentById(id: string): Promise<Incident | null>;
}

// Datos que el usuario aporta al crear una incidencia.
export interface NewIncident {
  category: string;
  description: string;
  location: string;
}

// Contrato aparte para crear. Se separa de IncidentRepository para no romper
// los dobles de prueba existentes que solo implementan la lectura.
export interface IncidentCreator {
  createIncident(input: NewIncident, idempotencyKey: string): Promise<Incident>;
}