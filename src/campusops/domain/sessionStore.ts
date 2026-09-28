// Contrato de almacenamiento de sesion. La app depende de esta interfaz, no de un mecanismo concreto.
export interface SessionStore {
  save(token: string): Promise<void>;
  load(): Promise<string | null>;
  clear(): Promise<void>;
}
