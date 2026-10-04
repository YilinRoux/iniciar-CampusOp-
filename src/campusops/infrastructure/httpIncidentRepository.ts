import type { Incident, IncidentCreator, IncidentRepository, NewIncident } from '../domain/incident';
import { RemoteError } from '../domain/remoteError';
import { toIncident } from './incidentMapper';

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface HttpIncidentRepositoryOptions {
  baseUrl: string;
  actorId: string;
  token: string;
  fetch: FetchLike;
  timeoutMs: number;
  scenario?: string;
}

interface RequestInitLite {
  method?: string;
  body?: string;
  idempotencyKey?: string;
}

const invalidResponse = (status?: number) =>
  new RemoteError('invalid_response', 'Respuesta remota invalida', { status });

export class HttpIncidentRepository implements IncidentRepository, IncidentCreator {
  constructor(private readonly options: HttpIncidentRepositoryOptions) {}

  async getIncidents(): Promise<Incident[]> {
    const body = await this.request('/v1/incidents');
    const items =
      typeof body === 'object' && body !== null ? (body as { items?: unknown }).items : undefined;
    if (!Array.isArray(items)) throw invalidResponse();
    return items.map(toIncident).filter((i): i is Incident => i !== null);
  }

  async getIncidentById(id: string): Promise<Incident | null> {
    try {
      return toIncident(await this.request(`/v1/incidents/${encodeURIComponent(id)}`));
    } catch (error) {
      if (error instanceof RemoteError && error.status === 404) return null;
      throw error;
    }
  }

  async createIncident(input: NewIncident, idempotencyKey: string): Promise<Incident> {
    const body = await this.request('/v1/incidents', {
      method: 'POST',
      body: JSON.stringify(input),
      idempotencyKey,
    });
    const created = toIncident(body);
    if (created === null) throw invalidResponse();
    return created;
  }

  private async request(path: string, init: RequestInitLite = {}): Promise<unknown> {
    const { baseUrl, actorId, token, timeoutMs, scenario } = this.options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'X-Course-Actor': actorId,
    };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.idempotencyKey !== undefined) headers['Idempotency-Key'] = init.idempotencyKey;
    if (scenario !== undefined) headers['X-Course-Scenario'] = scenario;

    const requestInit: Parameters<FetchLike>[1] = {
      method: init.method ?? 'GET',
      headers,
      signal: controller.signal,
    };
    if (init.body !== undefined) requestInit.body = init.body;

    let status: number;
    let retryAfter: string | null;
    let text: string;
    try {
      const response = await this.options.fetch(`${baseUrl}${path}`, requestInit);
      status = response.status;
      retryAfter = response.headers.get('Retry-After');
      text = await response.text();
    } catch {
      throw controller.signal.aborted
        ? new RemoteError('timeout', 'La solicitud excedio el tiempo limite')
        : new RemoteError('network_error', 'No se pudo conectar con el servidor');
    } finally {
      clearTimeout(timer);
    }

    if (status === 429) {
      const seconds = Number(retryAfter);
      const extra =
        retryAfter !== null && Number.isFinite(seconds) && seconds >= 0
          ? { status, retryAfterMs: seconds * 1000 }
          : { status };
      throw new RemoteError('rate_limited', 'Demasiadas solicitudes', extra);
    }
    if (status >= 500) throw new RemoteError('server_error', 'Error del servidor', { status });
    if (status < 200 || status >= 300) throw new RemoteError('rejected', 'Solicitud rechazada', { status });

    try {
      return JSON.parse(text);
    } catch {
      throw invalidResponse(status);
    }
  }
}