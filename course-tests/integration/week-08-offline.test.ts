import {
  queueOfflineStart,
  synchronizePendingOperations,
  type OfflineIncidentStore,
  type SyncTransport,
} from '../../src/campusops/application/incidentSync';
import { RemoteError } from '../../src/campusops/domain/remoteError';
import type { PendingIncidentOperation } from '../../src/campusops/contracts';
import type { Incident } from '../../src/campusops/domain/incident';

const incident: Incident = {
  id: 'campus-inc-001',
  version: 1,
  category: 'maintenance',
  description: 'Prueba de persistencia de operación',
  location: 'Campus',
  status: 'assigned',
  assignedTechnicianId: 'technician-1',
};

function createStore(): OfflineIncidentStore & {
  operations: PendingIncidentOperation[];
} {
  const operations: PendingIncidentOperation[] = [];

  return {
    operations,

    async getIncident(id) {
      return id === incident.id ? incident : null;
    },

    async enqueue(operation) {
      if (!operations.some(
        (existing) => existing.operationId === operation.operationId
      )) {
        operations.push(operation);
      }
    },

    async getPendingOperations() {
      return [...operations];
    },

    async removeConfirmedOperation(operationId) {
      const index = operations.findIndex(
        (operation) => operation.operationId === operationId
      );

      if (index >= 0) {
        operations.splice(index, 1);
      }
    },
  };
}

describe('Semana 08: cola y sincronización', () => {
  test('conserva identidad y contenido al recuperar una cola simulada', async () => {
    const store = createStore();

    const original = await queueOfflineStart(
      store,
      incident.id,
      'technician-1',
      'operation-stable-001'
    );

    const snapshot = JSON.stringify(store.operations);
    const recovered = JSON.parse(snapshot) as PendingIncidentOperation[];

    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toEqual(original);
    expect(recovered[0]?.operationId).toBe('operation-stable-001');

    const repeated = await queueOfflineStart(
      store,
      incident.id,
      'technician-1',
      'operation-different-002'
    );

    expect(repeated.operationId).toBe('operation-stable-001');
    expect(store.operations).toHaveLength(1);
  });

  test('mantiene operación pendiente ante conflicto 409', async () => {
    const store = createStore();

    await queueOfflineStart(
      store,
      incident.id,
      'technician-1',
      'operation-conflict-001'
    );

    const transport: SyncTransport = {
      async send() {
        throw new RemoteError(
          'rejected',
          'Conflicto por reasignación remota',
          { status: 409 }
        );
      },
    };

    const result = await synchronizePendingOperations(
      store,
      transport,
      'technician-1'
    );

    expect(result.confirmed).toEqual([]);
    expect(result.conflicts).toEqual(['operation-conflict-001']);
    expect(result.pending).toEqual(['operation-conflict-001']);
    expect(store.operations).toHaveLength(1);
  });

  test('elimina solamente operaciones confirmadas', async () => {
    const store = createStore();

    await store.enqueue({
      operationId: 'operation-confirmed',
      incidentId: incident.id,
      actorId: 'technician-1',
      baseVersion: 1,
      action: 'start',
      payload: {},
    });

    await store.enqueue({
      operationId: 'operation-pending',
      incidentId: 'campus-inc-002',
      actorId: 'technician-1',
      baseVersion: 1,
      action: 'start',
      payload: {},
    });

    const transport: SyncTransport = {
      async send(operation) {
        if (operation.operationId === 'operation-pending') {
          throw new RemoteError('network_error', 'Sin conexión');
        }
      },
    };

    const result = await synchronizePendingOperations(
      store,
      transport,
      'technician-1'
    );

    expect(result.confirmed).toEqual(['operation-confirmed']);
    expect(result.pending).toEqual(['operation-pending']);
    expect(store.operations.map((operation) => operation.operationId))
      .toEqual(['operation-pending']);
  });

  test('no envía operaciones de otro actor', async () => {
    const store = createStore();

    await store.enqueue({
      operationId: 'operation-other-actor',
      incidentId: incident.id,
      actorId: 'technician-2',
      baseVersion: 1,
      action: 'start',
      payload: {},
    });

    const send = jest.fn(async () => undefined);

    const result = await synchronizePendingOperations(
      store,
      { send },
      'technician-1'
    );

    expect(send).not.toHaveBeenCalled();
    expect(result.pending).toEqual(['operation-other-actor']);
    expect(store.operations).toHaveLength(1);
  });
});
