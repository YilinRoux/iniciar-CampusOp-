import type { ActiveSession, CampusRole, SessionTransport } from '../domain/session';
import type { SessionStore } from '../domain/sessionStore';
import { initialSession, transitionSession } from '../domain/sessionMachine';
import type { SessionEvent, SessionState, SessionStatus } from '../domain/sessionMachine';
import { RemoteError } from '../domain/remoteError';
import { reportError } from './reportError';
import type { LogSink } from './reportError';

const unavailable = () => new RemoteError('rejected', 'Sesion no disponible; inicia sesion nuevamente', { status: 401 });

export class SessionManager {
  private state: SessionState = initialSession();
  private session: ActiveSession | null = null;
  private epoch = 0;
  private sequence = 0;
  private flight: { epoch: number; promise: Promise<ActiveSession> } | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: {
    transport: SessionTransport;
    store: SessionStore;
    now: () => number;
    onError?: LogSink;
  }) {}

  view(): { status: SessionStatus; role: CampusRole | null; actorId: string | null } {
    return { status: this.state.status, role: this.session?.role ?? null, actorId: this.session?.actorId ?? null };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private transition(event: SessionEvent): void {
    this.state = transitionSession(this.state, event);
    for (const listener of this.listeners) listener();
  }

  // Serializa escrituras: un clear de logout queda detrás de cualquier save
  // iniciado antes del cierre. Ningún save tardío puede restaurar esa sesión.
  private write<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writes.then(operation);
    this.writes = result.catch(() => {});
    return result;
  }

  private async persist(session: ActiveSession, epoch: number): Promise<void> {
    await this.write(async () => {
      if (epoch !== this.epoch) throw unavailable();
      await this.options.store.save(JSON.stringify(session));
    });
    if (epoch !== this.epoch) throw unavailable();
  }

  async login(actorId: string): Promise<void> {
    if (this.state.status !== 'anonymous') throw unavailable();
    const epoch = ++this.epoch;
    const generation = this.state.nextGeneration;
    this.transition({ type: 'loginStarted' });
    try {
      const value = await this.options.transport.login(actorId);
      if (epoch !== this.epoch) throw unavailable();
      const session = { ...value, generation, expiresAt: this.options.now() + value.expiresIn * 1000 };
      await this.persist(session, epoch);
      this.session = session;
      this.transition({ type: 'loginSucceeded', generation, token: session.accessToken });
    } catch {
      if (epoch === this.epoch) {
        this.transition({ type: 'loginFailed' });
        await this.logout();
      }
      this.log('login');
      throw unavailable();
    }
  }

  async restore(): Promise<void> {
    if (this.state.status !== 'anonymous') return;
    const epoch = this.epoch;
    await this.write(async () => {
      const raw = await this.options.store.load();
      if (epoch !== this.epoch || raw === null) return;
      try {
        const saved: unknown = JSON.parse(raw);
        if (!isSavedSession(saved)) throw unavailable();
        this.state = { ...initialSession(), nextGeneration: saved.generation };
        this.transition({ type: 'loginStarted' });
        this.session = saved;
        this.transition({ type: 'loginSucceeded', generation: saved.generation, token: saved.accessToken });
        if (this.options.now() >= saved.expiresAt) this.transition({ type: 'expired' });
      } catch {
        this.session = null;
        await this.options.store.clear();
        this.state = initialSession();
      }
    });
  }

  async logout(): Promise<void> {
    const epoch = ++this.epoch;
    this.session = null;
    this.flight = null;
    this.transition({ type: 'logout' });
    try {
      await this.write(() => this.options.store.clear());
      if (epoch === this.epoch) this.transition({ type: 'logoutCompleted' });
    } catch {
      this.log('logout');
      throw new RemoteError('rejected', 'No se pudo borrar la sesion almacenada');
    }
  }

  private log(operation: string): void {
    if (this.options.onError) reportError(this.options.onError, unavailable(), { operation });
  }

  private renew(epoch: number, generation: number): Promise<ActiveSession> {
    if (epoch !== this.epoch || this.session === null) return Promise.reject(unavailable());
    if (this.session.generation > generation) return Promise.resolve(this.session);
    if (this.flight?.epoch === epoch) return this.flight.promise;
    const previous = this.session;
    const nextGeneration = this.state.nextGeneration;
    const promise = Promise.resolve().then(async () => {
      try {
        if (epoch !== this.epoch) throw unavailable();
        const value = await this.options.transport.refresh(previous.refreshToken);
        if (epoch !== this.epoch || this.state.status !== 'refreshing') throw unavailable();
        const session = {
          ...previous, ...value, generation: nextGeneration,
          expiresAt: this.options.now() + value.expiresIn * 1000,
        };
        await this.persist(session, epoch);
        this.session = session;
        this.transition({ type: 'refreshSucceeded', generation: nextGeneration, token: session.accessToken });
        return session;
      } catch {
        if (epoch === this.epoch) {
          this.transition({ type: 'refreshFailed', generation: nextGeneration });
          await this.logout();
        }
        this.log('refresh');
        throw unavailable();
      } finally {
        if (this.flight?.epoch === epoch) this.flight = null;
      }
    });
    this.flight = { epoch, promise };
    return promise;
  }

  async request<T extends { status: number }>(send: (session: ActiveSession) => Promise<T>): Promise<T> {
    const epoch = this.epoch;
    const requestId = `session-request-${++this.sequence}`;
    let session = this.session;
    if (session === null) throw unavailable();
    let renewed = false;
    if (this.options.now() >= session.expiresAt || this.state.status === 'refreshing' || this.state.status === 'expired') {
      if (this.state.status === 'authenticated') this.transition({ type: 'expired' });
      this.transition({ type: 'request401', requestId, generation: session.generation });
      session = await this.renew(epoch, session.generation);
      renewed = true;
    }
    const response = await send(session);
    if (epoch !== this.epoch) throw unavailable();
    if (response.status !== 401) return response;
    if (renewed) {
      await this.logout();
      throw unavailable();
    }
    this.transition({ type: 'request401', requestId, generation: session.generation });
    session = await this.renew(epoch, session.generation);
    const retried = await send(session);
    if (epoch !== this.epoch) throw unavailable();
    if (retried.status === 401) {
      await this.logout();
      throw unavailable();
    }
    return retried;
  }
}

function isSavedSession(value: unknown): value is ActiveSession {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return typeof s.actorId === 'string' && s.actorId.length > 0
    && ['reporter', 'technician', 'coordinator'].includes(String(s.role))
    && typeof s.accessToken === 'string' && s.accessToken.length > 0
    && typeof s.refreshToken === 'string' && s.refreshToken.length > 0
    && typeof s.expiresIn === 'number' && Number.isFinite(s.expiresIn) && s.expiresIn > 0
    && typeof s.expiresAt === 'number' && Number.isFinite(s.expiresAt)
    && typeof s.generation === 'number' && Number.isSafeInteger(s.generation) && s.generation >= 0;
}
