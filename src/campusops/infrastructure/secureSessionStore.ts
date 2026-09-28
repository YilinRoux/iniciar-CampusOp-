import { SessionStore } from '../domain/sessionStore';

// Subconjunto de la API de expo-secure-store que necesitamos. Se inyecta para poder
// sustituirlo en pruebas sin cargar codigo nativo.
export interface SecureKeyValue {
  setItemAsync(key: string, value: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  deleteItemAsync(key: string): Promise<void>;
}

const SESSION_KEY = 'campusops.session';

export class SecureSessionStore implements SessionStore {
  private readonly backend: SecureKeyValue;

  constructor(backend: SecureKeyValue) {
    this.backend = backend;
  }

  save(token: string): Promise<void> {
    return this.backend.setItemAsync(SESSION_KEY, token);
  }

  load(): Promise<string | null> {
    return this.backend.getItemAsync(SESSION_KEY);
  }

  clear(): Promise<void> {
    return this.backend.deleteItemAsync(SESSION_KEY);
  }
}
