const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.posthog.com';

let isInitialized = false;

export function initPostHog(): void {
  if (isInitialized || !POSTHOG_API_KEY) return;

  try {
    (window as unknown as { posthog?: { init: (key: string, config?: Record<string, unknown>) => void } }).posthog?.init?.(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      request_timeout: 3000,
      batch_size: 50,
      flush_interval: 5000,
    });
    isInitialized = true;
  } catch {
    // Silently fail if PostHog fails to init
  }
}

export function captureEvent(eventName: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_API_KEY) return;
  
  if (!isInitialized) {
    initPostHog();
  }
  
  try {
    const ph = (window as unknown as { posthog?: { capture: (event: string, props?: Record<string, unknown>) => void } }).posthog;
    ph?.capture?.(eventName, {
      ...properties,
      timestamp: Date.now(),
    });
  } catch {
    // Silently fail
  }
}

export function capturePageView(): void {
  if (!POSTHOG_API_KEY) return;
  
  if (!isInitialized) {
    initPostHog();
  }
  
  try {
    const ph = (window as unknown as { posthog?: { capture: (event: string) => void } }).posthog;
    ph?.capture?.('$pageview');
  } catch {
    // Silently fail
  }
}

export function captureHeroExploreClick(): void {
  captureEvent('hero_explore_click');
}

export function captureHeroSearchSubmit(query: string): void {
  captureEvent('hero_search_submit', { query });
}

export function captureSidebarNavigation(destination: string): void {
  captureEvent('sidebar_navigate', { destination });
}

export function capturePDFDownload(paperTitle: string, paperId: string): void {
  captureEvent('pdf_download', { paper_title: paperTitle, paper_id: paperId });
}

export function captureSearchResultClick(paperTitle: string, paperId: string, position: number): void {
  captureEvent('search_result_click', { 
    paper_title: paperTitle, 
    paper_id: paperId,
    position 
  });
}

export function captureCollectionAdd(paperTitle: string, collectionId: string): void {
  captureEvent('collection_add', { 
    paper_title: paperTitle, 
    collection_id: collectionId 
  });
}

export function captureFilterChange(filterType: string, filterValue: string): void {
  captureEvent('filter_change', { 
    filter_type: filterType, 
    filter_value: filterValue 
  });
}

export function captureLoadMore(): void {
  captureEvent('load_more_click');
}