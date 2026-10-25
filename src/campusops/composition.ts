import type { IncidentCreator, IncidentRepository } from './domain/incident';
import type { IncidentActions } from './domain/incidentActions';
import { SessionManager } from './application/sessionManager';
import { HttpIncidentRepository } from './infrastructure/httpIncidentRepository';
import { CachedIncidentRepository } from './infrastructure/cachedIncidentRepository';
import { SqliteIncidentStore } from './infrastructure/sqliteIncidentStore';
import { HttpSyncTransport } from './infrastructure/httpSyncTransport';
import { OfflineIncidentActions } from './application/offlineIncidentActions';
import { HttpIncidentActions } from './infrastructure/httpIncidentActions';
import { HttpSessionTransport, authenticatedFetch } from './infrastructure/httpSessionTransport';
import { createSessionStore } from './infrastructure/expoSecureStore';
import { createInMemoryTelemetrySink } from './infrastructure/inMemoryTelemetrySink';
import type { FetchLike } from './infrastructure/httpIncidentRepository';

// Ambos clientes usan el mismo backend. Android emulado: http://10.0.2.2:4310.
const baseUrl = process.env.EXPO_PUBLIC_CAMPUSOPS_BACKEND_URL
  || process.env.EXPO_PUBLIC_COURSE_BACKEND_URL || 'http://127.0.0.1:4310';
const timeoutMs = 8000;
const rawFetch: FetchLike = (url, init) => fetch(url, init);
const telemetry = createInMemoryTelemetrySink();
export const telemetrySink = telemetry.sink;
export const telemetryEntries = telemetry.entries;

export const sessionManager = new SessionManager({
  transport: new HttpSessionTransport({ baseUrl, fetch: rawFetch, timeoutMs }),
  store: createSessionStore(), now: () => Date.now(), onError: telemetrySink,
});

const fetchWithSession = authenticatedFetch(sessionManager, rawFetch);
const repository = new HttpIncidentRepository({
  baseUrl, actorId: '', token: '', fetch: fetchWithSession, timeoutMs,
});
const incidentStore = SqliteIncidentStore.open();

export const incidentRepository: IncidentRepository =
  new CachedIncidentRepository(repository, incidentStore);

export const incidentCreator: IncidentCreator = repository;
const remoteActions = new HttpIncidentActions({
  baseUrl, fetch: fetchWithSession, timeoutMs,
});

const syncTransport = new HttpSyncTransport({
  baseUrl, fetch: fetchWithSession, timeoutMs,
});

const offlineActions = new OfflineIncidentActions(
  remoteActions,
  sessionManager,
  incidentStore,
  syncTransport,
);

export const incidentActions: IncidentActions = offlineActions;

let lastSynchronizedActor: string | null = null;

sessionManager.subscribe(() => {
  const session = sessionManager.view();

  if (session.status !== 'authenticated' || session.role !== 'technician') {
    lastSynchronizedActor = null;
    return;
  }

  if (session.actorId === lastSynchronizedActor) return;

  lastSynchronizedActor = session.actorId;

  void offlineActions.synchronize().catch((error: unknown) => {
    telemetrySink(error instanceof Error ? error.message : String(error));
  });
});
