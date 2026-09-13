// Punto de composicion: aqui, y solo aqui, se conecta la infraestructura real
// con la UI a traves del contrato del dominio. La UI nunca importa infraestructura directamente.
import { InMemoryIncidentRepository } from './infrastructure/inMemoryIncidentRepository';

export const incidentRepository = new InMemoryIncidentRepository();
