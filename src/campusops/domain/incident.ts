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
