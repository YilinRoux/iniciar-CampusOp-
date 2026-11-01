import type { IncidentLocation } from '../contracts';
import { planRetry, selectIncidentLocation } from '../../course-evaluation';

export type GeocodingResult = Readonly<{
  location: IncidentLocation;
  fromCache: boolean;
  attempts: number;
}>;

type GeocodingFetch = typeof fetch;

export class GeocodingAdapter {
  private readonly cache = new Map<string, IncidentLocation>();

  constructor(
    private readonly options: {
      baseUrl: string;
      fetch: GeocodingFetch;
      timeoutMs: number;
      scenario?: string;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  async resolve(query: string, manualLabel: string): Promise<GeocodingResult> {
    const normalized = query.trim().toLowerCase();
    const fallback = selectIncidentLocation(null, manualLabel);

    if (!normalized) {
      return { location: fallback, fromCache: false, attempts: 0 };
    }

    const cached = this.cache.get(normalized);
    if (cached) {
      return { location: cached, fromCache: true, attempts: 0 };
    }

    const sleep = this.options.sleep ?? ((ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)));

    for (let attempt = 1; attempt <= 4; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

      try {
        const url =
          `${this.options.baseUrl}/v1/geocoding?q=${encodeURIComponent(query)}`;

        const response = await this.options.fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: this.options.scenario
            ? { 'X-Course-Scenario': this.options.scenario }
            : {},
        });

        if (!response.ok) {
          const rawRetryAfter = response.headers.get('Retry-After');
          const seconds = rawRetryAfter === null ? NaN : Number(rawRetryAfter);
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

        const payload: unknown = await response.json();
        const location = selectIncidentLocation(payload, manualLabel);

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
