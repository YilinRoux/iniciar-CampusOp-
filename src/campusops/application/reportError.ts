import { redactSensitive, redactText } from '../domain/redaction';

export type LogSink = (line: string) => void;

// Registra un error sin filtrar datos sensibles: redacta mensaje y contexto,
// y nunca incluye la pila (stack) ni el objeto de error completo.
export function reportError(sink: LogSink, error: unknown, context: Record<string, unknown> = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  sink(JSON.stringify({ level: 'error', message: redactText(message), context: redactSensitive(context) }));
}
