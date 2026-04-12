import {
  runSearch,
  type RunSearchOptions,
  type SearchResultBundle,
  type SearchState,
  type NormalizedPaperResult,
  type SourceKey,
} from './search-engine';
import { RequestQueue, CircuitBreaker, withRetry, hashString } from './request-manager';
import { ClientCache, hashQuery, createSearchCache } from './client-cache';
import {
  saveSearchState,
  loadSearchState,
  getDefaultSearchState as getDefaultState,
} from './search-state';
import {
  ErrorRecoveryManager,
  getErrorRecoveryManager,
  type SourceHealth,
} from './error-recovery';

export interface IntegratedSearchState extends SearchState {
  cachedAt?: number;
  isFromCache?: boolean;
}

export interface IntegratedSearchOptions {
  state: SearchState;
  signal?: AbortSignal;
  onUpdate?: (result: SearchResultBundle & { isFromCache?: boolean }) => void;
  enableCache?: boolean;
  enableQueue?: boolean;
  maxConcurrent?: number;
  cacheTtlMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
}

const DEFAULT_CACHE_TTL = 30 * 60 * 1000;
const DEFAULT_MAX_CONCURRENT = 3;

class IntegratedSearchEngine {
  private cache: ClientCache<NormalizedPaperResult[]>;
  private requestQueue: RequestQueue;
  private circuitBreakers: Map<SourceKey, CircuitBreaker>;
  private errorRecovery: ErrorRecoveryManager;
  private lastState: SearchState | null = null;
  private pendingSearchKey: string | null = null;

  constructor() {
    this.cache = createSearchCache<NormalizedPaperResult[]>();
    this.requestQueue = new RequestQueue({
      maxConcurrent: DEFAULT_MAX_CONCURRENT,
      maxQueueSize: 50,
    });
    this.circuitBreakers = new Map();
    this.errorRecovery = getErrorRecoveryManager();
    this.initializeCircuitBreakers();
  }

  private initializeCircuitBreakers(): void {
    const sources: SourceKey[] = [
      'openalex',
      'arxiv',
      'biorxiv-medrxiv',
      'pmc-europepmc',
      'semantic-scholar',
      'core',
      'zenodo',
    ];

    sources.forEach(source => {
      this.circuitBreakers.set(
        source,
        new CircuitBreaker({
          failureThreshold: 3,
          recoveryTimeoutMs: 30000,
          halfOpenAttempts: 1,
        })
      );
    });
  }

  private getCacheKey(state: SearchState): string {
    const filters = {
      type: state.type,
      sort: state.sort,
      year: state.year,
      source: state.source,
    };
    return hashQuery(state.q, filters);
  }

  private getCircuitBreaker(source: SourceKey): CircuitBreaker {
    return this.circuitBreakers.get(source) || new CircuitBreaker();
  }

  async search(options: IntegratedSearchOptions): Promise<SearchResultBundle> {
    const {
      state,
      signal,
      enableCache = true,
      enableQueue = true,
      maxConcurrent = DEFAULT_MAX_CONCURRENT,
      onUpdate,
    } = options;

    const cacheKey = this.getCacheKey(state);

    if (enableCache) {
      const cachedResults = this.cache.get(cacheKey);
      if (cachedResults && cachedResults.length > 0) {
        const cachedBundle: SearchResultBundle = {
          mode: 'keyword',
          results: cachedResults,
          progress: [],
          partialFailure: false,
          fullFailure: false,
        };

        onUpdate?.({
          ...cachedBundle,
          isFromCache: true,
        });

        this.fetchFreshInBackground(state, cacheKey, onUpdate);

        return cachedBundle;
      }
    }

    this.pendingSearchKey = cacheKey;

    if (enableQueue) {
      this.requestQueue = new RequestQueue({
        maxConcurrent,
        maxQueueSize: 50,
      });
    }

    const searchKey = `${state.q}-${state.page}-${state.type}-${state.sort}`;
    
    const abortController = signal ? undefined : new AbortController();
    const effectiveSignal = signal || abortController?.signal || new AbortSignal();

    const wrappedSearch = async (): Promise<SearchResultBundle> => {
      return new Promise((resolve, reject) => {
        const progress: SearchResultBundle['progress'] = [];
        
        const wrappedUpdate = (result: SearchResultBundle) => {
          if (result.progress) {
            result.progress.forEach(p => {
              if (p.error) {
                this.errorRecovery.recordError(
                  p.key as SourceKey,
                  p.error,
                  true
                );
              } else if (p.count && p.count > 0) {
                this.errorRecovery.recordSuccess(p.key as SourceKey);
              }
            });
          }

          onUpdate?.(result);
        };

        const searchOptions: RunSearchOptions = {
          state,
          signal: effectiveSignal,
          onUpdate: wrappedUpdate,
        };

        runSearch(searchOptions)
          .then(() => {
            const finalResults = this.cache.get(cacheKey) || [];
            resolve({
              mode: 'keyword',
              results: finalResults,
              progress,
              partialFailure: false,
              fullFailure: false,
            });
          })
          .catch(reject);
      });
    };

    try {
      let result: SearchResultBundle;

      if (enableQueue) {
        result = await this.requestQueue.add(searchKey, wrappedSearch);
      } else {
        result = await wrappedSearch();
      }

      if (result.results.length > 0 && enableCache) {
        this.cache.set(cacheKey, result.results);
      }

      this.lastState = state;
      this.saveState(state);

      this.pendingSearchKey = null;

      return result;
    } catch (error) {
      this.pendingSearchKey = null;

      const fallbackData = this.errorRecovery.getFallback<NormalizedPaperResult[]>(
        'openalex',
        cacheKey
      );

      if (fallbackData) {
        return {
          mode: 'keyword',
          results: fallbackData,
          progress: [],
          partialFailure: true,
          fullFailure: false,
        };
      }

      throw error;
    }
  }

