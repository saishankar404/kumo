import { useCallback, useEffect, useRef, useState } from 'react';
import { getSearchHistory } from './search-history';
import { getFilterPresets } from './filter-presets';
import { fetchAllMetrics, getPostHogClient, type PostHogAPIClient } from './posthog-api';

const SESSION_STORAGE_KEY = 'fp_session_metrics';

export interface SessionMetrics {
  sessionId: string;
  startTime: number;
  searches: number;
  searchesWithResults: number;
  cacheHits: number;
  cacheMisses: number;
  totalResults: number;
  filterChanges: number;
  presetUses: number;
  loadMoreClicks: number;
  avgSearchLatencyMs: number;
  lastSearchTimestamp: number | null;
}

function createInitialSessionMetrics(): SessionMetrics {
  return {
    sessionId: crypto.randomUUID(),
    startTime: Date.now(),
    searches: 0,
    searchesWithResults: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalResults: 0,
    filterChanges: 0,
    presetUses: 0,
    loadMoreClicks: 0,
    avgSearchLatencyMs: 0,
    lastSearchTimestamp: null,
  };
}

function loadSessionMetrics(): SessionMetrics {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as SessionMetrics;
      if (Date.now() - parsed.startTime < 30 * 60 * 1000) {
        return parsed;
      }
    }
} catch {
      // Ignore parse errors
    }
    return createInitialSessionMetrics();
  }

  function saveSessionMetrics(metrics: SessionMetrics): void {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(metrics));
    } catch {
      // Ignore storage errors
    }
  }

export function useSessionMetrics() {
  const [metrics, setMetrics] = useState<SessionMetrics>(() => loadSessionMetrics());
  const latencySamples = useRef<number[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const current = loadSessionMetrics();
      if (current.sessionId !== metrics.sessionId) {
        setMetrics(current);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [metrics.sessionId]);

  const recordSearch = useCallback((resultCount: number, latencyMs: number, isFromCache: boolean) => {
    setMetrics(prev => {
      const newMetrics = { ...prev };
      
      newMetrics.searches += 1;
      newMetrics.lastSearchTimestamp = Date.now();
      
      if (resultCount > 0) {
        newMetrics.searchesWithResults += 1;
        newMetrics.totalResults += resultCount;
      }
      
      if (isFromCache) {
        newMetrics.cacheHits += 1;
      } else {
        newMetrics.cacheMisses += 1;
      }
      
      latencySamples.current.push(latencyMs);
      if (latencySamples.current.length > 50) {
        latencySamples.current.shift();
      }
      
      const avg = latencySamples.current.reduce((a, b) => a + b, 0) / latencySamples.current.length;
      newMetrics.avgSearchLatencyMs = Math.round(avg);
      
      saveSessionMetrics(newMetrics);
      return newMetrics;
    });
  }, []);

  const recordFilterChange = useCallback(() => {
    setMetrics(prev => {
      const newMetrics = { ...prev, filterChanges: prev.filterChanges + 1 };
      saveSessionMetrics(newMetrics);
      return newMetrics;
    });
  }, []);

  const recordPresetUse = useCallback(() => {
    setMetrics(prev => {
      const newMetrics = { ...prev, presetUses: prev.presetUses + 1 };
      saveSessionMetrics(newMetrics);
      return newMetrics;
    });
  }, []);

  const recordLoadMore = useCallback(() => {
    setMetrics(prev => {
      const newMetrics = { ...prev, loadMoreClicks: prev.loadMoreClicks + 1 };
      saveSessionMetrics(newMetrics);
      return newMetrics;
    });
  }, []);

  const getCacheHitRate = useCallback(() => {
    const total = metrics.cacheHits + metrics.cacheMisses;
    if (total === 0) return 0;
    return Math.round((metrics.cacheHits / total) * 100);
  }, [metrics.cacheHits, metrics.cacheMisses]);

  const getSessionDuration = useCallback(() => {
    return Date.now() - metrics.startTime;
  }, [metrics.startTime]);

  const resetSession = useCallback(() => {
    const newMetrics = createInitialSessionMetrics();
    setMetrics(newMetrics);
    latencySamples.current = [];
    saveSessionMetrics(newMetrics);
  }, []);

  return {
    metrics,
    recordSearch,
    recordFilterChange,
    recordPresetUse,
    recordLoadMore,
    getCacheHitRate,
    getSessionDuration,
    resetSession,
  };
}

export interface CacheAnalytics {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  storageType: string;
  sizeBytes: number;
}

export function useCacheAnalytics() {
  const [analytics, setAnalytics] = useState<CacheAnalytics>({
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalEntries: 0,
    storageType: 'localStorage',
    sizeBytes: 0,
  });

  const sessionMetrics = useSessionMetrics();
  const { metrics } = sessionMetrics;

  useEffect(() => {
    const total = metrics.cacheHits + metrics.cacheMisses;
    const hitRate = total > 0 ? Math.round((metrics.cacheHits / total) * 100) : 0;

    setAnalytics(prev => ({
      ...prev,
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
      hitRate,
      totalEntries: metrics.searchesWithResults,
    }));
  }, [metrics.cacheHits, metrics.cacheMisses, metrics.searchesWithResults]);

  return {
    analytics,
    ...sessionMetrics,
  };
}

export interface SearchAnalytics {
  totalSearches: number;
  searchesWithResults: number;
  avgResultsPerSearch: number;
  avgLatencyMs: number;
  sessionDuration: number;
}

export function useSearchAnalytics() {
  const { metrics, getSessionDuration } = useSessionMetrics();

  const analytics: SearchAnalytics = {
    totalSearches: metrics.searches,
    searchesWithResults: metrics.searchesWithResults,
    avgResultsPerSearch: metrics.searches > 0 
      ? Math.round(metrics.totalResults / metrics.searches) 
      : 0,
    avgLatencyMs: metrics.avgSearchLatencyMs,
    sessionDuration: getSessionDuration(),
  };

  return analytics;
}

export interface SourceHealthData {
  source: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  errorCount: number;
  lastError?: string;
  lastSuccess?: number;
}

export function useSourceHealth() {
  const [sources, setSources] = useState<SourceHealthData[]>([]);

  const sourceLabels: Record<string, string> = {
    openalex: 'OpenAlex',
    arxiv: 'arXiv',
    'biorxiv-medrxiv': 'BioRxiv',
    'pmc-europepmc': 'Europe PMC',
    'semantic-scholar': 'Semantic Scholar',
    core: 'CORE',
    zenodo: 'Zenodo',
  };

  useEffect(() => {
    const defaultSources: SourceHealthData[] = Object.keys(sourceLabels).map(key => ({
      source: key,
      status: 'healthy' as const,
      errorCount: 0,
    }));
    setSources(defaultSources);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { sources, sourceLabels };
}

export interface PerformanceMetrics {
  pageLoadTime: number;
  timeToFirstResult: number;
  memoryUsage?: number;
}

export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    pageLoadTime: 0,
    timeToFirstResult: 0,
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        setMetrics(prev => ({
          ...prev,
          pageLoadTime: Math.round(navigation.loadEventEnd - navigation.fetchStart),
        }));
      }
    }
  }, []);

  const recordTimeToFirstResult = useCallback((ms: number) => {
    setMetrics(prev => ({
      ...prev,
      timeToFirstResult: ms,
    }));
  }, []);

  return { metrics, recordTimeToFirstResult };
}

