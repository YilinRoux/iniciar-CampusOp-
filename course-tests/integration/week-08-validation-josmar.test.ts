import { queueOfflineStart, type OfflineIncidentStore } from '../../src/campusops/application/incidentSync';
import type { Incident } from '../../src/campusops/domain/incident';
import type { PendingIncidentOperation } from '../../src/campusops/contracts';

const incident: Incident = {
  id: 'campus-inc-test',
  category: 'connectivity',
  description: 'Incidencia ficticia',
  location: 'Laboratorio',
  status: 'assigned',
  assignedTechnicianId: 'technician-1',
  version: 1,
};

function createStore(value: Incident | null = incident): OfflineIncidentStore & {
  operations: PendingIncidentOperation[];
} {
  const operations: PendingIncidentOperation[] = [];

  return {
    operations,
    async getIncident() {
      return value;
    },
    async getPendingOperations() {
      return [...operations];
    },
    async enqueue(operation) {
      operations.push(operation);
    },
    async removeConfirmedOperation(operationId) {
      const index = operations.findIndex(op => op.operationId === operationId);
      if (index >= 0) operations.splice(index, 1);
    },
  };
}

describe('Semana 08 (Josmar): validaciones de inicio offline', () => {
  test('J1. rechaza una incidencia inexistente sin encolar', async () => {
    const store = createStore(null);

    await expect(
      queueOfflineStart(store, 'campus-inc-test', 'technician-1', 'op-j1'),
    ).rejects.toThrow('No hay una incidencia local con version valida');

    expect(store.operations).toHaveLength(0);
  });

  test('J2. rechaza a un tecnico no asignado sin encolar', async () => {
    const store = createStore({
      ...incident,
      assignedTechnicianId: 'technician-2',
    });

    await expect(
      queueOfflineStart(store, 'campus-inc-test', 'technician-1', 'op-j2'),
    ).rejects.toThrow('La incidencia no esta asignada al tecnico');

    expect(store.operations).toHaveLength(0);
  });

  test.each([
    ['ausente', undefined],
    ['negativa', -1],
    ['no entera', 1.5],
    ['no segura', Number.MAX_SAFE_INTEGER + 1],
  ])('J3. rechaza version %s sin encolar', async (_label, version) => {
    const { version: _originalVersion, ...incidentWithoutVersion } = incident;

    const store = createStore(
      version === undefined
        ? incidentWithoutVersion
        : { ...incident, version },
    );

    await expect(
      queueOfflineStart(store, 'campus-inc-test', 'technician-1', 'op-j3'),
    ).rejects.toThrow('No hay una incidencia local con version valida');

    expect(store.operations).toHaveLength(0);
  });

  test('encola una operacion valida una sola vez', async () => {
    const store = createStore();

    const first = await queueOfflineStart(
      store, 'campus-inc-test', 'technician-1', 'op-valid',
    );

    const second = await queueOfflineStart(
      store, 'campus-inc-test', 'technician-1', 'op-valid',
    );

    expect(store.operations).toHaveLength(1);
    expect(first).toEqual(second);
    expect(first.baseVersion).toBe(1);
  });
});