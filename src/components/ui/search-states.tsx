import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { AlertCircle, FileQuestion, Loader2, RefreshCw, Search, X } from "lucide-react";

interface LoadingStateProps {
  count?: number;
  compact?: boolean;
}

export function SearchLoadingState({ count = 4, compact = false }: LoadingStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    setKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      const items = containerRef.current?.querySelectorAll('.skeleton-item');
      if (!items) return;

      gsap.fromTo(items,
        { opacity: 0, y: 12 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.4, 
          stagger: 0.08, 
          ease: "power2.out" 
        }
      );

      gsap.to(containerRef.current.querySelectorAll('.shimmer'), {
        x: '200%',
        duration: 1.5,
        repeat: -1,
        ease: "power1.inOut",
      });
    }, containerRef);

    return () => ctx.revert();
  }, [key]);

  if (compact) {
    return (
      <div ref={containerRef} className="flex items-center gap-2 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-[#0ea5e9]" />
        <span className="text-[13px] font-medium text-gray-500">Searching...</span>
      </div>
    );
  }

  return (
    <div key={key} ref={containerRef} className="w-full">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="skeleton-item w-full border-b border-gray-100 py-5"
        >
          <div className="custom-table-grid relative px-5">
            <div className="flex flex-col gap-3 pr-4">
              <div className="flex gap-2 mb-1">
                <div className="h-6 w-20 rounded-[8px] bg-gray-100 relative overflow-hidden">
                  <div className="shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                </div>
                <div className="h-6 w-16 rounded-[8px] bg-gray-50 relative overflow-hidden">
                  <div className="shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                </div>
              </div>
              <div className="h-5 w-3/4 rounded-md bg-[#f1f1f1] relative overflow-hidden">
                <div className="shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="h-3 w-full rounded-md bg-gray-50/80 relative overflow-hidden">
                  <div className="shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                </div>
                <div className="h-3 w-5/6 rounded-md bg-gray-50/80 relative overflow-hidden">
                  <div className="shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                </div>
              </div>
            </div>
            <div className="hidden flex-col gap-2 pt-1 lg:flex relative overflow-hidden">
              <div className="h-3 w-10 rounded-sm bg-gray-100/60" />
              <div className="h-3.5 w-24 rounded-md bg-gray-100/80" />
              <div className="h-3.5 w-16 rounded-md bg-gray-100/50" />
            </div>
            <div className="hidden flex-col gap-2 pt-1 lg:flex relative overflow-hidden">
              <div className="h-3 w-10 rounded-sm bg-gray-100/60" />
              <div className="h-3.5 w-full max-w-[120px] rounded-md bg-gray-100/80" />
            </div>
            <div className="hidden flex-col gap-2 pt-1 lg:flex relative overflow-hidden">
              <div className="h-3 w-10 rounded-sm bg-gray-100/60" />
              <div className="h-3.5 w-8 rounded-md bg-gray-100/50" />
            </div>
            <div className="hidden justify-end pt-1 lg:flex relative overflow-hidden">
              <div className="h-8 w-20 rounded-full bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ErrorFallbackProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function SearchErrorFallback({ 
  title = "Something went wrong", 
  message = "We couldn't complete your search. Please try again.",
  onRetry,
  isRetrying = false 
}: ErrorFallbackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(containerRef.current,
        { opacity: 0, scale: 0.95, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: "back.out(1.2)" }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleRetry = () => {
    if (buttonRef.current) {
      gsap.to(buttonRef.current, {
        scale: 0.95,
        duration: 0.1,
        onComplete: () => {
          gsap.to(buttonRef.current, {
            scale: 1,
            duration: 0.3,
            ease: "elastic.out(1, 0.5)",
            onComplete: () => onRetry?.()
          });
        }
      });
    } else {
      onRetry?.();
    }
  };

  return (
    <div 
      ref={containerRef}
      className="mx-2 mt-4 rounded-[16px] border border-[#fee2e2] bg-gradient-to-br from-[#fef2f2] to-[#fff5f5] px-6 py-8"
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#fee2e2]">
          <AlertCircle className="h-7 w-7 text-[#dc2626]" strokeWidth={2.5} />
        </div>
        
        <h3 className="mb-2 text-[17px] font-bold text-[#1f2937]">
          {title}
        </h3>
        
        <p className="mb-5 max-w-sm text-[14px] leading-relaxed text-[#6b7280]">
          {message}
        </p>

        {onRetry && (
          <button
            ref={buttonRef}
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="group relative flex items-center gap-2 rounded-full bg-[#1f2937] px-5 py-2.5 text-[14px] font-bold text-white transition-all hover:bg-[#374151] active:scale-95 disabled:opacity-70"
          >
            {isRetrying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 transition-transform group-hover:rotate-180 group-hover:duration-500" />
                Try Again
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title?: string;
  message?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
}

export function SearchEmptyState({
  title = "No papers found",
  message = "Try adjusting your search terms or filters to find what you're looking for.",
  suggestions = [],
  onSuggestionClick
}: EmptyStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(containerRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
      );

      gsap.to(iconRef.current, {
        y: -8,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: "power1.inOut",
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div 
      ref={containerRef}
      className="mx-2 mt-4 rounded-[16px] border border-[#e5e7eb] bg-[#fafafa] px-5 py-10"
    >
      <div className="flex flex-col items-center text-center">
        <div 
          ref={iconRef}
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f3f4f6] to-[#e5e7eb]"
        >
          <FileQuestion className="h-8 w-8 text-[#9ca3af]" strokeWidth={2} />
        </div>

        <h3 className="mb-2 text-[18px] font-bold text-[#1f2937]">
          {title}
        </h3>

        <p className="mb-5 max-w-sm text-[14px] leading-relaxed text-[#6b7280]">
          {message}
        </p>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onSuggestionClick?.(suggestion)}
                className="transform rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-[13px] font-medium text-[#4b5563] transition-all hover:border-[#0ea5e9] hover:bg-[#f0f9ff] hover:text-[#0369a1] active:scale-95"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SourceProgress {
  key: string;
  loading?: boolean;
  error?: string;
  count?: number;
}

interface SourceStatusIndicatorProps {
  sources: SourceProgress[];
  onSourceClick?: (source: string) => void;
}

export function SourceStatusIndicator({ 
  sources,
  onSourceClick 
}: SourceStatusIndicatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  const sourceLabels: Record<string, string> = {
    openalex: "OpenAlex",
    arxiv: "arXiv",
    "biorxiv-medrxiv": "BioRxiv",
    "pmc-europepmc": "Europe PMC",
    "semantic-scholar": "Semantic",
    core: "CORE",
    zenodo: "Zenodo",
  };

  useEffect(() => {
    if (!containerRef.current || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    const ctx = gsap.context(() => {
      const items = containerRef.current?.querySelectorAll('.source-item');
      if (!items) return;

      gsap.fromTo(items,
        { opacity: 0, scale: 0.8 },
        { 
          opacity: 1, 
          scale: 1, 
          duration: 0.3, 
          stagger: 0.05, 
          ease: "back.out(1.5)" 
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  if (sources.length === 0) return null;

  return (
    <div ref={containerRef} className="mb-3 flex flex-wrap gap-2 text-[11px] text-gray-500">
      {sources.map((source) => {
        const label = sourceLabels[source.key] || source.key;
        const isLoading = source.loading;
        const hasError = Boolean(source.error);
        const hasResults = source.count && source.count > 0;

        return (
          <span
            key={source.key}
            className={`source-item inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 ${
              isLoading 
                ? "border-[#fef3c7] bg-[#fefbf0]" 
                : hasError 
                  ? "border-[#fee2e2] bg-[#fef2f2]" 
                  : hasResults 
                    ? "border-[#dcfce7] bg-[#f0fdf4]" 
                    : "border-[#e5e7eb] bg-white"
            }`}
            title={
              isLoading 
                ? `Searching ${label}...` 
                : hasError 
                  ? `${label} unavailable` 
                  : `${label} ready`
            }
          >
            <span className={`h-2 w-2 rounded-full ${
              isLoading 
                ? "animate-pulse bg-amber-500" 
                : hasError 
                  ? "bg-red-500" 
                  : hasResults 
                    ? "bg-green-500" 
                    : "bg-gray-400"
            }`} />
            <span className={`font-medium ${
              isLoading 
                ? "text-amber-700" 
                : hasError 
                  ? "text-red-700" 
                  : hasResults 
                    ? "text-green-700" 
                    : "text-gray-600"
            }`}>
              {label}
            </span>
            {hasResults && (
              <span className="text-[10px] text-green-600">({source.count})</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

interface CacheIndicatorProps {
  isFromCache: boolean;
  onRefresh?: () => void;
}

export function CacheIndicator({ isFromCache, onRefresh }: CacheIndicatorProps) {
  const badgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!badgeRef.current || !isFromCache) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(badgeRef.current,
        { opacity: 0, scale: 0.8, y: -10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "back.out(1.5)" }
      );
    }, badgeRef);

    return () => ctx.revert();
  }, [isFromCache]);

  if (!isFromCache) return null;

  return (
    <span
      ref={badgeRef}
      className="inline-flex items-center gap-1 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2 py-0.5 text-[10px] font-bold text-[#1d4ed8]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6]" />
      Cached
      {onRefresh && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          className="ml-0.5 hover:text-[#1e40af]"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

interface InitialStateProps {
  onSearch?: (query: string) => void;
}

export function SearchInitialState({ onSearch }: InitialStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  const popularSearches = [
    "machine learning",
    "climate change",
    "quantum computing",
    "CRISPR",
  ];

  useEffect(() => {
    if (!containerRef.current || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    const ctx = gsap.context(() => {
      gsap.fromTo(containerRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.5, ease: "power2.out" }
      );

      const items = containerRef.current?.querySelectorAll('.popular-item');
      if (items) {
        gsap.fromTo(items,
          { opacity: 0, y: 10 },
          { 
            opacity: 1, 
            y: 0, 
            duration: 0.4, 
            stagger: 0.1, 
            delay: 0.2,
            ease: "power2.out" 
          }
        );
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div 
      ref={containerRef}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f0f9ff] to-[#e0f2fe]">
        <Search className="h-10 w-10 text-[#0ea5e9]" strokeWidth={1.5} />
      </div>

      <h2 className="mb-2 text-[22px] font-bold text-gray-900">
        Find academic papers
      </h2>
      
      <p className="mb-6 max-w-sm text-[14px] text-gray-500">
        Search across OpenAlex, arXiv, Semantic Scholar, and more to discover research that matters.
      </p>

      <div className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-gray-400">
        Popular searches
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {popularSearches.map((search, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onSearch?.(search)}
            className="popular-item transform rounded-full border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700 transition-all hover:border-[#0ea5e9] hover:bg-[#f0f9ff] hover:text-[#0369a1] active:scale-95"
          >
            {search}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ResultsTransitionProps {
  results: unknown[];
  loading: boolean;
  children: React.ReactNode;
}

export function ResultsTransition({ results, loading, children }: ResultsTransitionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(results.length);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    if (loading) {
      prevLengthRef.current = 0;
      hasLoadedRef.current = false;
      return;
    }

    if (results.length > 0 && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      
      const ctx = gsap.context(() => {
        const items = containerRef.current?.querySelectorAll('.feed-item');
        if (!items || items.length === 0) return;

        gsap.fromTo(items,
          { opacity: 0, y: 16 },
          { 
            opacity: 1, 
            y: 0, 
            duration: 0.4, 
            stagger: 0.06, 
            ease: "power2.out" 
          }
        );
      }, containerRef);

      return () => ctx.revert();
    }

    if (results.length > prevLengthRef.current && hasLoadedRef.current) {
      const ctx = gsap.context(() => {
        const items = containerRef.current?.querySelectorAll('.feed-item');
        if (!items) return;

        const newItems = Array.from(items).slice(-Math.min(results.length - prevLengthRef.current + 1, 5));
        
        if (newItems.length > 0) {
          gsap.fromTo(newItems,
            { opacity: 0, y: 16 },
            { 
              opacity: 1, 
              y: 0, 
              duration: 0.3, 
              stagger: 0.05, 
              ease: "power2.out" 
            }
          );
        }
      }, containerRef);

      prevLengthRef.current = results.length;
      return () => ctx.revert();
    }

    prevLengthRef.current = results.length;
  }, [results.length, loading]);

  return (
    <div ref={containerRef} className="results-container">
      {children}
    </div>
  );
}

export default {
  SearchLoadingState,
  SearchErrorFallback,
  SearchEmptyState,
  SourceStatusIndicator,
  CacheIndicator,
  SearchInitialState,
  ResultsTransition,
};