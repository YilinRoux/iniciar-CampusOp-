export type RemoteErrorKind =
  | 'invalid_response'
  | 'timeout'
  | 'server_error'
  | 'network_error'
  | 'rate_limited'
  | 'rejected';

export interface RemoteErrorExtra {
  status?: number | undefined;
  retryAfterMs?: number | undefined;
}

export class RemoteError extends Error {
  readonly kind: RemoteErrorKind;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(kind: RemoteErrorKind, message: string, extra: RemoteErrorExtra = {}) {
    super(message);
    Object.setPrototypeOf(this, RemoteError.prototype);
    this.name = 'RemoteError';
    this.kind = kind;
    this.status = extra.status;
    this.retryAfterMs = extra.retryAfterMs;
  }
}