export type IncidentStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  category: string;
  description: string;
  location: string;
  status: IncidentStatus;
  reporterId: string;
  assignedTechnicianId: string | null;
}

export type ActorRole = 'reporter' | 'technician' | 'coordinator';

export interface Actor {
  id: string;
  role: ActorRole;
}

// Contrato que la capa de aplicación necesita. La infraestructura lo implementa.
export interface IncidentRepository {
  getIncidents(): Promise<Incident[]>;
  getIncidentById(id: string): Promise<Incident | null>;
}

// Espeja la funcion visible() del backend (course-backend/campusops.mjs):
// coordinador ve todo, reportante solo lo suyo, tecnico solo lo asignado.
export function isIncidentVisibleToActor(incident: Incident, actor: Actor): boolean {
  if (actor.role === 'coordinator') return true;
  if (actor.role === 'reporter') return incident.reporterId === actor.id;
  if (actor.role === 'technician') return incident.assignedTechnicianId === actor.id;
  return false;
}