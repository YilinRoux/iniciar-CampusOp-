import type { IncidentActions, SessionIncidentAction } from '../domain/incidentActions';
import { RemoteError } from '../domain/remoteError';
import { parseRemoteEnvelope } from '../domain/remoteResource';
import type { FetchLike } from './httpIncidentRepository';
import { toIncident } from './incidentMapper';
import { planRetry } from '../../course-evaluation';

export class HttpIncidentActions implements IncidentActions {
  private sequence = 0;
  constructor(private readonly options: {
    baseUrl: string;
    fetch: FetchLike;
    timeoutMs: number;
    sleep?: (ms: number) => Promise<void>;
  }) {}

  async perform(id: string, action: SessionIncidentAction, diagnosis?: string): Promise<string> {
    const path = `/v1/incidents/${encodeURIComponent(id)}`;
    const current = parseRemoteEnvelope(await this.request(path));
    if (!current.ok || toIncident(current.value) === null) throw invalid();
    const input = { action, baseVersion: current.value.version, ...(diagnosis === undefined ? {} : { diagnosis }) };
    const key = `session-action-${Date.now()}-${++this.sequence}`;
    const result = await this.requestWithRetry(`${path}/actions`, JSON.stringify(input), key);
    const raw = typeof result === 'object' && result !== null ? (result as { incident?: unknown }).incident : undefined;
    const incident = toIncident(raw);
    if (incident === null) throw invalid();
    return incident.status;
  }

  private async requestWithRetry(
    path: string,
    body: string,
    key: string,
  ): Promise<unknown> {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        return await this.request(path, body, key);
      } catch (error) {
        if (!(error instanceof RemoteError)) throw error;

        const status =
          error.kind === 'timeout' || error.kind === 'network_error'
            ? 'timeout'
            : error.status;

        if (status === undefined) throw error;

        const policy = planRetry({
          method: 'POST',
          status,
          attempt,
          idempotencyKey: key,
          ...(error.retryAfterMs === undefined
            ? {}
            : { retryAfterMs: error.retryAfterMs }),
        });

        if (!policy.retry) throw error;

        const sleep = this.options.sleep ??
          ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

        await sleep(policy.delayMs);
      }
    }

    throw new RemoteError('network_error', 'Se agotaron los reintentos');
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
        const rawRetryAfter = response.headers.get('Retry-After');
        const seconds = rawRetryAfter === null ? NaN : Number(rawRetryAfter);
        const retryAfterMs =
          Number.isFinite(seconds) && seconds >= 0
            ? seconds * 1000
            : undefined;

        throw new RemoteError(
          response.status === 429 ? 'rate_limited' :
          response.status >= 500 ? 'server_error' : 'rejected',
          'Operacion no autorizada o estado incompatible',
          { status: response.status, retryAfterMs },
        );
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
