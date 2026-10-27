import type { IncidentActions, SessionIncidentAction } from '../domain/incidentActions';
import type { SessionManager } from './sessionManager';
import type { SqliteIncidentStore } from '../infrastructure/sqliteIncidentStore';
import type { SyncTransport } from './incidentSync';
import { queueOfflineStart, synchronizePendingOperations } from './incidentSync';

export class OfflineIncidentActions implements IncidentActions {
  private sequence = 0;

  constructor(
    private readonly remote: IncidentActions,
    private readonly manager: SessionManager,
    private readonly store: Promise<SqliteIncidentStore>,
    private readonly transport: SyncTransport,
  ) {}

  async synchronize(): Promise<{ confirmed: string[]; pending: string[]; conflicts: string[] }> {
    const session = this.manager.view();

    if (session.status !== 'authenticated' ||
        session.role !== 'technician' ||
        session.actorId === null) {
      return { confirmed: [], pending: [], conflicts: [] };
    }

    return synchronizePendingOperations(
      await this.store,
      this.transport,
      session.actorId,
    );
  }

  async perform(id: string, action: SessionIncidentAction, diagnosis?: string): Promise<string> {
    if (action !== 'start') {
      return this.remote.perform(id, action, diagnosis);
    }

    const session = this.manager.view();

    if (session.status !== 'authenticated' ||
        session.role !== 'technician' ||
        session.actorId === null) {
      throw new Error('Se requiere una sesion activa de tecnico');
    }

    const operationId = `start-${Date.now()}-${++this.sequence}`;
    const database = await this.store;

    const operation = await queueOfflineStart(
      database,
      id,
      session.actorId,
      operationId,
    );

    const result = await synchronizePendingOperations(
      database,
      this.transport,
      session.actorId,
    );

    return result.confirmed.includes(operation.operationId)
      ? 'in_progress'
      : result.conflicts.includes(operation.operationId)
        ? 'conflict'
        : 'pending';
  }
}
