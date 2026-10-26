import {
  synchronizePendingOperations,
  type SyncStore,
  type SyncTransport,
} from '../../src/campusops/application/incidentSync';
import { RemoteError } from '../../src/campusops/domain/remoteError';
import type { PendingIncidentOperation } from '../../src/campusops/contracts';

// Revisión de Abraham — Semana 08: reintentos de sincronización.
// Usa la función real synchronizePendingOperations con transportes y
// almacenes simulados; no depende de red ni de Expo SecureStore.

function createStore(initial: PendingIncidentOperation[]): SyncStore & {
  operations: PendingIncidentOperation[];
} {
  const operations = [...initial];

  return {
    operations,

    async getPendingOperations() {
      return [...operations];
    },

    async removeConfirmedOperation(operationId) {
      const index = operations.findIndex(
        (operation) => operation.operationId === operationId,
      );
      if (index >= 0) {
        operations.splice(index, 1);
      }
    },
  };
}

describe('Semana 08 (Abraham): reintentos de sincronización', () => {
  test('A1. fallo de red deja la operación pendiente; un reintento exitoso la confirma conservando el operationId', async () => {
    const operation: PendingIncidentOperation = {
      operationId: 'operation-retry-network-001',
      incidentId: 'campus-inc-010',
      actorId: 'technician-1',
      baseVersion: 1,
      action: 'start',
      payload: {},
    };
    const store = createStore([operation]);

    let attempts = 0;
    const transport: SyncTransport = {
      async send() {
        attempts += 1;
        if (attempts === 1) {
          throw new RemoteError('network_error', 'Sin conexión');
        }
      },
    };

    const first = await synchronizePendingOperations(store, transport, 'technician-1');
    expect(first.confirmed).toEqual([]);
    expect(first.pending).toEqual(['operation-retry-network-001']);
    expect(first.conflicts).toEqual([]);
    expect(store.operations.map((item) => item.operationId)).toEqual([
      'operation-retry-network-001',
    ]);

    const second = await synchronizePendingOperations(store, transport, 'technician-1');
    expect(second.confirmed).toEqual(['operation-retry-network-001']);
    expect(second.pending).toEqual([]);
    expect(store.operations).toHaveLength(0);
    expect(attempts).toBe(2);
  });

  test('A2. un RemoteError 500 no elimina la operación; un reintento exitoso sí la confirma', async () => {
    const operation: PendingIncidentOperation = {
      operationId: 'operation-retry-server-error-001',
      incidentId: 'campus-inc-011',
      actorId: 'technician-1',
      baseVersion: 1,
      action: 'start',
      payload: {},
    };
    const store = createStore([operation]);

    let attempts = 0;
    const transport: SyncTransport = {
      async send() {
        attempts += 1;
        if (attempts === 1) {
          throw new RemoteError('server_error', 'Error del servidor', { status: 500 });
        }
      },
    };

    const first = await synchronizePendingOperations(store, transport, 'technician-1');
    expect(first.confirmed).toEqual([]);
    expect(first.pending).toEqual(['operation-retry-server-error-001']);
    // El 500 no es un 409, así que no debe registrarse como conflicto.
    expect(first.conflicts).toEqual([]);
    expect(store.operations).toHaveLength(1);

    const second = await synchronizePendingOperations(store, transport, 'technician-1');
    expect(second.confirmed).toEqual(['operation-retry-server-error-001']);
    expect(second.pending).toEqual([]);
    expect(store.operations).toHaveLength(0);
    expect(attempts).toBe(2);
  });

  test('A3. aislamiento por actor: sincronizar como un técnico solo envía su propia operación y deja pendiente la del otro', async () => {
    const ownOperation: PendingIncidentOperation = {
      operationId: 'operation-actor-own-001',
      incidentId: 'campus-inc-012',
      actorId: 'technician-1',
      baseVersion: 1,
      action: 'start',
      payload: {},
    };
    const otherOperation: PendingIncidentOperation = {
      operationId: 'operation-actor-other-001',
      incidentId: 'campus-inc-013',
      actorId: 'technician-2',
      baseVersion: 1,
      action: 'start',
      payload: {},
    };
    const store = createStore([ownOperation, otherOperation]);

    const sent: string[] = [];
    const transport: SyncTransport = {
      async send(op) {
        sent.push(op.operationId);
      },
    };

    const result = await synchronizePendingOperations(store, transport, 'technician-1');

    expect(sent).toEqual(['operation-actor-own-001']);
    expect(result.confirmed).toEqual(['operation-actor-own-001']);
    expect(result.pending).toEqual(['operation-actor-other-001']);
    expect(result.conflicts).toEqual([]);
    expect(store.operations.map((item) => item.operationId)).toEqual([
      'operation-actor-other-001',
    ]);
  });
});