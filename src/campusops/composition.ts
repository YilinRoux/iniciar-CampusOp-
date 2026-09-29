// Punto de composicion: aqui, y solo aqui, se conecta la infraestructura real
// con la UI a traves del contrato del dominio. La UI nunca importa infraestructura directamente.
import { InMemoryIncidentRepository } from './infrastructure/inMemoryIncidentRepository';
import { createInMemoryTelemetrySink } from './infrastructure/inMemoryTelemetrySink';

export const incidentRepository = new InMemoryIncidentRepository();

const telemetry = createInMemoryTelemetrySink();
export const telemetrySink = telemetry.sink;
export const telemetryEntries = telemetry.entries;
