import type { LoginSession, RenewedSession, SessionTransport } from '../domain/session';
import { RemoteError } from '../domain/remoteError';
import type { SessionManager } from '../application/sessionManager';
import type { FetchLike } from './httpIncidentRepository';

export class HttpSessionTransport implements SessionTransport {
  constructor(private readonly options: { baseUrl: string; fetch: FetchLike; timeoutMs: number }) {}

  async login(actorId: string): Promise<LoginSession> {
    const value = await this.post('/v1/session/login', { actorId });
    if (value.actorId !== actorId || !['reporter', 'technician', 'coordinator'].includes(String(value.role))) throw invalid();
    return { ...tokens(value), actorId, role: value.role as LoginSession['role'] };
  }

  async refresh(refreshToken: string): Promise<RenewedSession> {
    return tokens(await this.post('/v1/session/refresh', { refreshToken }));
  }

  private async post(path: string, input: Record<string, string>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.options.fetch(`${this.options.baseUrl}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input), signal: controller.signal,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new RemoteError('rejected', 'Sesion rechazada por el servidor', { status: response.status });
      }
      const value: unknown = JSON.parse(await response.text());
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
      return value as Record<string, unknown>;
    } catch (error) {
      if (controller.signal.aborted) throw new RemoteError('timeout', 'Tiempo de sesion excedido');
      if (error instanceof RemoteError) throw error;
      if (error instanceof SyntaxError) throw invalid();
      throw new RemoteError('network_error', 'No se pudo conectar para autenticar');
    } finally {
      clearTimeout(timer);
    }
  }
}

const invalid = () => new RemoteError('invalid_response', 'Respuesta de sesion invalida');

function tokens(value: Record<string, unknown>): RenewedSession {
  const { accessToken, refreshToken, expiresIn } = value;
  if (typeof accessToken !== 'string' || !accessToken.trim()
    || typeof refreshToken !== 'string' || !refreshToken.trim()
    || typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) throw invalid();
  return { accessToken, refreshToken, expiresIn };
}

export function authenticatedFetch(manager: SessionManager, fetch: FetchLike): FetchLike {
  return (url, init) => manager.request((session) => fetch(url, {
    ...init, headers: { ...init.headers, Authorization: `Bearer ${session.accessToken}`, 'X-Course-Actor': session.actorId },
  }));
}