  private async fetchFreshInBackground(
    state: SearchState,
    cacheKey: string,
    onUpdate?: (result: SearchResultBundle & { isFromCache?: boolean }) => void
  ): Promise<void> {
    try {
      const progress: SearchResultBundle['progress'] = [];
      
      await runSearch({
        state,
        signal: new AbortSignal(),
        onUpdate: (result) => {
          progress.push(...result.progress);
          if (result.results.length > 0) {
            this.cache.set(cacheKey, result.results);
          }
          onUpdate?.(result);
        },
      });
    } catch {
      // Silently fail - we already served cached data
    }
  }

  private saveState(state: SearchState): void {
    try {
      saveSearchState(state);
    } catch {
      console.warn('Failed to save search state');
    }
  }

  loadState(): SearchState | null {
    try {
      return loadSearchState();
    } catch {
      return null;
    }
  }

  getCacheStats(): { size: number; ttlMs: number } {
    return this.cache.getStats();
  }

  clearCache(): void {
    this.cache.clear();
  }

  invalidateCache(query?: string): void {
    if (query) {
      const defaultState = getDefaultState();
      const key = this.getCacheKey({ ...defaultState, q: query });
      this.cache.invalidate(key);
    } else {
      this.cache.clear();
    }
  }

  getSourceHealth(): SourceHealth[] {
    return this.errorRecovery.getAllSourceHealth();
  }

  isSourceAvailable(source: SourceKey): boolean {
    const breaker = this.getCircuitBreaker(source);
    return breaker.isAvailable() && this.errorRecovery.isSourceAvailable(source);
  }

  getAvailableSources(): SourceKey[] {
    return this.errorRecovery.getAvailableSources() as SourceKey[];
  }

  resetErrorRecovery(): void {
    this.errorRecovery.resetAll();
    this.circuitBreakers.forEach(breaker => breaker.reset());
  }

  async searchWithRetry(options: IntegratedSearchOptions): Promise<SearchResultBundle> {
    const { maxRetries = 2, baseDelayMs = 1000 } = options;

    return withRetry(
      () => this.search(options),
      {
        maxRetries,
        baseDelayMs,
        maxDelayMs: 5000,
        shouldRetry: (error) => {
          return error.message.includes('network') ||
                 error.message.includes('timeout') ||
                 error.message.includes('failed');
        },
      }
    );
  }

  hasInFlightRequest(): boolean {
    return this.pendingSearchKey !== null;
  }

  getQueueSize(): number {
    return this.requestQueue.getQueueSize();
  }
}

let integratedSearchEngine: IntegratedSearchEngine | null = null;

export function getIntegratedSearchEngine(): IntegratedSearchEngine {
  if (!integratedSearchEngine) {
    integratedSearchEngine = new IntegratedSearchEngine();
  }
  return integratedSearchEngine;
}

export async function integratedSearch(
  options: IntegratedSearchOptions
): Promise<SearchResultBundle> {
  const engine = getIntegratedSearchEngine();
  return engine.search(options);
}

export function useIntegratedSearch() {
  const engine = getIntegratedSearchEngine();

  return {
    search: (options: IntegratedSearchOptions) => engine.search(options),
    searchWithRetry: (options: IntegratedSearchOptions) => engine.searchWithRetry(options),
    loadState: () => engine.loadState(),
    getCacheStats: () => engine.getCacheStats(),
    clearCache: () => engine.clearCache(),
    invalidateCache: (query?: string) => engine.invalidateCache(query),
    getSourceHealth: () => engine.getSourceHealth(),
    isSourceAvailable: (source: SourceKey) => engine.isSourceAvailable(source),
    getAvailableSources: () => engine.getAvailableSources(),
    resetErrorRecovery: () => engine.resetErrorRecovery(),
    hasInFlightRequest: () => engine.hasInFlightRequest(),
    getQueueSize: () => engine.getQueueSize(),
  };
}

export { type SourceKey, type SearchState, type NormalizedPaperResult, type SearchResultBundle };