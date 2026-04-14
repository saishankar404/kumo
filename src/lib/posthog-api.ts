const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.posthog.com';
const POSTHOG_PROJECT_ID = import.meta.env.VITE_POSTHOG_PROJECT_ID || '380294';

interface PostHogResponse {
  results?: Array<Record<string, unknown>>;
  count?: number;
  data?: Array<Record<string, unknown>>;
}

export interface UserMetrics {
  totalUsers: number;
  usersToday: number;
  usersThisWeek: number;
  usersThisMonth: number;
  dailyTrend: Array<{ date: string; count: number }>;
}

export interface SearchMetrics {
  totalSearches: number;
  searchesToday: number;
  searchesBySource: Record<string, number>;
  errorCount: number;
  errorRate: number;
  errorsBySource: Record<string, number>;
  topQueries: Array<{ query: string; count: number }>;
  resultDistribution: Array<{ range: string; count: number }>;
}

export interface LinkHealthMetrics {
  totalChecks: number;
  successRate: number;
  checksToday: number;
  checksBySource: Record<string, number>;
}

export interface SessionMetrics {
  totalSessions: number;
  avgSessionDuration: number;
  sessionsToday: number;
}

export interface HourlyActivity {
  hour: number;
  count: number;
}

export interface CountryDistribution {
  country: string;
  count: number;
  percentage: number;
}

