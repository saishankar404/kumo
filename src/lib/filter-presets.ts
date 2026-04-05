import type { SearchTypeFilter, SearchSort } from './search-engine';

export interface FilterPreset {
  id: string;
  name: string;
  type: SearchTypeFilter;
  sort: SearchSort;
  year: string;
  filter: string;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface FilterPresetsConfig {
  maxPresets: number;
  storageKey: string;
}

const DEFAULT_CONFIG: FilterPresetsConfig = {
  maxPresets: 10,
  storageKey: 'fp_filter_presets',
};

export class FilterPresets {
  private readonly config: FilterPresetsConfig;
  private presets: FilterPreset[] = [];

  constructor(config: Partial<FilterPresetsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (!stored) {
        this.presets = [];
        return;
      }

      const parsed = JSON.parse(stored) as FilterPreset[];
      this.presets = parsed.slice(0, this.config.maxPresets);
    } catch {
      this.presets = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.presets));
    } catch {
      this.presets = [];
    }
  }

  create(name: string, filters: Omit<FilterPreset, 'id' | 'name' | 'createdAt' | 'updatedAt'>): FilterPreset {
    const newPreset: FilterPreset = {
      ...filters,
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.presets.unshift(newPreset);

    if (this.presets.length > this.config.maxPresets) {
      this.presets = this.presets.slice(0, this.config.maxPresets);
    }

    this.saveToStorage();
    return newPreset;
  }

  update(id: string, updates: Partial<Omit<FilterPreset, 'id' | 'createdAt'>>): FilterPreset | null {
    const index = this.presets.findIndex(p => p.id === id);
    if (index === -1) return null;

    this.presets[index] = {
      ...this.presets[index],
      ...updates,
      updatedAt: Date.now(),
    };

    this.saveToStorage();
    return this.presets[index];
  }

  delete(id: string): boolean {
    const initialLength = this.presets.length;
    this.presets = this.presets.filter(p => p.id !== id);
    
    if (this.presets.length !== initialLength) {
      this.saveToStorage();
      return true;
    }
    return false;
  }

  getAll(): FilterPreset[] {
    return [...this.presets];
  }

  getById(id: string): FilterPreset | null {
    return this.presets.find(p => p.id === id) || null;
  }

  hasPreset(name: string): boolean {
    return this.presets.some(p => p.name.toLowerCase() === name.toLowerCase());
  }

  clear(): void {
    this.presets = [];
    this.saveToStorage();
  }

  canAddMore(): boolean {
    return this.presets.length < this.config.maxPresets;
  }

  getCount(): number {
    return this.presets.length;
  }
}

let filterPresetsInstance: FilterPresets | null = null;

export function getFilterPresets(): FilterPresets {
  if (!filterPresetsInstance) {
    filterPresetsInstance = new FilterPresets();
  }
  return filterPresetsInstance;
}

export function createFilterPreset(
  name: string,
  type: SearchTypeFilter = 'all',
  sort: SearchSort = 'relevance',
  year: string = '',
  filter: string = '',
  source: string = ''
): FilterPreset {
  const presets = getFilterPresets();
  return presets.create(name, { type, sort, year, filter, source });
}

export function deleteFilterPreset(id: string): boolean {
  const presets = getFilterPresets();
  return presets.delete(id);
}

export function getAllFilterPresets(): FilterPreset[] {
  const presets = getFilterPresets();
  return presets.getAll();
}