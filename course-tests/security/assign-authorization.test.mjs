import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['course-backend/server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, COURSE_BACKEND_PORT: '0' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const baseUrl = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('backend startup timeout')), 5000);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    const match = chunk.match(/(http:\/\/127\.0\.0\.1:\d+)/);
    if (match) {
      clearTimeout(timeout);
      resolve(match[1]);
    }
  });
  child.once('exit', (code) => reject(new Error(`backend exited early: ${code}`)));
});

async function call(path, status, actor, body, key) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer course-valid-token',
      'X-Course-Actor': actor,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, status, `${path}: status esperado ${status}, recibido ${response.status}`);
  return response.json();
}

try {
  await call('/v1/incidents/campus-inc-001/actions', 403, 'technician-1',
    { action: 'assign', baseVersion: 1, technicianId: 'technician-2' }, 'unauthorized-assign-attempt');
  console.log('OK: un tecnico sin rol de coordinador no puede ejecutar la accion assign (403 confirmado).');
} finally {
  child.kill();
}