// Punto de composicion: aqui, y solo aqui, se conecta la infraestructura real
// con la UI a traves del contrato del dominio. La UI nunca importa infraestructura directamente.
import type { IncidentCreator, IncidentRepository } from './domain/incident';
import { HttpIncidentRepository } from './infrastructure/httpIncidentRepository';
import { InMemoryIncidentRepository } from './infrastructure/inMemoryIncidentRepository';
import { createInMemoryTelemetrySink } from './infrastructure/inMemoryTelemetrySink';

// Si EXPO_PUBLIC_CAMPUSOPS_BACKEND_URL esta definida se usa el backend didactico;
// si no, el repositorio en memoria (pruebas y desarrollo sin servidor).
// Emulador Android: http://10.0.2.2:4310 | computadora: http://127.0.0.1:4310
const backendUrl = process.env.EXPO_PUBLIC_CAMPUSOPS_BACKEND_URL;
const REQUEST_TIMEOUT_MS = 8000;

function buildRepository(): IncidentRepository & IncidentCreator {
  if (backendUrl === undefined || backendUrl === '') return new InMemoryIncidentRepository();
  return new HttpIncidentRepository({
    baseUrl: backendUrl,
    actorId: 'coordinator-1', // identidad publica de prueba, no un secreto
    token: 'course-valid-token', // fixture publico del backend didactico
    fetch: (url, init) => fetch(url, init),
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
}

const repository = buildRepository();
export const incidentRepository: IncidentRepository = repository;
export const incidentCreator: IncidentCreator = repository;

const telemetry = createInMemoryTelemetrySink();
export const telemetrySink = telemetry.sink;
export const telemetryEntries = telemetry.entries;