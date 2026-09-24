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

try {
  const response = await fetch(`${baseUrl}/v1/session/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: 'coordinator-1' }),
  });
  const data = await response.json();

  // ANTES (INSEGURO, no usar): console.log(data);
  // -> imprimiria accessToken y refreshToken completos en la terminal/logs.

  // DESPUES (seguro): solo se registra lo necesario, nunca el token.
  assert.ok(data.accessToken, 'la respuesta real si trae accessToken (se confirma pero no se imprime)');
  console.log('Login procesado:', { actorId: data.actorId, role: data.role, authenticated: true });
} finally {
  child.kill();
}