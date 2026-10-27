import * as SQLite from 'expo-sqlite';
import type { PendingIncidentOperation } from '../contracts';
import type { Incident } from '../domain/incident';

const DATABASE_NAME = 'campusops.db';
const SCHEMA_VERSION = 2;

export class SqliteIncidentStore {
  private constructor(
    private readonly db: SQLite.SQLiteDatabase,
  ) {}

  static async open(options: {
    databaseName?: string;
    failMigration?: boolean;
  } = {}): Promise<SqliteIncidentStore> {
    const db = await SQLite.openDatabaseAsync(
      options.databaseName ?? DATABASE_NAME,
    );
    const store = new SqliteIncidentStore(db);

    try {
      await store.migrate(options.failMigration ?? false);
    } catch (error) {
      await db.closeAsync();
      throw error;
    }

    return store;
  }

  private async migrate(failMigration: boolean): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      const versionRow = await tx.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      );
      const currentVersion = versionRow?.user_version ?? 0;

      if (currentVersion > SCHEMA_VERSION) {
        throw new Error('La base de datos tiene una version no compatible');
      }

      if (currentVersion === SCHEMA_VERSION) {
        return;
      }

      if (currentVersion === 0) {
        await tx.execAsync(`
          CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY NOT NULL,
            data TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS pending_operations (
            operation_id TEXT PRIMARY KEY NOT NULL,
            incident_id TEXT NOT NULL,
            data TEXT NOT NULL
          );
        `);

        await tx.execAsync('PRAGMA user_version = 1');
      }

      if (currentVersion <= 1) {
        await tx.execAsync(`
          ALTER TABLE pending_operations
          ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
        `);

        if (failMigration) {
          throw new Error('Falla de migracion inyectada para prueba');
        }

        await tx.execAsync('PRAGMA user_version = 2');
      }
    });
  }

  async saveIncident(incident: Incident): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO incidents (id, data)
       VALUES (?, ?)`,
      incident.id,
      JSON.stringify(incident),
    );
  }

  async getIncident(id: string): Promise<Incident | null> {
    const row = await this.db.getFirstAsync<{ data: string }>(
      'SELECT data FROM incidents WHERE id = ?',
      id,
    );

    return row ? (JSON.parse(row.data) as Incident) : null;
  }

  async enqueue(operation: PendingIncidentOperation): Promise<void> {
    await this.db.runAsync(
      `INSERT OR IGNORE INTO pending_operations
       (operation_id, incident_id, data)
       VALUES (?, ?, ?)`,
      operation.operationId,
      operation.incidentId,
      JSON.stringify(operation),
    );
  }

  async getPendingOperations(): Promise<PendingIncidentOperation[]> {
    const rows = await this.db.getAllAsync<{ data: string }>(
      'SELECT data FROM pending_operations ORDER BY rowid',
    );

    return rows.map(
      (row) => JSON.parse(row.data) as PendingIncidentOperation,
    );
  }

  async removeConfirmedOperation(operationId: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM pending_operations WHERE operation_id = ?',
      operationId,
    );
  }
}