export class PostHogAPIClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly projectId: string;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 1 minute cache

  constructor() {
    this.apiKey = POSTHOG_API_KEY || '';
    this.projectId = POSTHOG_PROJECT_ID || '380294';
    this.baseUrl = `${POSTHOG_HOST}/api/projects/${this.projectId}`;
  }

  private async fetchWithAuth(endpoint: string, body?: unknown): Promise<PostHogResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`PostHog API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data as T;
    }
    return null;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async getTotalUsers(): Promise<number> {
    const cacheKey = 'totalUsers';
    const cached = this.getCached<number>(cacheKey);
    if (cached !== null) return cached;

    const response = await this.fetchWithAuth('/query/', {
      query: {
        kind: 'PersonsQuery',
        select: ['distinct_id', 'properties'],
        limit: 10000,
      },
    });

    const count = response.results?.length || 0;
    this.setCache(cacheKey, count);
    return count;
  }

  async getUsersToday(): Promise<number> {
    const cacheKey = 'usersToday';
    const cached = this.getCached<number>(cacheKey);
    if (cached !== null) return cached;

    const today = new Date().toISOString().split('T')[0];
    
    const response = await this.fetchWithAuth('/query/', {
      query: {
        kind: 'EventsQuery',
        select: ['distinct_id'],
        where: [`properties.epoch_timestamp >= '${today}'`],
        limit: 10000,
      },
    });

    const uniqueUsers = new Set(response.results?.map((r: Record<string, unknown>) => r.distinct_id)).size;
    this.setCache(cacheKey, uniqueUsers);
    return uniqueUsers;
  }

  async getTotalSearches(): Promise<number> {
    const cacheKey = 'totalSearches';
    const cached = this.getCached<number>(cacheKey);
    if (cached !== null) return cached;

    const response = await this.fetchWithAuth('/query/', {
      query: {
        kind: 'EventsQuery',
        event: 'api_search_requested',
        limit: 100000,
      },
    });

    const count = response.results?.length || 0;
    this.setCache(cacheKey, count);
    return count;
  }

  async getSearchesBySource(): Promise<Record<string, number>> {
    const cacheKey = 'searchesBySource';
    const cached = this.getCached<Record<string, number>>(cacheKey);
    if (cached !== null) return cached;

    const sourceCounts: Record<string, number> = {
      openalex: 0,
      arxiv: 0,
      'semantic-scholar': 0,
      core: 0,
      zenodo: 0,
    };

    try {
      const response = await this.fetchWithAuth('/query/', {
        query: {
          kind: 'EventsQuery',
          event: 'api_search_requested',
          select: ['properties.source'],
          limit: 100000,
        },
      });

      response.results?.forEach((r) => {
        const source = (r as Record<string, unknown>).properties?.source as string;
        if (source && sourceCounts[source] !== undefined) {
          sourceCounts[source]++;
        }
      });
    } catch {
      // Return empty if API fails
    }

    this.setCache(cacheKey, sourceCounts);
    return sourceCounts;
  }

  async getErrorRate(): Promise<number> {
    const cacheKey = 'errorRate';
    const cached = this.getCached<number>(cacheKey);
    if (cached !== null) return cached;

    try {
      const [totalResponse, errorResponse] = await Promise.all([
        this.fetchWithAuth('/query/', {
          query: {
            kind: 'EventsQuery',
            event: 'api_search_requested',
            limit: 100000,
          },
        }),
        this.fetchWithAuth('/query/', {
          query: {
            kind: 'EventsQuery',
            event: 'api_search_error',
            limit: 100000,
          },
        }),
      ]);

      const total = totalResponse.results?.length || 0;
      const errors = errorResponse.results?.length || 0;
      const rate = total > 0 ? (errors / total) * 100 : 0;
      
      this.setCache(cacheKey, rate);
      return rate;
    } catch {
      return 0;
    }
  }

  async getPDFHealthMetrics(): Promise<LinkHealthMetrics> {
    const cacheKey = 'pdfHealth';
    const cached = this.getCached<LinkHealthMetrics>(cacheKey);
    if (cached !== null) return cached;

    const metrics: LinkHealthMetrics = {
      totalChecks: 0,
      successRate: 0,
      checksToday: 0,
      checksBySource: {},
    };

    try {
      const response = await this.fetchWithAuth('/query/', {
        query: {
          kind: 'EventsQuery',
          event: 'api_link_checked',
          select: ['properties.ok', 'properties.url'],
          limit: 100000,
        },
      });

      const results = (response.results || []) as Array<Record<string, unknown>>;
      metrics.totalChecks = results.length;
      
      const successful = results.filter((r) => r.properties?.ok === true).length;
      metrics.successRate = metrics.totalChecks > 0 ? (successful / metrics.totalChecks) * 100 : 0;

      const today = new Date().toISOString().split('T')[0];
      const todayCount = results.filter((r) => {
        const url = r.properties?.url as string;
        return url?.includes(today);
      }).length;
      metrics.checksToday = todayCount;
    } catch {
      // Return defaults if API fails
    }

    this.setCache(cacheKey, metrics);
    return metrics;
  }

  async getUsersTrend(days: number = 30): Promise<Array<{ date: string; count: number }>> {
    const cacheKey = `usersTrend_${days}`;
    const cached = this.getCached<Array<{ date: string; count: number }>>(cacheKey);
    if (cached !== null) return cached;

    const trend: Array<{ date: string; count: number }> = [];
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const response = await this.fetchWithAuth('/query/', {
        query: {
          kind: 'EventsQuery',
          event: '$pageview',
          select: ['toStartOfDay(properties.$timestamp)', 'distinct_id'],
          where: [`properties.$timestamp >= '${startDate.toISOString()}'`],
          limit: 100000,
        },
      });

      const dailyUsers = new Map<string, Set<string>>();
      
      response.results?.forEach((r: Record<string, unknown>) => {
        const date = (r.toStartOfDay_properties_timestamp_ as string)?.split('T')[0];
        const distinctId = r.distinct_id as string;
        
        if (date && distinctId) {
          if (!dailyUsers.has(date)) {
            dailyUsers.set(date, new Set());
          }
          dailyUsers.get(date)!.add(distinctId);
        }
      });

      dailyUsers.forEach((users, date) => {
        trend.push({ date, count: users.size });
      });

      trend.sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      // Return empty trend if API fails
    }

    this.setCache(cacheKey, trend);
    return trend;
  }

  async getTopQueries(limit: number = 10): Promise<Array<{ query: string; count: number }>> {
    const cacheKey = `topQueries_${limit}`;
    const cached = this.getCached<Array<{ query: string; count: number }>>(cacheKey);
    if (cached !== null) return cached;

    const queryCounts = new Map<string, number>();

    try {
      const response = await this.fetchWithAuth('/query/', {
        query: {
          kind: 'EventsQuery',
          event: 'api_search_requested',
          select: ['properties.query'],
          limit: 100000,
        },
      });

      response.results?.forEach((r: Record<string, unknown>) => {
        const query = r.properties?.query as string;
        if (query) {
          queryCounts.set(query, (queryCounts.get(query) || 0) + 1);
        }
      });

      const sorted = Array.from(queryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([query, count]) => ({ query, count }));

      this.setCache(cacheKey, sorted);
      return sorted;
    } catch {
      return [];
    }
  }

  async getHourlyActivity(): Promise<HourlyActivity[]> {
    const cacheKey = 'hourlyActivity';
    const cached = this.getCached<HourlyActivity[]>(cacheKey);
    if (cached !== null) return cached;

    const hourlyCounts = Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 }));

    try {
      const response = await this.fetchWithAuth('/query/', {
        query: {
          kind: 'EventsQuery',
          event: 'api_search_requested',
          select: ['formatDateTime(properties.epoch_timestamp, "HH") as hour', 'count()'],
          limit: 100000,
          groupBy: ['hour'],
        },
      });

      response.results?.forEach((r: Record<string, unknown>) => {
        const hourStr = r.hour as string;
        const count = Number(r.count) || 0;
        if (hourStr) {
          const hour = parseInt(hourStr, 10);
          if (hour >= 0 && hour < 24) {
            hourlyCounts[hour].count += count;
          }
        }
      });
    } catch {
      // Return defaults if API fails
    }

    this.setCache(cacheKey, hourlyCounts);
    return hourlyCounts;
  }

  clearCache(): void {
    this.cache.clear();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.projectId);
  }
}

let posthogClient: PostHogAPIClient | null = null;

export function getPostHogClient(): PostHogAPIClient {
  if (!posthogClient) {
    posthogClient = new PostHogAPIClient();
  }
  return posthogClient;
}

export async function fetchAllMetrics() {
  const client = getPostHogClient();
  
  if (!client.isConfigured()) {
    throw new Error('PostHog not configured. Please set VITE_POSTHOG_API_KEY and VITE_POSTHOG_PROJECT_ID');
  }

  const [totalUsers, usersToday, totalSearches, searchesBySource, errorRate, pdfHealth, topQueries, hourlyActivity] = await Promise.all([
    client.getTotalUsers(),
    client.getUsersToday(),
    client.getTotalSearches(),
    client.getSearchesBySource(),
    client.getErrorRate(),
    client.getPDFHealthMetrics(),
    client.getTopQueries(10),
    client.getHourlyActivity(),
  ]);

  return {
    totalUsers,
    usersToday,
    totalSearches,
    searchesBySource,
    errorRate,
    pdfHealth,
    topQueries,
    hourlyActivity,
  };
}