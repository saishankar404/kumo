import { hashString } from './request-manager';

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  expiresAt: number;
}

export interface ClientCacheConfig {
  ttlMs: number;
  maxSize?: number;
  storageKey?: string;
  useIndexedDB?: boolean;
}

const DB_NAME = 'kumo_cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

let db: IDBDatabase | null = null;

async function openIndexedDB(): Promise<IDBDatabase | null> {
  if (db) return db;

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => resolve(null);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

export class ClientCache<T> {
  private readonly config: ClientCacheConfig;
  private memoryCache = new Map<string, CacheEntry<T>>();
  private useIndexedDB: boolean;
  private dbReady: Promise<boolean>;

  constructor(config: ClientCacheConfig) {
    this.config = {
      ttlMs: config.ttlMs ?? 30 * 60 * 1000,
      maxSize: config.maxSize ?? 50,
      storageKey: config.storageKey ?? 'fp_cache',
      useIndexedDB: config.useIndexedDB ?? true,
    };

    this.useIndexedDB = this.config.useIndexedDB ?? true;
    this.dbReady = this.initStorage();
  }

  private async initStorage(): Promise<boolean> {
    if (this.useIndexedDB) {
      const database = await openIndexedDB();
      if (database) {
        await this.loadFromIndexedDB();
        return true;
      }
    }
    
    this.loadFromLocalStorage();
    return false;
  }

  private async loadFromIndexedDB(): Promise<void> {
    const database = await openIndexedDB();
    if (!database) {
      this.loadFromLocalStorage();
      return;
    }

    return new Promise((resolve) => {
      const transaction = database.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const now = Date.now();
        const entries = request.result as CacheEntry<T>[];
        
        entries.forEach((entry) => {
          if (entry.expiresAt > now) {
            this.memoryCache.set(entry.key, entry);
          }
        });

        this.pruneIfNeeded();
        resolve();
      };

      request.onerror = () => {
        this.loadFromLocalStorage();
        resolve();
      };
    });
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey!);
      if (!stored) return;

      const data = JSON.parse(stored) as Record<string, CacheEntry<T>>;
      const now = Date.now();

      Object.entries(data).forEach(([key, entry]) => {
        if (entry.expiresAt > now) {
          this.memoryCache.set(key, entry);
        }
      });

      this.pruneIfNeeded();
    } catch {
      this.memoryCache.clear();
    }
  }

  private async saveToStorage(): Promise<void> {
    if (this.useIndexedDB && db) {
      await this.saveToIndexedDB();
    } else {
      this.saveToLocalStorage();
    }
  }

  private async saveToIndexedDB(): Promise<void> {
    const database = await openIndexedDB();
    if (!database) {
      this.saveToLocalStorage();
      return;
    }

    return new Promise((resolve) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      store.clear();
      
      this.memoryCache.forEach((entry) => {
        store.put(entry);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  private saveToLocalStorage(): void {
    try {
      const data: Record<string, CacheEntry<T>> = {};
      this.memoryCache.forEach((value, key) => {
        data[key] = value;
      });
      localStorage.setItem(this.config.storageKey!, JSON.stringify(data));
    } catch {
      this.memoryCache.clear();
    }
  }

  private pruneIfNeeded(): void {
    if (this.memoryCache.size > (this.config.maxSize ?? 50)) {
      const entries = Array.from(this.memoryCache.entries());
      entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);

      const toRemove = entries.slice(0, Math.floor(entries.length * 0.3));
      toRemove.forEach(([key]) => this.memoryCache.delete(key));
    }
  }

  async set(key: string, value: T): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: now,
      expiresAt: now + this.config.ttlMs,
    };

    this.memoryCache.set(key, entry);
    this.pruneIfNeeded();
    await this.saveToStorage();
  }

  get(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      this.saveToStorage();
      return null;
    }

    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    await this.saveToStorage();
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    
    if (this.useIndexedDB && db) {
      const database = await openIndexedDB();
      if (database) {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
      }
    }
    
    localStorage.removeItem(this.config.storageKey!);
  }

  getStats(): { size: number; ttlMs: number; storageType: string } {
    return {
      size: this.memoryCache.size,
      ttlMs: this.config.ttlMs,
      storageType: this.useIndexedDB ? 'IndexedDB' : 'localStorage',
    };
  }

  async getAllEntries(): Promise<CacheEntry<T>[]> {
    return Array.from(this.memoryCache.values());
  }

  async getCacheSizeBytes(): Promise<number> {
    const entries = Array.from(this.memoryCache.values());
    const json = JSON.stringify(entries);
    return new Blob([json]).size;
  }
}

export function createSearchCache<T>(): ClientCache<T> {
  return new ClientCache<T>({
    ttlMs: 30 * 60 * 1000,
    maxSize: 100,
    storageKey: 'fp_search_cache',
    useIndexedDB: true,
  });
}

export function createSearchCacheNoIndexedDB<T>(): ClientCache<T> {
  return new ClientCache<T>({
    ttlMs: 30 * 60 * 1000,
    maxSize: 50,
    storageKey: 'fp_search_cache',
    useIndexedDB: false,
  });
}

export function hashQuery(query: string, filters?: Record<string, string>): string {
  const normalized = JSON.stringify({ q: query.trim().toLowerCase(), ...filters });
  return hashString(normalized);
}

export interface FallbackCacheConfig {
  maxEntries: number;
  ttlMs: number;
}

export class FallbackCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private readonly config: FallbackCacheConfig;

  constructor(config: FallbackCacheConfig) {
    this.config = config;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.config.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.config.ttlMs,
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  clear(): void {
    this.cache.clear();
  }
}

export function createFallbackCache<T>(): FallbackCache<T> {
  return new FallbackCache<T>({
    maxEntries: 10,
    ttlMs: 60 * 60 * 1000,
  });
}