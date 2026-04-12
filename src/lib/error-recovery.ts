import { FallbackCache, createFallbackCache } from './client-cache';

export type SourceKey = 'openalex' | 'arxiv' | 'biorxiv-medrxiv' | 'pmc-europepmc' | 'semantic-scholar' | 'core' | 'zenodo';

export type SourceStatus = 'idle' | 'loading' | 'success' | 'error' | 'unavailable';

export interface SourceResult<T> {
  source: SourceKey;
  data: T | null;
  status: SourceStatus;
  error?: string;
  timestamp: number;
}

export interface SourceError {
  source: SourceKey;
  error: string;
  retryable: boolean;
  timestamp: number;
}

export interface SourceHealth {
  source: SourceKey;
  status: SourceStatus;
  errorCount: number;
  lastError?: string;
  lastSuccess?: number;
}

export class ErrorRecoveryManager {
  private readonly fallbackCache: FallbackCache<unknown>;
  private sourceHealth = new Map<SourceKey, SourceHealth>();
  private errorLog: SourceError[] = [];
  private readonly maxErrorLogSize = 50;
  private readonly errorThreshold = 3;
  private readonly recoveryWindowMs = 5 * 60 * 1000;

  constructor() {
    this.fallbackCache = createFallbackCache();
    this.initializeSourceHealth();
  }

  private initializeSourceHealth(): void {
    const sources: SourceKey[] = [
      'openalex', 'arxiv', 'biorxiv-medrxiv', 'pmc-europepmc', 'semantic-scholar', 'core', 'zenodo'
    ];
    sources.forEach(source => {
      this.sourceHealth.set(source, {
        source,
        status: 'idle',
        errorCount: 0,
      });
    });
  }

  recordSuccess(source: SourceKey): void {
    const health = this.sourceHealth.get(source);
    if (!health) return;

    health.status = 'success';
    health.errorCount = 0;
    health.lastSuccess = Date.now();
    delete health.lastError;
    this.sourceHealth.set(source, health);
  }

  recordError(source: SourceKey, error: string, retryable: boolean = true): void {
    const health = this.sourceHealth.get(source);
    if (!health) return;

    health.errorCount++;
    health.status = 'error';
    health.lastError = error;

    this.errorLog.push({
      source,
      error,
      retryable,
      timestamp: Date.now(),
    });

    if (this.errorLog.length > this.maxErrorLogSize) {
      this.errorLog.shift();
    }

    if (health.errorCount >= this.errorThreshold) {
      health.status = 'unavailable';
    }

    this.sourceHealth.set(source, health);
  }

  getSourceHealth(source: SourceKey): SourceHealth | undefined {
    return this.sourceHealth.get(source);
  }

  getAllSourceHealth(): SourceHealth[] {
    return Array.from(this.sourceHealth.values());
  }

  isSourceAvailable(source: SourceKey): boolean {
    const health = this.sourceHealth.get(source);
    if (!health) return false;
    return health.status !== 'unavailable';
  }

  getAvailableSources(): SourceKey[] {
    return Array.from(this.sourceHealth.entries())
      .filter(([, health]) => health.status !== 'unavailable')
      .map(([source]) => source);
  }

  getHealthySources(): SourceKey[] {
    return Array.from(this.sourceHealth.entries())
      .filter(([, health]) => health.status === 'success')
      .map(([source]) => source);
  }

  cacheFallback<T>(source: SourceKey, key: string, data: T): void {
    this.fallbackCache.set(`${source}:${key}`, data);
  }

  getFallback<T>(source: SourceKey, key: string): T | null {
    return this.fallbackCache.get(`${source}:${key}`) as T | null;
  }

  getRecentErrors(limit: number = 10): SourceError[] {
    return this.errorLog.slice(-limit);
  }

  shouldRetry(source: SourceKey): boolean {
    const health = this.sourceHealth.get(source);
    if (!health) return false;
    if (health.status === 'unavailable') {
      const lastError = this.errorLog
        .filter(e => e.source === source)
        .pop();
      if (!lastError) return true;
      return Date.now() - lastError.timestamp > this.recoveryWindowMs;
    }
    return health.errorCount < this.errorThreshold;
  }

  resetSource(source: SourceKey): void {
    const health = this.sourceHealth.get(source);
    if (health) {
      health.status = 'idle';
      health.errorCount = 0;
      delete health.lastError;
      this.sourceHealth.set(source, health);
    }
  }

  resetAll(): void {
    this.initializeSourceHealth();
    this.errorLog = [];
    this.fallbackCache.clear();
  }

  getErrorRate(source: SourceKey): number {
    const sourceErrors = this.errorLog.filter(e => e.source === source);
    if (sourceErrors.length === 0) return 0;

    const recentErrors = sourceErrors.filter(
      e => Date.now() - e.timestamp < this.recoveryWindowMs
    );

    return recentErrors.length / this.errorThreshold;
  }
}

let errorRecoveryManager: ErrorRecoveryManager | null = null;

export function getErrorRecoveryManager(): ErrorRecoveryManager {
  if (!errorRecoveryManager) {
    errorRecoveryManager = new ErrorRecoveryManager();
  }
  return errorRecoveryManager;
}

export interface PartialFailureResult<T> {
  successful: SourceResult<T>[];
  failed: SourceResult<T>[];
  partial: boolean;
  hasResults: boolean;
}

export function aggregateSourceResults<T>(
  results: SourceResult<T>[]
): PartialFailureResult<T> {
  const successful = results.filter(r => r.status === 'success' && r.data !== null);
  const failed = results.filter(r => r.status === 'error' || r.status === 'unavailable');

  return {
    successful,
    failed,
    partial: failed.length > 0 && successful.length > 0,
    hasResults: successful.length > 0,
  };
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return error.message.includes('fetch') || error.message.includes('network');
  }
  if (error instanceof Error) {
    return (
      error.message.includes('Failed to fetch') ||
      error.message.includes('Network request failed') ||
      error.message.includes('network')
    );
  }
  return false;
}

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('timeout') ||
      error.message.includes('Timeout') ||
      error.name === 'TimeoutError'
    );
  }
  return false;
}

export function isRetryableError(error: unknown): boolean {
  return isNetworkError(error) || isTimeoutError(error);
}