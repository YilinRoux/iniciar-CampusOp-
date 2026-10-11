import type { IncidentActions, SessionIncidentAction } from '../domain/incidentActions';
import { RemoteError } from '../domain/remoteError';
import { parseRemoteEnvelope } from '../domain/remoteResource';
import type { FetchLike } from './httpIncidentRepository';
import { toIncident } from './incidentMapper';

export class HttpIncidentActions implements IncidentActions {
  private sequence = 0;
  constructor(private readonly options: { baseUrl: string; fetch: FetchLike; timeoutMs: number }) {}

  async perform(id: string, action: SessionIncidentAction, diagnosis?: string): Promise<string> {
    const path = `/v1/incidents/${encodeURIComponent(id)}`;
    const current = parseRemoteEnvelope(await this.request(path));
    if (!current.ok || toIncident(current.value) === null) throw invalid();
    const input = { action, baseVersion: current.value.version, ...(diagnosis === undefined ? {} : { diagnosis }) };
    const key = `session-action-${Date.now()}-${++this.sequence}`;
    const result = await this.request(`${path}/actions`, JSON.stringify(input), key);
    const raw = typeof result === 'object' && result !== null ? (result as { incident?: unknown }).incident : undefined;
    const incident = toIncident(raw);
    if (incident === null) throw invalid();
    return incident.status;
  }

  private async request(path: string, body?: string, key?: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.options.fetch(`${this.options.baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST', signal: controller.signal,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': key ?? '' },
        ...(body === undefined ? {} : { body }),
      });
      if (response.status < 200 || response.status >= 300) {
        throw new RemoteError('rejected', 'Operacion no autorizada o estado incompatible', { status: response.status });
      }
      return JSON.parse(await response.text()) as unknown;
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      if (controller.signal.aborted) throw new RemoteError('timeout', 'Tiempo de operacion excedido');
      if (error instanceof SyntaxError) throw invalid();
      throw new RemoteError('network_error', 'No se pudo completar la operacion');
    } finally {
      clearTimeout(timer);
    }
  }
}

const invalid = () => new RemoteError('invalid_response', 'Respuesta de incidencia invalida');
