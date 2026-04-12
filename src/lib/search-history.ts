import type { SearchTypeFilter, SearchSort, SourceKey } from './search-engine';

export interface SearchHistoryEntry {
  id: string;
  query: string;
  type: SearchTypeFilter;
  sort: SearchSort;
  year: string;
  filter: string;
  source: string;
  timestamp: number;
}

export interface SearchHistoryConfig {
  maxEntries: number;
  storageKey: string;
}

const DEFAULT_CONFIG: SearchHistoryConfig = {
  maxEntries: 20,
  storageKey: 'fp_search_history',
};

export class SearchHistory {
  private readonly config: SearchHistoryConfig;
  private history: SearchHistoryEntry[] = [];

  constructor(config: Partial<SearchHistoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (!stored) {
        this.history = [];
        return;
      }

      const parsed = JSON.parse(stored) as SearchHistoryEntry[];
      this.history = parsed.slice(0, this.config.maxEntries);
    } catch {
      this.history = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.history));
    } catch {
      this.history = [];
    }
  }

  add(entry: Omit<SearchHistoryEntry, 'id' | 'timestamp'>): void {
    const newEntry: SearchHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    const existingIndex = this.history.findIndex(
      e => e.query.toLowerCase() === entry.query.toLowerCase() &&
           e.type === entry.type &&
           e.sort === entry.sort &&
           e.source === entry.source
    );

    if (existingIndex !== -1) {
      this.history.splice(existingIndex, 1);
    }

    this.history.unshift(newEntry);

    if (this.history.length > this.config.maxEntries) {
      this.history = this.history.slice(0, this.config.maxEntries);
    }

    this.saveToStorage();
  }

  getAll(): SearchHistoryEntry[] {
    return [...this.history];
  }

  getRecent(count: number = 10): SearchHistoryEntry[] {
    return this.history.slice(0, count);
  }

  remove(id: string): void {
    this.history = this.history.filter(e => e.id !== id);
    this.saveToStorage();
  }

  clear(): void {
    this.history = [];
    this.saveToStorage();
  }

  search(query: string): SearchHistoryEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.history.filter(e => 
      e.query.toLowerCase().includes(lowerQuery)
    );
  }

  hasRecent(): boolean {
    return this.history.length > 0;
  }
}

let searchHistoryInstance: SearchHistory | null = null;

export function getSearchHistory(): SearchHistory {
  if (!searchHistoryInstance) {
    searchHistoryInstance = new SearchHistory();
  }
  return searchHistoryInstance;
}

export function addToSearchHistory(
  query: string,
  type: SearchTypeFilter = 'all',
  sort: SearchSort = 'relevance',
  year: string = '',
  filter: string = '',
  source: string = ''
): void {
  const history = getSearchHistory();
  history.add({ query, type, sort, year, filter, source });
}

export function getRecentSearches(count: number = 10): SearchHistoryEntry[] {
  const history = getSearchHistory();
  return history.getRecent(count);
}

export function clearSearchHistory(): void {
  const history = getSearchHistory();
  history.clear();
}

export function removeSearchEntry(id: string): void {
  const history = getSearchHistory();
  history.remove(id);
}