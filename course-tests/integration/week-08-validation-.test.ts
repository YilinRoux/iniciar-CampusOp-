import { queueOfflineStart, OfflineStartError } from '../../src/campusops/application/incidentSync';
import type { Incident, IncidentRepository } from '../../src/campusops/domain/incident';
import type { PendingIncidentOperation } from '../../src/campusops/contracts';

const assignedIncident: Incident = {
  id: 'campus-inc-test',
  category: 'connectivity',
  description: 'Incidencia ficticia de prueba',
  location: 'Zona ficticia',
  status: 'assigned',
  assignedTechnicianId: 'technician-1',
};

function createHarness(incident: Incident | null = assignedIncident) {
  const incidentRepository: Pick<IncidentRepository, 'getIncidentById'> = {
    getIncidentById: jest.fn(async () => incident),
  };
  const operationQueue = {
    enqueue: jest.fn(async (_operation: PendingIncidentOperation) => undefined),
  };
  const input = {
    incidentRepository,
    operationQueue,
    incidentId: 'campus-inc-test',
    actorId: 'technician-1',
    operationId: 'offline-start-test-1',
  };
  return { incidentRepository, operationQueue, input };
}

test('J1: rechaza una incidencia inexistente sin insertar operaciones', async () => {
  const harness = createHarness(null);

  await expect(queueOfflineStart({ ...harness.input, baseVersion: 1 })).rejects.toMatchObject<Partial<OfflineStartError>>({
    name: 'OfflineStartError',
    code: 'incident_not_found',
  });
  expect(harness.operationQueue.enqueue).not.toHaveBeenCalled();
});

test('J2: rechaza al técnico no asignado sin insertar operaciones', async () => {
  const harness = createHarness({ ...assignedIncident, assignedTechnicianId: 'technician-2' });

  await expect(queueOfflineStart({ ...harness.input, baseVersion: 1 })).rejects.toMatchObject<Partial<OfflineStartError>>({
    name: 'OfflineStartError',
    code: 'technician_not_assigned',
  });
  expect(harness.operationQueue.enqueue).not.toHaveBeenCalled();
});

test('J3: rechaza una versión base ausente sin insertar operaciones', async () => {
  const harness = createHarness();

  await expect(queueOfflineStart(harness.input)).rejects.toMatchObject<Partial<OfflineStartError>>({
    name: 'OfflineStartError',
    code: 'invalid_base_version',
  });
  expect(harness.operationQueue.enqueue).not.toHaveBeenCalled();
});

test.each([
  ['de tipo incorrecto', '1'],
  ['negativa', -1],
  ['no entera', 1.5],
  ['no segura', Number.MAX_SAFE_INTEGER + 1],
])('J3: rechaza una versión base %s sin insertar operaciones', async (_label, baseVersion) => {
  const harness = createHarness();

  await expect(queueOfflineStart({ ...harness.input, baseVersion })).rejects.toMatchObject<Partial<OfflineStartError>>({
    name: 'OfflineStartError',
    code: 'invalid_base_version',
  });
  expect(harness.operationQueue.enqueue).not.toHaveBeenCalled();
});

test('encola el inicio cuando la incidencia, el técnico y la versión son válidos', async () => {
  const harness = createHarness();
  const result = await queueOfflineStart({ ...harness.input, baseVersion: 1 });

  expect(harness.operationQueue.enqueue).toHaveBeenCalledTimes(1);
  expect(harness.operationQueue.enqueue).toHaveBeenCalledWith({
    operationId: 'offline-start-test-1',
    incidentId: 'campus-inc-test',
    baseVersion: 1,
    actorId: 'technician-1',
    action: 'start',
    payload: {},
  });
  expect(result).toEqual(harness.operationQueue.enqueue.mock.calls[0]?.[0]);
});
