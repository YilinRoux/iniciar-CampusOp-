export type SessionStatus =
  | 'anonymous' | 'logging_in' | 'authenticated' | 'expired' | 'refreshing' | 'closing';

export type SessionEvent = Readonly<{
  type: 'loginStarted' | 'loginSucceeded' | 'loginFailed' | 'expired'
    | 'request401' | 'refreshSucceeded' | 'refreshFailed' | 'logout' | 'logoutCompleted';
  requestId?: string;
  generation?: number;
  token?: string;
}>;

export interface SessionState {
  readonly status: SessionStatus;
  readonly activeGeneration: number | null;
  readonly sessionGeneration: number | null;
  readonly nextGeneration: number;
  readonly persistedToken: string | null;
  readonly refreshCalls: number;
  readonly waitingRequestIds: readonly string[];
  readonly retriedRequestIds: readonly string[];
}

export function initialSession(): SessionState {
  return {
    status: 'anonymous', activeGeneration: null, sessionGeneration: null, nextGeneration: 0,
    persistedToken: null, refreshCalls: 0, waitingRequestIds: [], retriedRequestIds: [],
  };
}

function clearSession(state: SessionState, status: 'anonymous' | 'closing'): SessionState {
  return {
    ...state, status, activeGeneration: null, sessionGeneration: null, persistedToken: null,
    waitingRequestIds: [], nextGeneration: state.nextGeneration + 1,
  };
}

// Motor compartido: no hace HTTP ni escribe almacenamiento. Esas operaciones
// ejecutan las transiciones y comprueban su generación antes de guardar tokens.
export function transitionSession(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'loginStarted':
      return state.status === 'anonymous' ? { ...state, status: 'logging_in' } : state;
    case 'loginSucceeded':
      if (state.status !== 'logging_in' || event.generation !== state.nextGeneration || !event.token?.trim()) return state;
      return {
        ...state, status: 'authenticated', activeGeneration: event.generation, sessionGeneration: event.generation,
        nextGeneration: event.generation + 1, persistedToken: event.token,
        waitingRequestIds: [], retriedRequestIds: [],
      };
    case 'loginFailed':
      return state.status === 'logging_in' ? clearSession(state, 'anonymous') : state;
    case 'expired':
      return state.status === 'authenticated' ? { ...state, status: 'expired' } : state;
    case 'logout':
      return clearSession(state, 'closing');
    case 'logoutCompleted':
      return state.status === 'closing' ? { ...state, status: 'anonymous' } : state;
    case 'request401': {
      if (state.activeGeneration === null || !event.requestId || event.generation === undefined) return state;
      if (!Number.isSafeInteger(event.generation) || event.generation < (state.sessionGeneration ?? 0)) return state;
      if (event.generation > state.activeGeneration) return state;
      // Un 401 después del reintento termina la sesión, sin otro refresh.
      if (state.retriedRequestIds.includes(event.requestId)) return clearSession(state, 'anonymous');
      // Una respuesta tardía de la generación anterior usa el token renovado.
      if (event.generation < state.activeGeneration) {
        return state.status === 'authenticated'
          ? { ...state, retriedRequestIds: [...state.retriedRequestIds, event.requestId] }
          : state;
      }
      const waitingRequestIds = state.waitingRequestIds.includes(event.requestId)
        ? state.waitingRequestIds : [...state.waitingRequestIds, event.requestId];
      return {
        ...state, status: 'refreshing', waitingRequestIds,
        refreshCalls: state.refreshCalls + (state.status === 'refreshing' ? 0 : 1),
      };
    }
    case 'refreshSucceeded':
      if (state.status !== 'refreshing' || event.generation !== state.nextGeneration || !event.token?.trim()) return state;
      return {
        ...state, status: 'authenticated', activeGeneration: event.generation,
        nextGeneration: event.generation + 1, persistedToken: event.token,
        retriedRequestIds: [...state.retriedRequestIds, ...state.waitingRequestIds],
        waitingRequestIds: [],
      };
    case 'refreshFailed':
      if (state.status !== 'refreshing') return state;
      if (event.generation !== undefined && event.generation !== state.nextGeneration) return state;
      return clearSession(state, 'anonymous');
  }
}
