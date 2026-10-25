import type { PendingIncidentOperation } from '../contracts';
import type { Incident } from '../domain/incident';
import { toIncident } from './incidentMapper';
import { detectIncidentConflict } from '../application/incidentSync';
import type { SyncTransport } from '../application/incidentSync';
import { RemoteError } from '../domain/remoteError';
import type { FetchLike } from './httpIncidentRepository';

export class HttpSyncTransport implements SyncTransport {
  constructor(
    private readonly options: {
      baseUrl: string;
      fetch: FetchLike;
      timeoutMs: number;
    },
  ) {}

  private async inspectConflict(operation: PendingIncidentOperation): Promise<string[]> {
    const base = operation.payload.baseIncident as Incident | undefined;

    if (base === undefined || base.version === undefined) return [];

    const response = await this.options.fetch(
      `${this.options.baseUrl}/v1/incidents/${encodeURIComponent(operation.incidentId)}`,
      { method: 'GET', headers: {}, signal: AbortSignal.timeout(this.options.timeoutMs) },
    );

    if (response.status < 200 || response.status >= 300) return [];

    const remote = toIncident(JSON.parse(await response.text()) as unknown);

    if (remote === null || remote.version === undefined) return [];

    const local: Incident = {
      ...base,
      status: 'in_progress',
    };

    const result = detectIncidentConflict(base, local, remote);
    return result.kind === 'conflict' ? [...result.fields] : [];
  }

  async send(operation: PendingIncidentOperation): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs,
    );

    try {
      const { baseIncident: _baseIncident, ...actionPayload } = operation.payload;
      const response = await this.options.fetch(
        `${this.options.baseUrl}/v1/incidents/${encodeURIComponent(operation.incidentId)}/actions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': operation.operationId,
          },
          body: JSON.stringify({
            action: operation.action,
            baseVersion: operation.baseVersion,
            ...actionPayload,
          }),
          signal: controller.signal,
        },
      );

      if (response.status === 409) {
        let fields: string[] = [];

        try {
          fields = await this.inspectConflict(operation);
        } catch {
          // Si falla la consulta remota, la operación local permanece pendiente.
        }

        throw new RemoteError(
          'rejected',
          fields.length > 0
            ? `Conflicto en campos: ${fields.join(', ')}. Operacion local conservada`
            : 'Conflicto de version: operacion local conservada',
          { status: 409 },
        );
      }

      if (response.status < 200 || response.status >= 300) {
        throw new RemoteError(
          'rejected',
          'No se confirmo la operacion pendiente',
          { status: response.status },
        );
      }

      // Consumir la respuesta antes de confirmar la operación.
      await response.text();
    } catch (error) {
      if (error instanceof RemoteError) throw error;

      throw controller.signal.aborted
        ? new RemoteError('timeout', 'Tiempo de sincronizacion excedido')
        : new RemoteError('network_error', 'Sin conexion para sincronizar');
    } finally {
      clearTimeout(timer);
    }
  }
}
