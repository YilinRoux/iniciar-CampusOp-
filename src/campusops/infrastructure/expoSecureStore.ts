import * as SecureStore from 'expo-secure-store';
import { SessionStore } from '../domain/sessionStore';
import { SecureSessionStore } from './secureSessionStore';

// Unico punto que conoce el mecanismo nativo (Keychain en iOS, Keystore en Android).
export function createSessionStore(): SessionStore {
  return new SecureSessionStore(SecureStore);
}
