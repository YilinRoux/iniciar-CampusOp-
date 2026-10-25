const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const directory = mkdtempSync(join(tmpdir(), 'campusops-week08-'));
const path = join(directory, 'migration-test.db');

const incident = {
  id: 'campus-inc-001',
  category: 'maintenance',
  description: 'Incidencia conservada durante migración',
  location: 'Campus',
  status: 'assigned',
  assignedTechnicianId: 'technician-1',
};

const operation = {
  operationId: 'week08-operation-001',
  incidentId: incident.id,
  baseVersion: 1,
  actorId: 'technician-1',
  action: 'start',
  payload: {},
};

function version(db) {
  return db.prepare('PRAGMA user_version').get().user_version;
}

function columns(db) {
  return db.prepare('PRAGMA table_info(pending_operations)')
    .all().map((column) => column.name);
}

function verifyData(db) {
  const savedIncident = db.prepare(
    'SELECT data FROM incidents WHERE id = ?',
  ).get(incident.id);

  const savedOperation = db.prepare(
    'SELECT data FROM pending_operations WHERE operation_id = ?',
  ).get(operation.operationId);

  assert.deepEqual(JSON.parse(savedIncident.data), incident);
  assert.deepEqual(JSON.parse(savedOperation.data), operation);
}

function migrate(db, injectFailure = false) {
  db.exec('BEGIN IMMEDIATE');

  try {
    const currentVersion = version(db);

    if (currentVersion > 2) {
      throw new Error('Versión incompatible');
    }

    if (currentVersion === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS incidents (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pending_operations (
          operation_id TEXT PRIMARY KEY NOT NULL,
          incident_id TEXT NOT NULL,
          data TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `);
    }

    if (currentVersion <= 1) {
      db.exec(`
        ALTER TABLE pending_operations
        ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
      `);

      if (injectFailure) {
        throw new Error('Falla de migración inyectada para prueba');
      }

      db.exec('PRAGMA user_version = 2');
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

let db;

try {
  db = new DatabaseSync(path);

  db.exec(`
    CREATE TABLE incidents (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE pending_operations (
      operation_id TEXT PRIMARY KEY NOT NULL,
      incident_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    PRAGMA user_version = 1;
  `);

  db.prepare('INSERT INTO incidents (id, data) VALUES (?, ?)')
    .run(incident.id, JSON.stringify(incident));

  db.prepare(`
    INSERT INTO pending_operations (operation_id, incident_id, data)
    VALUES (?, ?, ?)
  `).run(operation.operationId, operation.incidentId, JSON.stringify(operation));

  assert.equal(version(db), 1);
  verifyData(db);
  console.log('PASS: estado inicial v1 conserva incidencia y operación');

  assert.throws(
    () => migrate(db, true),
    /Falla de migración inyectada/,
  );

  assert.equal(version(db), 1);
  assert.equal(columns(db).includes('created_at'), false);
  verifyData(db);
  console.log('PASS: falla inyectada revierte esquema y conserva datos');

  db.close();
  db = new DatabaseSync(path);

  assert.equal(version(db), 1);
  verifyData(db);
  console.log('PASS: datos conservados después de reabrir la base');

  migrate(db);

  assert.equal(version(db), 2);
  assert.equal(columns(db).includes('created_at'), true);
  verifyData(db);
  console.log('PASS: recuperación v1 → v2 conserva incidencia y operación');

  migrate(db);
  assert.equal(version(db), 2);
  verifyData(db);
  console.log('PASS: reapertura lógica de v2 sin migración duplicada');
} finally {
  if (db) db.close();
  rmSync(directory, { recursive: true, force: true });
}
