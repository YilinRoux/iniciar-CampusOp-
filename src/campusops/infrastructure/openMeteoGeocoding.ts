import type { IncidentLocation } from '../contracts';
import type { FetchLike } from './httpIncidentRepository';
import { planRetry, selectIncidentLocation } from '../../course-evaluation';

export type OpenMeteoResult = Readonly<{
  location: IncidentLocation;
  fromCache: boolean;
  attempts: number;
}>;

export class OpenMeteoGeocoding {
  private readonly cache = new Map<string, IncidentLocation>();

  constructor(
    private readonly options: {
      fetch: FetchLike;
      timeoutMs: number;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  async resolve(query: string, manualLabel: string): Promise<OpenMeteoResult> {
    const normalized = query.trim().toLowerCase();
    const fallback = selectIncidentLocation(null, manualLabel);

    if (normalized.length < 2) {
      return { location: fallback, fromCache: false, attempts: 0 };
    }

    const cached = this.cache.get(normalized);
    if (cached) {
      return { location: cached, fromCache: true, attempts: 0 };
    }

    const sleep = this.options.sleep ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

    for (let attempt = 1; attempt <= 4; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

      try {
        const url =
          'https://geocoding-api.open-meteo.com/v1/search' +
          `?name=${encodeURIComponent(query.trim())}&count=1&language=es&format=json`;

        const response = await this.options.fetch(url, {
          method: 'GET',
          headers: {},
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.status < 200 || response.status >= 300) {
          const raw = response.headers.get('Retry-After');
          const seconds = raw === null ? NaN : Number(raw);
          const retryAfterMs =
            Number.isFinite(seconds) && seconds >= 0
              ? seconds * 1000
              : undefined;

          const policy = planRetry({
            method: 'GET',
            status: response.status,
            attempt,
            ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
          });

          if (!policy.retry) {
            return { location: fallback, fromCache: false, attempts: attempt };
          }

          await sleep(policy.delayMs);
          continue;
        }

        let payload: unknown;

        try {
          payload = JSON.parse(await response.text());
        } catch {
          return { location: fallback, fromCache: false, attempts: attempt };
        }

        if (!payload || typeof payload !== 'object' || !('results' in payload)) {
          return { location: fallback, fromCache: false, attempts: attempt };
        }

        const results = (payload as { results?: unknown }).results;

        if (!Array.isArray(results) || results.length === 0) {
          return { location: fallback, fromCache: false, attempts: attempt };
        }

        const first: unknown = results[0];

        if (!first || typeof first !== 'object') {
          return { location: fallback, fromCache: false, attempts: attempt };
        }

        const place = first as Record<string, unknown>;

        const label = [place.name, place.admin1, place.country]
          .filter((part): part is string =>
            typeof part === 'string' && part.trim().length > 0)
          .join(', ');

        const location = selectIncidentLocation({
          label,
          latitude: place.latitude,
          longitude: place.longitude,
        }, manualLabel);

        if (location.source === 'provider') {
          this.cache.set(normalized, location);
        }

        return { location, fromCache: false, attempts: attempt };
      } catch {
        const policy = planRetry({
          method: 'GET',
          status: 'timeout',
          attempt,
        });

        if (!policy.retry) {
          return { location: fallback, fromCache: false, attempts: attempt };
        }

        await sleep(policy.delayMs);
      } finally {
        clearTimeout(timer);
      }
    }

    return { location: fallback, fromCache: false, attempts: 4 };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
