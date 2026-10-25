/**
 * Prueba de la clase real SqliteIncidentStore con un adaptador de
 * expo-sqlite respaldado por node:sqlite.
 *
 * No sustituye una ejecución en Android/iOS.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Incident } from '../../src/campusops/domain/incident';
import type { PendingIncidentOperation } from '../../src/campusops/contracts';

type Params = readonly (string | number | null)[];
type Row = Record<string, unknown>;

const testEnvironment = {
  directory: '',
  connections: [] as DatabaseSync[],
};

interface SqliteAdapter {
    getFirstAsync<T>(sql: string, ...params: Params): Promise<T | null>;
    getAllAsync<T>(sql: string, ...params: Params): Promise<T[]>;
    runAsync(sql: string, ...params: Params): Promise<unknown>;
    execAsync(sql: string): Promise<void>;
    withExclusiveTransactionAsync<T>(
      callback: (tx: SqliteAdapter) => Promise<T>,
    ): Promise<T>;
    closeAsync(): Promise<void>;
}

jest.doMock('expo-sqlite', () => {
  function wrap(db: DatabaseSync): SqliteAdapter {
    return {
      async getFirstAsync<T>(sql: string, ...params: Params): Promise<T | null> {
        const row = db.prepare(sql).get(...params);
        return (row ?? null) as T | null;
      },

      async getAllAsync<T>(sql: string, ...params: Params): Promise<T[]> {
        return db.prepare(sql).all(...params) as T[];
      },

      async runAsync(sql: string, ...params: Params) {
        return db.prepare(sql).run(...params);
      },

      async execAsync(sql: string) {
        db.exec(sql);
      },

      async withExclusiveTransactionAsync<T>(
        callback: (tx: ReturnType<typeof wrap>) => Promise<T>,
      ): Promise<T> {
        db.exec('BEGIN IMMEDIATE');

        try {
          const result = await callback(wrap(db));
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },

      async closeAsync() {
        if (db.isOpen) {
          db.close();
        }
      },
    };
  }

  return {
    openDatabaseAsync: async (name: string) => {
      const db = new DatabaseSync(
        join(testEnvironment.directory, name),
      );

      testEnvironment.connections.push(db);
      return wrap(db);
    },
  };
});



const { SqliteIncidentStore } = jest.requireActual<
  typeof import('../../src/campusops/infrastructure/sqliteIncidentStore')
>('../../src/campusops/infrastructure/sqliteIncidentStore');

const incident: Incident = {
  id: 'sqlite-inc-08',
  version: 3,
  category: 'maintenance',
  description: 'Reparación pendiente',
  location: 'Edificio A',
  status: 'assigned',
  assignedTechnicianId: 'technician-1',
};

const operation: PendingIncidentOperation = {
  operationId: 'stable-op-08',
  incidentId: incident.id,
  actorId: 'technician-1',
  baseVersion: 3,
  action: 'start',
  payload: {
    diagnosis: 'Se requiere inspección',
    notes: 'El equipo presenta fallas intermitentes',
    photoRefs: ['local://photo-001'],
    baseIncident: incident,
  },
};

beforeEach(() => {
  testEnvironment.directory = mkdtempSync(join(tmpdir(), 'campusops-week08-'));
  testEnvironment.connections = [];
});

afterEach(() => {
  for (const db of testEnvironment.connections) {
    if (db.isOpen) {
      db.close();
    }
  }

  if (existsSync(testEnvironment.directory)) {
    rmSync(testEnvironment.directory, { recursive: true, force: true });
  }
});

describe('Semana 08: SqliteIncidentStore real', () => {
  test('conserva incidencia y operación tras cerrar y reabrir', async () => {
    const store = await SqliteIncidentStore.open({
      databaseName: 'restart.db',
    });

    await store.saveIncident(incident);
    await store.enqueue(operation);

    expect(await store.getIncident(incident.id)).toEqual(incident);
    expect(await store.getPendingOperations()).toEqual([operation]);

    const firstConnection = testEnvironment.connections[0];
    if (!firstConnection) {
      throw new Error('No se abrió la primera conexión');
    }
    firstConnection.close();

    const reopened = await SqliteIncidentStore.open({
      databaseName: 'restart.db',
    });

    expect(await reopened.getIncident(incident.id)).toEqual(incident);

    const pending = await reopened.getPendingOperations();
    expect(pending).toEqual([operation]);
    expect(pending[0]?.operationId).toBe('stable-op-08');
    expect(pending[0]?.payload).toEqual(operation.payload);

    await reopened.enqueue({
      ...operation,
      payload: { notes: 'No debe reemplazar la operación original' },
    });

    expect(await reopened.getPendingOperations()).toEqual([operation]);

    await reopened.removeConfirmedOperation(operation.operationId);

    expect(await reopened.getPendingOperations()).toEqual([]);
    expect(await reopened.getIncident(incident.id)).toEqual(incident);
  });

  test('revierte una migración fallida y permite recuperación', async () => {
    const databaseName = 'rollback.db';

    await expect(
      SqliteIncidentStore.open({
        databaseName,
        failMigration: true,
      }),
    ).rejects.toThrow('Falla de migracion inyectada');

    const failedConnection = testEnvironment.connections[0];
    if (!failedConnection) {
      throw new Error('No se abrió la conexión de migración');
    }

    expect(failedConnection.isOpen).toBe(false);

    const recovered = await SqliteIncidentStore.open({ databaseName });

    await recovered.saveIncident(incident);
    await recovered.enqueue(operation);

    expect(await recovered.getIncident(incident.id)).toEqual(incident);
    expect(await recovered.getPendingOperations()).toEqual([operation]);

    const secondConnection = testEnvironment.connections[1];
    if (!secondConnection) {
      throw new Error('No se abrió la conexión recuperada');
    }

    const version = secondConnection.prepare('PRAGMA user_version').get() as
      | Row
      | undefined;

    expect(version?.user_version).toBe(2);
  });
});
