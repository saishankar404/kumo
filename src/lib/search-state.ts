import type { SearchTypeFilter, SearchSort } from './search-engine';

export interface SearchState {
  q: string;
  type: SearchTypeFilter;
  sort: SearchSort;
  year: string;
  filter: string;
  source: string;
  page: number;
}

export interface SerializedSearchState {
  state: SearchState;
  timestamp: number;
  expiresAt: number;
}

const SEARCH_STATE_STORAGE_KEY = 'fp_search_state';
const SEARCH_STATE_TTL = 30 * 60 * 1000;

export function getDefaultSearchState(): SearchState {
  return {
    q: '',
    type: 'all',
    sort: 'relevance',
    year: '',
    filter: '',
    source: '',
    page: 1,
  };
}

export function serializeSearchState(state: SearchState): SerializedSearchState {
  const now = Date.now();
  return {
    state,
    timestamp: now,
    expiresAt: now + SEARCH_STATE_TTL,
  };
}

export function deserializeSearchState(serialized: SerializedSearchState): SearchState | null {
  if (Date.now() > serialized.expiresAt) {
    return null;
  }
  return serialized.state;
}

export function saveSearchState(state: SearchState): void {
  try {
    const serialized = serializeSearchState(state);
    localStorage.setItem(SEARCH_STATE_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    console.warn('Failed to save search state to localStorage');
  }
}

export function loadSearchState(): SearchState | null {
  try {
    const stored = localStorage.getItem(SEARCH_STATE_STORAGE_KEY);
    if (!stored) return null;

    const serialized = JSON.parse(stored) as SerializedSearchState;
    return deserializeSearchState(serialized);
  } catch {
    return null;
  }
}

export function clearSearchState(): void {
  localStorage.removeItem(SEARCH_STATE_STORAGE_KEY);
}

export function searchStateToUrlParams(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.q) params.set('q', state.q);
  if (state.type && state.type !== 'all') params.set('type', state.type);
  if (state.sort && state.sort !== 'relevance') params.set('sort', state.sort);
  if (state.year) params.set('year', state.year);
  if (state.filter) params.set('filter', state.filter);
  if (state.source) params.set('source', state.source);
  if (state.page > 1) params.set('page', String(state.page));

  return params;
}

export function urlParamsToSearchState(params: URLSearchParams): SearchState {
  return {
    q: params.get('q') || '',
    type: (params.get('type') as SearchTypeFilter) || 'all',
    sort: (params.get('sort') as SearchSort) || 'relevance',
    year: params.get('year') || '',
    filter: params.get('filter') || '',
    source: params.get('source') || '',
    page: parseInt(params.get('page') || '1', 10),
  };
}

export function mergeSearchState(
  current: SearchState,
  updates: Partial<SearchState>
): SearchState {
  return {
    ...current,
    ...updates,
  };
}

export function isSearchStateEqual(a: SearchState, b: SearchState): boolean {
  return (
    a.q === b.q &&
    a.type === b.type &&
    a.sort === b.sort &&
    a.year === b.year &&
    a.filter === b.filter &&
    a.source === b.source &&
    a.page === b.page
  );
}

export function getSearchStateKey(state: SearchState): string {
  const normalized = {
    q: state.q.trim().toLowerCase(),
    type: state.type,
    sort: state.sort,
    year: state.year,
    filter: state.filter,
    source: state.source,
  };
  return JSON.stringify(normalized);
}

export function updateUrlWithState(
  state: SearchState,
  history: History,
  basePath: string = '/search'
): void {
  const params = searchStateToUrlParams(state);
  const url = params.toString() ? `${basePath}?${params.toString()}` : basePath;
  history.replaceState(null, '', url);
}

export function getStateFromUrl(): SearchState {
  const params = new URLSearchParams(window.location.search);
  return urlParamsToSearchState(params);
}