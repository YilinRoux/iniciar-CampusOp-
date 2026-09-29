import { LogSink } from '../application/reportError';

// Sink de telemetria en memoria: guarda las ultimas lineas ya sanitizadas.
// Sustituye el destino real (backend de observabilidad) cuando exista.
export function createInMemoryTelemetrySink(limit = 50): { sink: LogSink; entries: readonly string[] } {
  const entries: string[] = [];
  const sink: LogSink = (line) => {
    entries.push(line);
    if (entries.length > limit) entries.shift();
  };
  return { sink, entries };
}