export interface HistoryAnalytics {
  recentSearchesCount: number;
  filterPresetsCount: number;
  mostUsedPresets: string[];
}

export function useHistoryAnalytics(): HistoryAnalytics {
  const [analytics, setAnalytics] = useState<HistoryAnalytics>({
    recentSearchesCount: 0,
    filterPresetsCount: 0,
    mostUsedPresets: [],
  });

  useEffect(() => {
    const history = getSearchHistory();
    const presets = getFilterPresets();

    setAnalytics({
      recentSearchesCount: history.getAll().length,
      filterPresetsCount: presets.getCount(),
      mostUsedPresets: presets.getAll().map(p => p.name).slice(0, 5),
    });
  }, []);

  return analytics;
}

export interface PostHogMetrics {
  loading: boolean;
  error?: string;
  totalUsers?: number;
  usersToday?: number;
  totalSearches?: number;
  searchesBySource?: Record<string, number>;
  errorRate?: number;
  pdfChecks?: number;
  pdfSuccessRate?: number;
  topQueries?: Array<{ query: string; count: number }>;
  hourlyActivity?: Array<{ hour: number; count: number }>;
}

const METRICS_API_DELAY = 1000;

export function usePostHogMetrics() {
  const [metrics, setMetrics] = useState<PostHogMetrics>({ loading: false });
  const [hasCalled, setHasCalled] = useState(false);

  const fetchMetrics = useCallback(async () => {
    if (hasCalled) return;
    setHasCalled(true);
    setMetrics(prev => ({ ...prev, loading: true }));

    try {
      const client = getPostHogClient();
      
      if (!client.isConfigured()) {
        throw new Error('PostHog not configured');
      }

      const data = await fetchAllMetrics();

      const postHogMetrics: PostHogMetrics = {
        loading: false,
        totalUsers: data.totalUsers,
        usersToday: data.usersToday,
        totalSearches: data.totalSearches,
        searchesBySource: data.searchesBySource,
        errorRate: data.errorRate,
        pdfChecks: data.pdfHealth.totalChecks,
        pdfSuccessRate: data.pdfHealth.successRate,
        topQueries: data.topQueries,
        hourlyActivity: data.hourlyActivity,
      };

      setMetrics(postHogMetrics);
    } catch (error) {
      setMetrics(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch metrics',
      }));
    }
  }, [hasCalled]);

  return { metrics, fetchMetrics };
}

export interface CombinedMetrics {
  session: SessionMetrics;
  cache: CacheAnalytics;
  search: SearchAnalytics;
  performance: PerformanceMetrics;
  history: HistoryAnalytics;
}

export function useCombinedMetrics() {
  const session = useSessionMetrics();
  const cache = useCacheAnalytics();
  const search = useSearchAnalytics();
  const performance = usePerformanceMetrics();
  const history = useHistoryAnalytics();

  const combined: CombinedMetrics = {
    session: session.metrics,
    cache: cache.analytics,
    search,
    performance: performance.metrics,
    history,
  };

  return {
    ...session,
    ...cache,
    ...search,
    ...performance,
    ...history,
    combined,
  };
}