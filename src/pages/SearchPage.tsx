import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronDown, FileOutput, FolderPlus, Plus, Search, Trash2, X } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  SearchLoadingState,
  SearchErrorFallback,
  SearchEmptyState,
  SourceStatusIndicator,
  CacheIndicator,
  SearchInitialState,
  ResultsTransition,
} from "@/components/ui/search-states";
import MobileNav from "@/components/MobileNav";
import { findHighlightMatches } from "@/lib/highlight";
import { getRecentSearches, addToSearchHistory, clearSearchHistory, type SearchHistoryEntry } from "@/lib/search-history";
import { getAllFilterPresets, createFilterPreset, deleteFilterPreset, type FilterPreset } from "@/lib/filter-presets";
import { capturePDFDownload, captureSearchResultClick, captureLoadMore, captureFilterChange } from "@/lib/posthog-client";
import {
  buildCitations,
  commitSearchState,
  fetchAutocompleteSuggestions,
  fetchRelatedOpenAlexPapers,
  getActiveFilterPills,
  isOpenAccessOnly,
  parseCustomYearRange,
  parseSearchState,
  preprocessQuery,
  runSearch,
  type NormalizedPaperResult,
  SOURCE_MANUAL_URLS,
  SOURCE_OPTIONS,
  sourceDisplay,
  type ActiveFilterPill,
  type QueryMode,
  type SearchProgress,
  type SearchSort,
  type SearchSuggestion,
  type SearchTypeFilter,
  type SourceKey,
} from "@/lib/search-engine";

gsap.registerPlugin(ScrollTrigger);

// Helper functions for "Collect First, Flip Once" result handling
const normalizeDoi = (doi?: string) => {
  if (!doi) return "";
  return doi.toLowerCase().replace(/^https?:\/\/doi\.org\//, "");
};

const mergeResultsByDoi = (results: NormalizedPaperResult[]): NormalizedPaperResult[] => {
  const merged: NormalizedPaperResult[] = [];
  const doiIndex = new Map<string, number>();
  
  for (const row of results) {
    const doiKey = normalizeDoi(row.doi);
    if (doiKey && doiIndex.has(doiKey)) {
      const idx = doiIndex.get(doiKey)!;
      const existing = merged[idx];
      // Merge sources, prefer best data from any source
      merged[idx] = {
        ...existing,
        foundIn: [...new Set([...existing.foundIn, ...row.foundIn])],
        citations: existing.citations ?? row.citations,
        relevanceScore: Math.max(existing.relevanceScore || 0, row.relevanceScore || 0),
      };
    } else {
      const idx = merged.length;
      doiIndex.set(doiKey, idx);
      merged.push({ ...row });
    }
  }
  
  return merged;
};

const SOURCE_QUALITY_WEIGHTS: Record<string, number> = {
  "semantic-scholar": 4,
  "openalex": 3,
  "arxiv": 2,
  "biorxiv-medrxiv": 1,
};

const rankByQualityRecencyCitations = (results: NormalizedPaperResult[]): NormalizedPaperResult[] => {
  const currentYear = new Date().getFullYear();
  const recentThreshold = currentYear - 3;
  
  return [...results].sort((a, b) => {
    // Quality score (source preference)
    const sourceScoreA = Math.max(...a.foundIn.map(s => SOURCE_QUALITY_WEIGHTS[s] || 1));
    const sourceScoreB = Math.max(...b.foundIn.map(s => SOURCE_QUALITY_WEIGHTS[s] || 1));
    if (sourceScoreA !== sourceScoreB) return sourceScoreB - sourceScoreA;
    
    // Recency boost (last 3 years)
    const recentA = (a.year || 0) >= recentThreshold ? 1 : 0;
    const recentB = (b.year || 0) >= recentThreshold ? 1 : 0;
    if (recentA !== recentB) return recentB - recentA;
    
    // Citation count
    const citationsA = a.citations || 0;
    const citationsB = b.citations || 0;
    if (citationsA !== citationsB) return citationsB - citationsA;
    
    // Fallback to relevance
    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
  });
};

const YEAR_OPTIONS = [
  { value: "", label: "All Time" },
  { value: `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`, label: "Last year" },
  { value: `${new Date().getFullYear() - 5}-${new Date().getFullYear()}`, label: "Last 5 years" },
  { value: `${new Date().getFullYear() - 10}-${new Date().getFullYear()}`, label: "Last 10 years" },
];

const TYPE_CHIPS: { value: SearchTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "papers", label: "Papers" },
  { value: "preprints", label: "Preprints" },
  { value: "reviews", label: "Reviews" },
  { value: "datasets", label: "Datasets" },
];

const SORT_OPTIONS: { key: SearchSort; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "recent", label: "Date (Newest)" },
  { key: "cited", label: "Most Cited" },
  { key: "oa", label: "Open Access First" },
];

const SHORTCUT_HINT_KEY = "kumo.shortcuts.hint.dismissed";
const LIBRARY_STORAGE_KEY = "kumo.library.v1";
const METRICS_STORAGE_KEY = "kumo.metrics.session.v1";
const MAX_CUSTOM_COLLECTIONS = 3;
const MAX_SAVED_PAPERS = 5;
const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const INITIAL_ABSTRACT_HEIGHT = 24;

interface LibraryCollection {
  id: string;
  name: string;
  createdAt: string;
}

interface SavedLibraryItem {
  id: string;
  title: string;
  year?: number;
  doi?: string;
  venue?: string;
  pdfUrl?: string;
  landingUrl?: string;
  authors: string[];
  savedAt: string;
  collectionIds: string[];
}

interface SessionMetrics {
  searches: number;
  searchesWithPdf: number;
  firstResultMsSamples: number[];
  clicksToOpenSamples: number[];
  deadPdfLinks: number;
}

const DEFAULT_COLLECTION: LibraryCollection = {
  id: "saved",
  name: "Saved",
  createdAt: new Date(0).toISOString(),
};

const SOURCE_THEME: Record<SourceKey, string> = {
  openalex: "bg-[#e0f2fe] text-[#0284c7]",
  arxiv: "bg-[#ffedd5] text-[#c2410c]",
  "pmc-europepmc": "bg-[#dcfce7] text-[#15803d]",
  "semantic-scholar": "bg-[#f5f3ff] text-[#5b4ca5]",
  "biorxiv-medrxiv": "bg-[#fef3c7] text-[#92400e]",
  core: "bg-[#fee2e2] text-[#991b1b]",
  zenodo: "bg-[#e0e7ff] text-[#3730a3]",
};

const KEYWORDS = [
  "transformer",
  "attention mechanism",
  "neural network",
  "residual",
  "optimization",
  "language model",
  "object detection",
  "reinforcement learning",
  "diffusion",
];

const MOTION = {
  dropdown: {
    openDuration: 0.25,
    closeDuration: 0.15,
    openEase: "back.out(1.5)",
    closeEase: "power2.in",
    closedScale: 0.95,
    openScale: 1,
  },
  quickPill: {
    downScale: 0.94,
    downDuration: 0.15,
    upDuration: 0.4,
    xOpenWidth: "14px",
    xOpenDuration: 0.3,
    xCloseDuration: 0.2,
    easeOut: "power2.out",
    easeIn: "power2.in",
    bounceEase: "back.out(2)",
  },
  hoverRow: {
    dimDuration: 0.25,
    borderOutDuration: 0.2,
    borderInDuration: 0.3,
    showDuration: 0.3,
    hideDuration: 0.3,
    abstractOpenDuration: 0.35,
    tagsOpenDelay: 0.05,
    tagsOpenDuration: 0.3,
    tagsCloseDuration: 0.2,
    actionOpenDelay: 0.05,
    actionOpenDuration: 0.3,
    actionCloseDuration: 0.2,
    actionPlaceholderDelay: 0.1,
    actionPlaceholderDuration: 0.3,
    bookmarkOpenDelay: 0.1,
    bookmarkOpenDuration: 0.3,
    bookmarkCloseDuration: 0.2,
    easeOut: "power2.out",
    easeInOut: "power2.inOut",
    easeIn: "power2.in",
    bounceEase: "back.out(2)",
  },
};

const toneForCitations = (citations?: number) => {
  if (!citations || citations <= 0) return "text-gray-400";
  return "cited";
};

const HighlightedAbstract = ({ text, query }: { text: string; query: string }) => {
  if (!text) return <TextSpan>No abstract available.</TextSpan>;
  if (!query.trim()) return <TextSpan>{text}</TextSpan>;
  
  const matches = findHighlightMatches(text, query);
  if (matches.length === 0) return <TextSpan>{text}</TextSpan>;

  const nodes = [];
  let lastEnd = 0;
  matches.forEach((match, i) => {
    if (match.start > lastEnd) {
      nodes.push(<span key={`t-${i}`}>{text.substring(lastEnd, match.start)}</span>);
    }
    nodes.push(<mark key={`m-${i}`} className="highlight-match">{match.text}</mark>);
    lastEnd = match.end;
  });

  if (lastEnd < text.length) {
    nodes.push(<span key="end">{text.substring(lastEnd)}</span>);
  }

  return <>{nodes}</>;
};

// Helper inside the file
const TextSpan = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const toDoiUrl = (doi?: string) => (doi ? `https://doi.org/${doi}` : undefined);
const SearchPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseSearchState(searchParams), [searchParams]);
  const searchRunKey = `${state.q}|${state.type}|${state.sort}|${state.year}|${state.filter}|${state.source}`;
  const lastSearchRunKeyRef = useRef("");

  const [inputValue, setInputValue] = useState(state.q);
  const [results, setResults] = useState<NormalizedPaperResult[]>([]);
  const resultsRef = useRef(results);
  const resultsBufferRef = useRef<NormalizedPaperResult[]>([]);
  const [resultsBuffer, setResultsBuffer] = useState<NormalizedPaperResult[]>([]);
  const [collectionComplete, setCollectionComplete] = useState(false);
  const [progress, setProgress] = useState<SearchProgress[]>([]);
  const [searchMode, setSearchMode] = useState<QueryMode>("keyword");
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [fullFailure, setFullFailure] = useState(false);
  const [partialFailure, setPartialFailure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstResultMs, setFirstResultMs] = useState<number | undefined>();

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [suggestionNavActive, setSuggestionNavActive] = useState(false);
  const [suggestionPanelStyle, setSuggestionPanelStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [openActionMenuFor, setOpenActionMenuFor] = useState<string | null>(null);
  const [expandedAbstract, setExpandedAbstract] = useState<Set<string>>(new Set());
  const [openVersionsFor, setOpenVersionsFor] = useState<string | null>(null);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showShortcutHint, setShowShortcutHint] = useState(false);
  const [relatedById, setRelatedById] = useState<Record<string, NormalizedPaperResult[]>>({});
  const [relatedLoadingId, setRelatedLoadingId] = useState<string | null>(null);
  const [openRelatedFor, setOpenRelatedFor] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedPapersMap, setSavedPapersMap] = useState<Map<string, { title: string; year: string }>>(new Map());
  const [savedLibrary, setSavedLibrary] = useState<Record<string, SavedLibraryItem>>({});
  const [collections, setCollections] = useState<LibraryCollection[]>([DEFAULT_COLLECTION]);
  const [activeCollectionId, setActiveCollectionId] = useState<string>("all");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [tipsOpen, setTipsOpen] = useState(false);
  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics>({
    searches: 0,
    searchesWithPdf: 0,
    firstResultMsSamples: [],
    clicksToOpenSamples: [],
    deadPdfLinks: 0,
  });

  const [articlesPillActive, setArticlesPillActive] = useState(state.type === "papers");
  const [conferencesPillActive, setConferencesPillActive] = useState(state.type === "papers");
  const [preprintsPillActive, setPreprintsPillActive] = useState(state.type === "preprints");

  // Mobile filters panel
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Concept suggestion bar: concept from autocomplete that matched strongly
  const [suggestedConcept, setSuggestedConcept] = useState<string | null>(null);

  // Custom year inputs (FR-01)
  const [customYearFrom, setCustomYearFrom] = useState("");
  const [customYearTo, setCustomYearTo] = useState("");

  // Dedicated cite popover (CE-01) — separate from action menu
  const [openCitePopoverFor, setOpenCitePopoverFor] = useState<string | null>(null);
  const citePopoverRef = useRef<HTMLDivElement | null>(null);
  const tipsDialogRef = useRef<HTMLDivElement | null>(null);

  // Search history and presets
  const [recentSearches, setRecentSearches] = useState<SearchHistoryEntry[]>([]);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const sourceDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const sourceDropdownMenuRef = useRef<HTMLDivElement>(null);
  const sortDropdownMenuRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement | null>(null);
  const searchCountedForRunRef = useRef("");
  const firstResultCountedForRunRef = useRef("");
  const pdfRateCountedForRunRef = useRef("");
  const clicksSinceSearchRef = useRef(0);
  const searchStartedAtRef = useRef(0);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const isPrefetchingRef = useRef(false);
  const quickPillRefs = useRef<Record<"articles" | "conferences" | "preprints", HTMLButtonElement | null>>({
    articles: null,
    conferences: null,
    preprints: null,
  });
  const quickPillXRefs = useRef<Record<"articles" | "conferences" | "preprints", HTMLSpanElement | null>>({
    articles: null,
    conferences: null,
    preprints: null,
  });

const visibleRows = results.slice(0, Math.max(20, state.page * 20));
const noResults = !loading && results.length === 0 && state.q.trim().length > 0;
const initialState = !loading && results.length === 0 && state.q.trim().length === 0;
const openAccessOnly = isOpenAccessOnly(state);
  const activeFilterPills: ActiveFilterPill[] = useMemo(() => getActiveFilterPills(state), [state]);
  const selectedSourceLabel = (() => {
    if (!state.source) return "All Sources";
    const parts = state.source
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (parts.length === 1 && SOURCE_OPTIONS.some((option) => option.key === parts[0])) {
      return sourceDisplay(parts[0] as SourceKey);
    }
    return `${parts.length} Sources`;
  })();
  const selectedSources = state.source.split(",").map((v) => v.trim()).filter(Boolean) as SourceKey[];
  const selectedPaper = visibleRows[selectedResultIndex];
  const savedRows = useMemo(() => Object.values(savedLibrary), [savedLibrary]);
  const visibleSavedRows = useMemo(() => {
    if (activeCollectionId === "all") return savedRows;
    return savedRows.filter((entry) => entry.collectionIds.includes(activeCollectionId));
  }, [activeCollectionId, savedRows]);
  const customCollections = useMemo(
    () => collections.filter((collection) => collection.id !== DEFAULT_COLLECTION.id).slice(0, MAX_CUSTOM_COLLECTIONS),
    [collections]
  );
  const canAddCollection = customCollections.length < MAX_CUSTOM_COLLECTIONS;
  const hoverBindKey = useMemo(() => visibleRows.map((paper) => paper.id).join("|"), [visibleRows]);
  const currentSortLabel = SORT_OPTIONS.find((item) => item.key === state.sort)?.label || "Relevance";
  const selectedYearLabel = YEAR_OPTIONS.find((item) => item.value === state.year)?.label || "All Time";

  useEffect(() => {
    setInputValue(state.q);
  }, [state.q]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    setRecentSearches(getRecentSearches(10));
    setFilterPresets(getAllFilterPresets());
  }, []);

  useEffect(() => {
    const activePapers = state.type === "papers";
    setArticlesPillActive(activePapers);
    setConferencesPillActive(activePapers);
    setPreprintsPillActive(state.type === "preprints");
  }, [state.type]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        collections?: LibraryCollection[];
        savedLibrary?: Record<string, SavedLibraryItem>;
      };

      const nextCollections = parsed.collections?.length
        ? Array.from(new Map([DEFAULT_COLLECTION, ...parsed.collections].map((item) => [item.id, item])).values())
        : [DEFAULT_COLLECTION];
      const nextLibrary = parsed.savedLibrary || {};

      setCollections(nextCollections);
      setSavedLibrary(nextLibrary);
      setSavedIds(new Set(Object.keys(nextLibrary)));
      setSavedPapersMap(
        new Map(
          Object.values(nextLibrary).map((entry) => [
            entry.id,
            { title: entry.title, year: entry.year ? String(entry.year) : "Unknown" },
          ])
        )
      );
    } catch {
      // Ignore malformed local cache.
    }

    try {
      const rawMetrics = window.sessionStorage.getItem(METRICS_STORAGE_KEY);
      if (!rawMetrics) return;
      const parsed = JSON.parse(rawMetrics) as SessionMetrics;
      if (!parsed) return;
      setSessionMetrics({
        searches: parsed.searches || 0,
        searchesWithPdf: parsed.searchesWithPdf || 0,
        firstResultMsSamples: parsed.firstResultMsSamples || [],
        clicksToOpenSamples: parsed.clicksToOpenSamples || [],
        deadPdfLinks: parsed.deadPdfLinks || 0,
      });
    } catch {
      // Ignore malformed session cache.
    }
  }, []);

  useEffect(() => {
    const payload = JSON.stringify({ collections, savedLibrary });
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, payload);
  }, [collections, savedLibrary]);

  const collectionCompleteRef = useRef(false);

  useEffect(() => {
    window.sessionStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(sessionMetrics));
  }, [sessionMetrics]);

  useEffect(() => {
    if (state.page > 1 && lastSearchRunKeyRef.current === searchRunKey) return;
    lastSearchRunKeyRef.current = searchRunKey;
    
    collectionCompleteRef.current = false;
    const controller = new AbortController();
    const fetchState = { ...state, page: 1 };
    searchStartedAtRef.current = performance.now();

    if (fetchState.q.trim() && searchCountedForRunRef.current !== searchRunKey) {
      searchCountedForRunRef.current = searchRunKey;
      firstResultCountedForRunRef.current = "";
      pdfRateCountedForRunRef.current = "";
      clicksSinceSearchRef.current = 0;
      setSessionMetrics((prev) => ({ ...prev, searches: prev.searches + 1 }));
    }

    // Reset buffer at start of each search
    resultsBufferRef.current = [];
    setResultsBuffer([]);
    setCollectionComplete(false);
    
    setLoading(Boolean(fetchState.q.trim()));
    loadingRef.current = true;
    setResults([]);
    
    // Timeout fallback - flip after 2.5 seconds even if some sources hang
    const timeoutId = setTimeout(() => {
      if (!collectionCompleteRef.current) {
        const merged = mergeResultsByDoi(resultsBufferRef.current);
        const ranked = rankByQualityRecencyCitations(merged);
        setResults(ranked);
        collectionCompleteRef.current = true;
        setCollectionComplete(true);
        loadingRef.current = false;
        setLoading(false);
      }
    }, 2500);
    
    runSearch({
      state: fetchState,
      signal: controller.signal,
      onUpdate(bundle) {
        clearTimeout(timeoutId);
        setSearchMode(bundle.mode);
        setProgress(bundle.progress);
        setPartialFailure(bundle.partialFailure);
        setError(null);
        const stillLoading = bundle.progress.some((entry) => entry.loading);
        const allComplete = !stillLoading;
        
        // Buffer using ref for synchronous access
        const existingIds = new Set(resultsBufferRef.current.map(r => r.id));
        const newUnique = bundle.results.filter(r => !existingIds.has(r.id));
        resultsBufferRef.current = [...resultsBufferRef.current, ...newUnique];
        setResultsBuffer(resultsBufferRef.current);
        
        // First response: show immediately (FAST feedback)
        if (resultsRef.current.length === 0 && bundle.results.length > 0) {
          setResults(bundle.results);
          setFirstResultMs((prev) => (prev === undefined ? bundle.firstResultMs : Math.min(prev, bundle.firstResultMs ?? prev)));
        }
        
        // When ALL sources complete: single flip with merged+ranked results
        if (allComplete && !collectionCompleteRef.current) {
          collectionCompleteRef.current = true;
          setCollectionComplete(true);
          const merged = mergeResultsByDoi(resultsBufferRef.current);
          const ranked = rankByQualityRecencyCitations(merged);
          setResults(ranked);
          loadingRef.current = false;
          setLoading(false);
        }
        
        // Track metrics
        if (bundle.results.length > 0 && firstResultCountedForRunRef.current !== searchRunKey) {
          const firstResultMs = Math.max(0, Math.round(performance.now() - searchStartedAtRef.current));
          firstResultCountedForRunRef.current = searchRunKey;
          setSessionMetrics((prev) => ({
            ...prev,
            firstResultMsSamples: [...prev.firstResultMsSamples, firstResultMs].slice(-100),
          }));
        }

        if (!stillLoading && pdfRateCountedForRunRef.current !== searchRunKey) {
          pdfRateCountedForRunRef.current = searchRunKey;
          const hasPdf = bundle.results.some((row) => row.pdfAvailable && row.oaStatus !== "closed");
          setSessionMetrics((prev) => ({
            ...prev,
            searchesWithPdf: prev.searchesWithPdf + (hasPdf ? 1 : 0),
          }));
        }
      },
    }).catch((err) => {
      clearTimeout(timeoutId);
      loadingRef.current = false;
      setLoading(false);
      setFullFailure(true);
      setError(err instanceof Error ? err.message : "Search failed");
    });

    return () => controller.abort();
  }, [searchRunKey, state, state.page]);

  useEffect(() => {
    const clean = preprocessQuery(inputValue);
    if (clean.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveSuggestionIndex(-1);
      setSuggestedConcept(null);
      return;
    }

    const timer = setTimeout(() => {
      fetchAutocompleteSuggestions(clean)
        .then((list) => {
          setSuggestions(list);
          setShowSuggestions(Boolean(list.length));
          setActiveSuggestionIndex(-1);
          // Surface a concept suggestion if autocomplete found a concept match
          const conceptMatch = list.find((s) => s.kind === "concept");
          setSuggestedConcept(conceptMatch ? conceptMatch.label : null);
        })
        .catch(() => {
          setSuggestions([]);
          setShowSuggestions(false);
          setActiveSuggestionIndex(-1);
          setSuggestedConcept(null);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [inputValue]);

  useEffect(() => {
    if (!toastMessage || !toastRef.current) return;

    gsap.killTweensOf(toastRef.current);
    gsap.fromTo(
      toastRef.current,
      { y: 40, opacity: 0, scale: 0.9 },
      { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.5)" },
    );

    const timer = window.setTimeout(() => {
      if (!toastRef.current) {
        setToastMessage("");
        return;
      }
      gsap.to(toastRef.current, {
        y: 20,
        opacity: 0,
        scale: 0.9,
        duration: 0.25,
        ease: "power3.in",
        onComplete: () => setToastMessage(""),
      });
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(SHORTCUT_HINT_KEY);
    if (!dismissed && window.innerWidth >= 1024) setShowShortcutHint(true);
  }, []);

  useEffect(() => {
    setSelectedResultIndex((prev) => {
      if (visibleRows.length === 0) return 0;
      return Math.min(prev, visibleRows.length - 1);
    });
  }, [visibleRows.length]);

  useEffect(() => {
    if (selectedResultIndex < 0 || selectedResultIndex >= visibleRows.length) return;
    const selected = visibleRows[selectedResultIndex];
    const row = document.querySelector(`[data-paper-id="${CSS.escape(selected.id)}"]`) as HTMLElement | null;
    if (!row) return;
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedResultIndex, visibleRows]);

  useEffect(() => {
    if (!showSuggestions || suggestions.length === 0) {
      setSuggestionPanelStyle(null);
      return;
    }

    const updatePosition = () => {
      const form = formRef.current;
      if (!form) return;
      const rect = form.getBoundingClientRect();
      const estimatedHeight = 320;
      const availableBelow = window.innerHeight - rect.bottom - 12;
      const openUp = availableBelow < 220 && rect.top > 240;

      const maxHeight = openUp
        ? Math.max(160, Math.min(estimatedHeight, rect.top - 16))
        : Math.max(160, Math.min(estimatedHeight, availableBelow));

      const top = openUp ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 6;
      setSuggestionPanelStyle({
        top,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showSuggestions, suggestions.length]);

  useEffect(() => {
    if (!showSuggestions) return;

    const closeSuggestionsOnScrollIntent = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (formRef.current?.contains(target) || suggestionsRef.current?.contains(target))) return;
      setShowSuggestions(false);
      setActiveSuggestionIndex(-1);
      setSuggestionNavActive(false);
      inputRef.current?.blur();
    };

    window.addEventListener("wheel", closeSuggestionsOnScrollIntent, { passive: true, capture: true });
    window.addEventListener("touchmove", closeSuggestionsOnScrollIntent, { passive: true, capture: true });

    return () => {
      window.removeEventListener("wheel", closeSuggestionsOnScrollIntent, true);
      window.removeEventListener("touchmove", closeSuggestionsOnScrollIntent, true);
    };
  }, [showSuggestions]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;

      if (!suggestionsRef.current?.contains(target) && target !== inputRef.current) {
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
        setSuggestionNavActive(false);
      }

      if (!sourceDropdownRef.current?.contains(target)) setSourceDropdownOpen(false);
      if (!sortDropdownRef.current?.contains(target)) setSortDropdownOpen(false);
      if (!(target instanceof HTMLElement && target.closest(".action-menu-wrap"))) setOpenActionMenuFor(null);
      if (!(target instanceof HTMLElement && target.closest(".versions-wrap"))) setOpenVersionsFor(null);
      if (!(target instanceof HTMLElement && target.closest(".cite-popover-wrap"))) setOpenCitePopoverFor(null);
      if (!(target instanceof HTMLElement && target.closest(".tips-dialog-wrap"))) setTipsOpen(false);
    };

    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!openCitePopoverFor) return;
    const panel = citePopoverRef.current;
    if (!panel) return;

    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
    );
    focusables[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, [openCitePopoverFor]);

  useEffect(() => {
    const onPointerDown = (event: Event) => {
      if (!showSuggestions) return;
      const target = event.target as Node | null;
      if (!target) return;

      const insideInput = Boolean(formRef.current?.contains(target));
      const insideSuggestions = Boolean(suggestionsRef.current?.contains(target));
      if (insideInput || insideSuggestions) return;

      closeSuggestions();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [showSuggestions]);

  useEffect(() => {
    if (!openActionMenuFor) return;
    const panel = document.querySelector<HTMLElement>(`[data-action-menu="${CSS.escape(openActionMenuFor)}"]`);
    if (!panel) return;

    const items = Array.from(panel.querySelectorAll<HTMLElement>(".action-menu-item"));
    gsap.killTweensOf([panel, ...items]);
    gsap.fromTo(
      panel,
      { autoAlpha: 0, y: -8, scale: 0.94, transformOrigin: "100% 0%" },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: "back.out(1.8)", overwrite: "auto" },
    );
    if (items.length > 0) {
      gsap.fromTo(
        items,
        { x: 8, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.22, delay: 0.04, stagger: 0.03, ease: "power2.out", overwrite: "auto" },
      );
    }
  }, [openActionMenuFor]);

  useEffect(() => {
    if (!tipsOpen || !tipsDialogRef.current) return;
    gsap.killTweensOf(tipsDialogRef.current);
    gsap.fromTo(
      tipsDialogRef.current,
      { autoAlpha: 0, y: 6, scale: 0.96, transformOrigin: "100% 0%" },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.24, ease: "back.out(1.5)", overwrite: "auto" },
    );
  }, [tipsOpen]);

  // Disabled: ResultsTransition handles entrance animations - ScrollTrigger was causing whitespace issues on desktop
  // useEffect(() => {
  //   const mm = gsap.matchMedia();
  //   mm.add("(prefers-reduced-motion: no-preference) and (min-width: 1024px)", () => {
  //     const items = gsap.utils.toArray<HTMLElement>(".fp-feed-item");
  //     const animations = items.map((item) =>
  //       gsap.from(item, {
  //         y: 20,
  //         opacity: 0,
  //         duration: 0.42,
  //         ease: "power2.out",
  //         scrollTrigger: {
  //           trigger: item,
  //           start: "top 95%",
  //           toggleActions: "play none none none",
  //         },
  //       }),
  //     );
  //     return () => {
  //       animations.forEach((anim) => anim.kill());
  //     };
  //   });
  //   return () => mm.revert();
  // }, [visibleRows.length, loading]);

  useEffect(() => {
    const sourceMenu = sourceDropdownMenuRef.current;
    if (sourceMenu) {
      if (sourceDropdownOpen) {
        gsap.fromTo(
          sourceMenu,
          { autoAlpha: 0, scale: MOTION.dropdown.closedScale },
          {
            autoAlpha: 1,
            scale: MOTION.dropdown.openScale,
            duration: MOTION.dropdown.openDuration,
            ease: MOTION.dropdown.openEase,
            overwrite: "auto",
          },
        );
      } else {
        gsap.to(sourceMenu, {
          autoAlpha: 0,
          scale: MOTION.dropdown.closedScale,
          duration: MOTION.dropdown.closeDuration,
          ease: MOTION.dropdown.closeEase,
          overwrite: "auto",
        });
      }
    }

    const sortMenu = sortDropdownMenuRef.current;
    if (sortMenu) {
      if (sortDropdownOpen) {
        gsap.fromTo(
          sortMenu,
          { autoAlpha: 0, scale: MOTION.dropdown.closedScale },
          {
            autoAlpha: 1,
            scale: MOTION.dropdown.openScale,
            duration: MOTION.dropdown.openDuration,
            ease: MOTION.dropdown.openEase,
            overwrite: "auto",
          },
        );
      } else {
        gsap.to(sortMenu, {
          autoAlpha: 0,
          scale: MOTION.dropdown.closedScale,
          duration: MOTION.dropdown.closeDuration,
          ease: MOTION.dropdown.closeEase,
          overwrite: "auto",
        });
      }
    }
  }, [sourceDropdownOpen, sortDropdownOpen]);

  useEffect(() => {
    const input = inputRef.current;
    const container = searchContainerRef.current;
    if (!input || !container) return;

    const onFocus = () => {
      gsap.to(container, { scale: 1.005, duration: 0.3, ease: "power2.out", overwrite: "auto" });
    };
    const onBlur = () => {
      gsap.to(container, { scale: 1, duration: 0.3, ease: "power2.out", overwrite: "auto" });
    };

    input.addEventListener("focus", onFocus);
    input.addEventListener("blur", onBlur);
    return () => {
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const quickStates = {
      articles: articlesPillActive,
      conferences: conferencesPillActive,
      preprints: preprintsPillActive,
    } as const;

    (Object.keys(quickStates) as Array<keyof typeof quickStates>).forEach((key) => {
      const pill = quickPillRefs.current[key];
      const xIcon = quickPillXRefs.current[key];
      if (!pill || !xIcon) return;

      if (quickStates[key]) {
        gsap.to(pill, { backgroundColor: "#f0f9ff", borderColor: "#0ea5e9", color: "#0369a1", duration: 0.2, overwrite: "auto" });
        gsap.to(xIcon, {
          width: MOTION.quickPill.xOpenWidth,
          opacity: 1,
          duration: MOTION.quickPill.xOpenDuration,
          ease: MOTION.quickPill.bounceEase,
          overwrite: "auto",
        });
      } else {
        gsap.to(pill, { backgroundColor: "#ffffff", borderColor: "#e5e7eb", color: "#4b5563", borderBottomWidth: "2px", duration: 0.2, overwrite: "auto" });
        gsap.to(xIcon, {
          width: "0px",
          opacity: 0,
          duration: MOTION.quickPill.xCloseDuration,
          ease: MOTION.quickPill.easeIn,
          overwrite: "auto",
        });
      }
    });
  }, [articlesPillActive, conferencesPillActive, preprintsPillActive]);

  useEffect(() => {
    let cleanups: Array<() => void> = [];
    let rafId = 0;

    const bindHoverHandlers = () => {
      const allCards = Array.from(document.querySelectorAll<HTMLElement>(".card"));
      const feedItems = Array.from(document.querySelectorAll<HTMLElement>(".feed-item[data-paper-id]"));
      cleanups = [];

      feedItems.forEach((item) => {
        const card = item.querySelector<HTMLElement>(".card");
        if (!card) return;

        const paperId = item.dataset.paperId || "";
        const bg = card.querySelector<HTMLElement>(".card-bg");
        const title = card.querySelector<HTMLElement>(".paper-title");
        const abstractWrap = card.querySelector<HTMLElement>(".abstract-wrap");
        const abstractText = card.querySelector<HTMLElement>(".abstract-text");
        const tagsWrap = card.querySelector<HTMLElement>(".tags-wrap");
        const actionsReveal = card.querySelector<HTMLElement>(".actions-reveal");
        const secondaryActions = card.querySelector<HTMLElement>(".card-secondary-actions");
        const bookmarkIcon = card.querySelector<HTMLElement>(".bookmark-icon");
        const pdfLink = card.querySelector<HTMLElement>(".pdf-link");
        const pdfGlyph = card.querySelector<HTMLElement>(".pdf-glyph");
        const pdfLabel = card.querySelector<HTMLElement>(".pdf-label");
        const pdfAura = card.querySelector<HTMLElement>(".pdf-aura");
        const pdfShine = card.querySelector<HTMLElement>(".pdf-shine");

        if (!bg || !title) return;
        let hoverExpandedAbstract = false;

        const onEnter = () => {
          gsap.killTweensOf([bg, card, title]);
          allCards.forEach((c) => {
            gsap.to(c, { opacity: c === card ? 1 : 0.4, duration: MOTION.hoverRow.dimDuration, overwrite: "auto" });
          });
          gsap.to(item, { borderColor: "transparent", duration: MOTION.hoverRow.borderOutDuration, overwrite: "auto" });
          gsap.to(bg, { opacity: 1, scale: 1, duration: MOTION.hoverRow.showDuration, ease: MOTION.hoverRow.easeOut, overwrite: "auto" });
          gsap.to(card, { y: -2, duration: MOTION.hoverRow.showDuration, ease: MOTION.hoverRow.easeOut, overwrite: "auto" });
          gsap.to(title, { x: 4, duration: MOTION.hoverRow.showDuration, ease: MOTION.hoverRow.easeOut, overwrite: "auto" });
          if (tagsWrap) gsap.to(tagsWrap, { y: -1, duration: 0.28, ease: MOTION.hoverRow.easeOut, overwrite: "auto" });
          if (actionsReveal) gsap.to(actionsReveal, { y: -1, duration: 0.26, ease: MOTION.hoverRow.easeOut, overwrite: "auto" });
          if (secondaryActions) gsap.to(secondaryActions, { y: -1, duration: 0.26, ease: MOTION.hoverRow.easeOut, overwrite: "auto" });

          if (abstractWrap && abstractText && !expandedAbstract.has(paperId) && abstractText.classList.contains("line-clamp-2")) {
            hoverExpandedAbstract = true;
            gsap.set(abstractWrap, { height: abstractWrap.offsetHeight });
            abstractText.classList.remove("line-clamp-2");
            const targetAbsHeight = abstractText.offsetHeight;
            gsap.to(abstractWrap, {
              height: targetAbsHeight,
              duration: MOTION.hoverRow.abstractOpenDuration,
              ease: MOTION.hoverRow.easeOut,
              overwrite: "auto",
            });
          }

          if (pdfLink && pdfAura) {
            gsap.fromTo(pdfLink, { scale: 0.94, y: 2 }, { scale: 1, y: 0, duration: 0.34, ease: "back.out(1.8)", overwrite: "auto" });
            gsap.to(pdfAura, { autoAlpha: 1, scale: 1, duration: 0.3, ease: "power2.out", overwrite: "auto" });
          }

        };

        const onLeave = () => {
          gsap.killTweensOf([bg, card, title]);
          allCards.forEach((c) => {
            gsap.to(c, { opacity: 1, duration: MOTION.hoverRow.hideDuration, overwrite: "auto" });
          });
          gsap.to(item, { borderColor: "rgba(243, 244, 246, 1)", duration: MOTION.hoverRow.borderInDuration, overwrite: "auto" });
          gsap.to(bg, {
            opacity: 0,
            scale: MOTION.dropdown.closedScale,
            duration: MOTION.hoverRow.hideDuration,
            ease: MOTION.hoverRow.easeInOut,
            overwrite: "auto",
          });
          gsap.to(card, { y: 0, duration: MOTION.hoverRow.hideDuration, ease: MOTION.hoverRow.easeInOut, overwrite: "auto" });
          gsap.to(title, { x: 0, duration: MOTION.hoverRow.hideDuration, ease: MOTION.hoverRow.easeInOut, overwrite: "auto" });
          if (tagsWrap) gsap.to(tagsWrap, { y: 0, duration: 0.24, ease: MOTION.hoverRow.easeInOut, overwrite: "auto" });
          if (actionsReveal) gsap.to(actionsReveal, { y: 0, duration: 0.22, ease: MOTION.hoverRow.easeInOut, overwrite: "auto" });
          if (secondaryActions) gsap.to(secondaryActions, { y: 0, duration: 0.22, ease: MOTION.hoverRow.easeInOut, overwrite: "auto" });

          if (abstractWrap && abstractText && hoverExpandedAbstract && !expandedAbstract.has(paperId)) {
            gsap.set(abstractWrap, { height: abstractWrap.offsetHeight });
            abstractText.classList.add("line-clamp-2");
            gsap.to(abstractWrap, {
              height: INITIAL_ABSTRACT_HEIGHT,
              duration: MOTION.hoverRow.hideDuration,
              ease: MOTION.hoverRow.easeInOut,
              overwrite: "auto",
              onComplete: () => gsap.set(abstractWrap, { clearProps: "height" }),
            });
            hoverExpandedAbstract = false;
          } else if (abstractWrap) {
            gsap.set(abstractWrap, { clearProps: "height" });
          }

          if (pdfAura) {
            gsap.to(pdfAura, { autoAlpha: 0, scale: 0.8, duration: 0.2, ease: "power2.in", overwrite: "auto" });
          }
        };

        const onDown = (event: MouseEvent) => {
          const target = event.target as HTMLElement;
          if (target.closest(".pdf-link") || target.closest(".bookmark-icon") || target.closest(".interactive-tag") || target.closest(".highlight-match")) return;
          gsap.to(card, { scale: 0.99, duration: MOTION.quickPill.downDuration, ease: MOTION.quickPill.easeOut, overwrite: "auto" });
        };

        const onUp = (event: MouseEvent) => {
          const target = event.target as HTMLElement;
          if (target.closest(".pdf-link") || target.closest(".bookmark-icon") || target.closest(".interactive-tag") || target.closest(".highlight-match")) return;
          gsap.to(card, { scale: 1, duration: MOTION.quickPill.upDuration, ease: MOTION.quickPill.bounceEase, overwrite: "auto" });
        };

        const onPdfEnter = () => {
          if (!pdfLink) return;
          gsap.to(pdfLink, { scale: 1.04, y: -1, duration: 0.22, ease: "power2.out", overwrite: "auto" });
          if (pdfGlyph) gsap.to(pdfGlyph, { rotate: -10, x: -1, duration: 0.22, ease: "power2.out", overwrite: "auto" });
          if (pdfLabel) gsap.to(pdfLabel, { x: 2, duration: 0.22, ease: "power2.out", overwrite: "auto" });
          if (pdfShine) {
            gsap.fromTo(pdfShine, { xPercent: -130, autoAlpha: 0 }, { xPercent: 130, autoAlpha: 0.8, duration: 0.55, ease: "power2.out", overwrite: "auto" });
          }
        };

        const onPdfLeave = () => {
          if (!pdfLink) return;
          gsap.to(pdfLink, { scale: 1, y: 0, duration: 0.22, ease: "power2.out", overwrite: "auto" });
          if (pdfGlyph) gsap.to(pdfGlyph, { rotate: 0, x: 0, duration: 0.22, ease: "power2.out", overwrite: "auto" });
          if (pdfLabel) gsap.to(pdfLabel, { x: 0, duration: 0.22, ease: "power2.out", overwrite: "auto" });
          if (pdfShine) gsap.to(pdfShine, { autoAlpha: 0, duration: 0.18, overwrite: "auto" });
        };

        card.addEventListener("mouseenter", onEnter);
        card.addEventListener("mouseleave", onLeave);
        card.addEventListener("mousedown", onDown);
        card.addEventListener("mouseup", onUp);
        if (pdfLink) {
          pdfLink.addEventListener("mouseenter", onPdfEnter);
          pdfLink.addEventListener("mouseleave", onPdfLeave);
        }

        cleanups.push(() => {
          card.removeEventListener("mouseenter", onEnter);
          card.removeEventListener("mouseleave", onLeave);
          card.removeEventListener("mousedown", onDown);
          card.removeEventListener("mouseup", onUp);
          if (pdfLink) {
            pdfLink.removeEventListener("mouseenter", onPdfEnter);
            pdfLink.removeEventListener("mouseleave", onPdfLeave);
          }
        });

        gsap.set(bg, { opacity: 0, scale: 0.95 });
        gsap.set(card, { y: 0, scale: 1 });
        gsap.set(title, { x: 0 });
        if (tagsWrap) gsap.set(tagsWrap, { y: 0, opacity: 1 });
        if (actionsReveal) gsap.set(actionsReveal, { y: 0, opacity: 1 });
        if (secondaryActions) gsap.set(secondaryActions, { y: 0, opacity: 1 });
        if (pdfAura) gsap.set(pdfAura, { autoAlpha: 0, scale: 0.8 });
        if (pdfShine) gsap.set(pdfShine, { autoAlpha: 0, xPercent: -130 });
        // No bookmarkIcon to init since it was removed
      });
    };

    rafId = window.requestAnimationFrame(bindHoverHandlers);

    return () => {
      window.cancelAnimationFrame(rafId);
      cleanups.forEach((fn) => fn());
    };
  }, [hoverBindKey, expandedAbstract, savedIds]);

  useEffect(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".collection-tree-item"));
    const cleanups: Array<() => void> = [];

    rows.forEach((row) => {
      const onEnter = () => gsap.to(row, { x: 2, duration: 0.2, ease: "power2.out", overwrite: "auto" });
      const onLeave = () => gsap.to(row, { x: 0, duration: 0.2, ease: "power2.out", overwrite: "auto" });
      row.addEventListener("mouseenter", onEnter);
      row.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        row.removeEventListener("mouseenter", onEnter);
        row.removeEventListener("mouseleave", onLeave);
      });
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [collections, activeCollectionId, visibleSavedRows.length]);

  const incrementJourneyClicks = useCallback(() => {
    clicksSinceSearchRef.current += 1;
  }, []);

  const addCollection = () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    if (!canAddCollection) {
      setToastMessage(`Max ${MAX_CUSTOM_COLLECTIONS} collections`);
      return;
    }
    const id = `col-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
    setCollections((prev) => [...prev, { id, name: trimmed, createdAt: new Date().toISOString() }]);
    setNewCollectionName("");
    setActiveCollectionId(id);
    setToastMessage(`Collection "${trimmed}" created`);
  };

  const removeCollection = (collectionId: string) => {
    if (collectionId === DEFAULT_COLLECTION.id) return;
    setCollections((prev) => prev.filter((collection) => collection.id !== collectionId));
    setSavedLibrary((prev) => {
      const next: Record<string, SavedLibraryItem> = {};
      Object.entries(prev).forEach(([id, entry]) => {
        const filtered = entry.collectionIds.filter((value) => value !== collectionId);
        next[id] = {
          ...entry,
          collectionIds: filtered.length > 0 ? filtered : [DEFAULT_COLLECTION.id],
        };
      });
      return next;
    });
    if (activeCollectionId === collectionId) setActiveCollectionId("all");
  };

  const upsertSavedPaper = (paper: NormalizedPaperResult, collectionId = DEFAULT_COLLECTION.id) => {
    const baseCollections = collections.map((entry) => entry.id);
    const safeCollection = baseCollections.includes(collectionId) ? collectionId : DEFAULT_COLLECTION.id;

    setSavedIds((prev) => new Set([...prev, paper.id]));
    setSavedPapersMap((prev) => {
      const next = new Map(prev);
      next.set(paper.id, { title: paper.title, year: paper.year ? String(paper.year) : "Unknown" });
      return next;
    });
    setSavedLibrary((prev) => {
      const existing = prev[paper.id];
      const existingCollections = existing?.collectionIds || [DEFAULT_COLLECTION.id];
      const collectionIds = Array.from(new Set([...existingCollections, safeCollection]));
      return {
        ...prev,
        [paper.id]: {
          id: paper.id,
          title: paper.title,
          year: paper.year,
          doi: paper.doi,
          venue: paper.venue,
          pdfUrl: paper.pdfUrl,
          landingUrl: paper.landingUrl,
          authors: paper.authors,
          savedAt: existing?.savedAt || new Date().toISOString(),
          collectionIds,
        },
      };
    });
  };

  const checkPdfUrl = useCallback(async (url: string): Promise<boolean> => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1800);
    try {
      const response = await fetch(`/api/link-check?url=${encodeURIComponent(url)}`, { signal: controller.signal });
      if (!response.ok) return true;
      const payload = (await response.json()) as { ok?: boolean };
      return payload.ok !== false;
    } catch {
      return true;
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  const openPaperLink = useCallback((url?: string, options?: { isPdf?: boolean; paperId?: string; paperTitle?: string }) => {
    if (!url) return;
    incrementJourneyClicks();
    
    if (options?.isPdf && options?.paperId) {
      capturePDFDownload(options.paperTitle || 'Unknown', options.paperId);
    }
    
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      setToastMessage("Popup blocked: allow popups to open papers");
      return;
    }

    setSessionMetrics((prev) => ({
      ...prev,
      clicksToOpenSamples: [...prev.clicksToOpenSamples, Math.max(1, clicksSinceSearchRef.current)].slice(-100),
    }));
    clicksSinceSearchRef.current = 0;

    if (options?.isPdf) {
      void checkPdfUrl(url).then((healthy) => {
        if (!healthy) {
          setSessionMetrics((prev) => ({ ...prev, deadPdfLinks: prev.deadPdfLinks + 1 }));
          setToastMessage("PDF link failed health check");
        }
      });
    }
  }, [checkPdfUrl, incrementJourneyClicks]);

  const exportAllBibtex = async () => {
    if (results.length === 0) return;
    const payload = results
      .map((paper) =>
        buildCitations({
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          doi: paper.doi,
          venue: paper.venue,
          url: paper.pdfUrl || paper.landingUrl,
        }).bibtex
      )
      .join("\n\n");
    await navigator.clipboard.writeText(payload);
    setToastMessage(`Copied BibTeX for ${results.length} papers`);
  };

  const submitSearch = (query: string) => {
    const q = preprocessQuery(query);
    clicksSinceSearchRef.current = 0;
    setResults([]); // Show loading skeleton immediately
    commitSearchState({ ...state, q, page: 1 }, setSearchParams, true);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
    setSuggestionNavActive(false);
    
    if (q) {
      addToSearchHistory(q, state.type, state.sort, state.year, state.filter, state.source);
    }
  };

  const closeSuggestions = () => {
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
    setSuggestionNavActive(false);
  };

  const onSuggestionSelect = (suggestion: SearchSuggestion) => {
    setInputValue(suggestion.label);
    submitSearch(suggestion.label);
  };

  const setSort = (sort: SearchSort) => {
    incrementJourneyClicks();
    captureFilterChange('sort', sort);
    commitSearchState({ ...state, sort, page: 1 }, setSearchParams, true);
    setSortDropdownOpen(false);
  };

  const setYear = (year: string) => {
    incrementJourneyClicks();
    captureFilterChange('year', year);
    commitSearchState({ ...state, year, page: 1 }, setSearchParams, true);
  };

  const setSource = (source: SourceKey) => {
    incrementJourneyClicks();
    captureFilterChange('source', source);
    const existing = new Set(state.source.split(",").map((value) => value.trim()).filter(Boolean));
    if (existing.has(source)) existing.delete(source);
    else existing.add(source);
    const next = Array.from(existing).join(",");
    commitSearchState({ ...state, source: next, page: 1 }, setSearchParams, true);
  };

  const toggleOpenAccess = () => {
    incrementJourneyClicks();
    const next = new Set(state.filter.split(",").map((value) => value.trim()).filter(Boolean));
    if (next.has("oa")) next.delete("oa");
    else next.add("oa");
    commitSearchState({ ...state, filter: Array.from(next).join(","), page: 1 }, setSearchParams, true);
  };

  const clearAllFilters = () => {
    commitSearchState({ ...state, type: "all", sort: "relevance", year: "", filter: "", source: "", page: 1 }, setSearchParams, true);
  };

  const setType = (type: SearchTypeFilter) => {
    incrementJourneyClicks();
    captureFilterChange('type', type);
    commitSearchState({ ...state, type, page: 1 }, setSearchParams, true);
  };

  const toggleQuickPill = (pill: "articles" | "conferences" | "preprints") => {
    if (pill === "preprints") {
      setType(state.type === "preprints" ? "all" : "preprints");
      return;
    }
    setType(state.type === "papers" ? "all" : "papers");
  };

  const quickPillPress = (pill: "articles" | "conferences" | "preprints") => {
    const el = quickPillRefs.current[pill];
    if (!el) return;
    gsap.to(el, {
      scale: MOTION.quickPill.downScale,
      duration: MOTION.quickPill.downDuration,
      ease: MOTION.quickPill.easeOut,
      overwrite: "auto",
    });
  };

  const quickPillRelease = (pill: "articles" | "conferences" | "preprints") => {
    const el = quickPillRefs.current[pill];
    if (!el) return;
    gsap.to(el, { scale: 1, duration: MOTION.quickPill.upDuration, ease: MOTION.quickPill.bounceEase, overwrite: "auto" });
  };

  const bouncePress = (event: React.MouseEvent<HTMLElement>, scale = 0.98) => {
    gsap.to(event.currentTarget, { scale, duration: 0.15, ease: "power2.out", overwrite: "auto" });
  };

  const bounceRelease = (event: React.MouseEvent<HTMLElement>) => {
    gsap.to(event.currentTarget, { scale: 1, duration: 0.4, ease: "back.out(2)", overwrite: "auto" });
  };

  const addPaperToLibrary = (paper: NormalizedPaperResult) => {
    if (savedIds.size >= MAX_SAVED_PAPERS) {
      setToastMessage(`Maximum ${MAX_SAVED_PAPERS} papers can be saved`);
      return;
    }
    upsertSavedPaper(paper, DEFAULT_COLLECTION.id);
    setToastMessage("Saved to library");
    setOpenActionMenuFor(null);
  };

  const removeSavedPaper = useCallback((paperId: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(paperId);
      return next;
    });
    setSavedPapersMap((prev) => {
      const next = new Map(prev);
      next.delete(paperId);
      return next;
    });
    setSavedLibrary((prev) => {
      const next = { ...prev };
      delete next[paperId];
      return next;
    });
    setToastMessage("Removed from library");
  }, []);

  const addPaperToCollection = (paper: NormalizedPaperResult, collectionId: string) => {
    upsertSavedPaper(paper, collectionId);
    const collectionName = collections.find((collection) => collection.id === collectionId)?.name || "collection";
    setToastMessage(`Saved to ${collectionName}`);
    setOpenActionMenuFor(null);
  };

  const addPaperToLibraryAndCollections = (paper: NormalizedPaperResult) => {
    upsertSavedPaper(paper, DEFAULT_COLLECTION.id);
    customCollections.forEach((collection) => upsertSavedPaper(paper, collection.id));
    setToastMessage("Saved to library + collections");
    setOpenActionMenuFor(null);
  };

  const toggleAbstract = useCallback((id: string) => {
    incrementJourneyClicks();
    setExpandedAbstract((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [incrementJourneyClicks]);

  const loadMore = () => {
    captureLoadMore();
    commitSearchState({ ...state, page: state.page + 1 }, setSearchParams, true);
  };

  useEffect(() => {
    if (!loadMoreTriggerRef.current || loading || visibleRows.length >= results.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isPrefetchingRef.current && visibleRows.length < results.length) {
          isPrefetchingRef.current = true;
          loadMore();
          setTimeout(() => {
            isPrefetchingRef.current = false;
          }, 1000);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => observer.disconnect();
  }, [loading, visibleRows.length, results.length, state.page]);

  const toggleRelated = async (paper: NormalizedPaperResult) => {
    incrementJourneyClicks();
    if (openRelatedFor === paper.id) {
      setOpenRelatedFor(null);
      return;
    }
    setOpenRelatedFor(paper.id);
    if (relatedById[paper.id] || !paper.openAlexId) return;
    setRelatedLoadingId(paper.id);
    const related = await fetchRelatedOpenAlexPapers(paper);
    setRelatedById((prev) => ({ ...prev, [paper.id]: related }));
    setRelatedLoadingId(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (event.key === "?" && !isTyping) {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      // Close cite popover on Escape (focus trap)
      if (event.key === "Escape" && openCitePopoverFor) {
        event.preventDefault();
        setOpenCitePopoverFor(null);
        return;
      }

      if (isTyping) return;
      if (visibleRows.length === 0) return;

      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setSelectedResultIndex((prev) => Math.min(prev + 1, visibleRows.length - 1));
        return;
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSelectedResultIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        toggleAbstract(visibleRows[selectedResultIndex].id);
        return;
      }

      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        const selected = visibleRows[selectedResultIndex];
        const url = selected?.pdfUrl || selected?.landingUrl;
        if (url) {
          incrementJourneyClicks();
          window.location.href = url;
        }
        return;
      }

      // C key — open the dedicated cite popover (not the general action menu)
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        const selected = visibleRows[selectedResultIndex];
        if (selected) setOpenCitePopoverFor(selected.id);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCitePopoverFor, openPaperLink, selectedResultIndex, toggleAbstract, visibleRows]);

  return (
    <div id="main-content" className="min-h-screen bg-white text-[#111111] [font-family:'Satoshi','GT_Walsheim_Pro',system-ui,-apple-system,sans-serif]">
      <style>{`
        .no-select { user-select: none; -webkit-user-select: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        * { -webkit-tap-highlight-color: transparent; }
        /* antialiasing on retina [type-antialiased-on-retina] */
        * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .grain-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          mix-blend-mode: multiply;
        }
        .custom-table-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.85rem;
        }
        .cell-paper {
          min-width: 0;
        }
        .cell-actions {
          width: 100%;
        }
        /* Paper action buttons [physics-active-state] */
        .paper-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          height: 34px;
          border-radius: 9999px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #374151;
          padding: 0 0.8rem;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.01em;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
          will-change: transform;
        }
        .paper-action-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        /* [physics-active-state] scale on :active */
        .paper-action-btn:active { transform: scale(0.96); }
        .paper-action-btn-save {
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border-color: #0ea5e9;
          color: #075985;
          box-shadow: 0 1px 3px rgba(14,165,233,0.15);
        }
        .paper-action-btn-save:hover {
          background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
          border-color: #0284c7;
          color: #0c4a6e;
          box-shadow: 0 2px 8px rgba(14,165,233,0.2);
        }
        /* PDF button [visual-layered-shadows] [visual-button-shadow-anatomy] */
        .paper-action-btn-pdf {
          border-color: #94a3b8;
          background: linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(241,245,249,0.98) 100%);
          color: #0f172a;
          height: 38px;
          padding: 0 1rem;
          font-size: 13px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.9),
            inset 0 -1px 0 rgba(0,0,0,0.04),
            0 1px 3px rgba(15,23,42,0.06),
            0 4px 14px rgba(15,23,42,0.08);
        }
        .paper-action-btn-pdf:hover {
          border-color: #14b8a6;
          background: linear-gradient(180deg, rgba(236,253,250,0.98) 0%, rgba(204,251,241,0.98) 100%);
          color: #0f766e;
        }
        .paper-action-btn-icon {
          width: 34px;
          padding: 0;
        }
        /* [physics-subtle-deformation] keyword highlights */
        .highlight-match {
          display: inline-block;
          transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 160ms ease;
          cursor: default;
        }
        .highlight-match:hover {
          transform: scale(1.05) translateY(-1px);
          background-color: rgba(253, 224, 71, 0.9) !important;
          color: #713f12 !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.06);
        }
        .focus-pop:focus-visible {
          outline: 2px solid #0ea5e9;
          outline-offset: 2px;
          border-radius: 10px;
        }
        /* [easing-entrance-ease-out] card lift */
        .wise-hover {
          transition: transform 220ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms ease;
        }
        .wise-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px -4px rgba(0,0,0,0.08);
        }
        @media (hover: none) {
          .wise-hover:active {
            transform: scale(0.98);
          }
        }
        /* Library sidebar redesign (Linear / Notion style) */
        .lib-tree-row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 140ms ease, color 140ms ease;
          font-size: 13px;
          font-weight: 500;
          color: #6b7280;
          min-height: 30px;
          user-select: none;
        }
        .lib-tree-row:hover { background: #f3f4f6; color: #111827; }
        .lib-tree-row.active { background: #f0f9ff; color: #0369a1; font-weight: 600; }
        .lib-tree-row .lib-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
          background: currentColor;
          opacity: 0.4;
          transition: opacity 140ms ease;
        }
        .lib-tree-row.active .lib-dot { opacity: 1; }
        .lib-count-badge {
          margin-left: auto;
          font-size: 11px;
          font-weight: 600;
          color: #9ca3af;
          min-width: 16px;
          text-align: right;
        }
        .lib-tree-row.active .lib-count-badge { color: #0369a1; }
        /* Saved item link micro-interactions */
        .saved-item-link {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 7px 8px;
          border-radius: 8px;
          cursor: pointer;
          text-decoration: none;
          transition: background-color 140ms ease;
          position: relative;
          overflow: hidden;
        }
        .saved-item-link::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg,rgba(14,165,233,0.08),rgba(14,165,233,0.02));
          border-radius: 8px;
          opacity: 0;
          transition: opacity 200ms ease;
        }
        .saved-item-link:hover::before { opacity: 1; }
        .saved-item-link:hover { background: #f9fafb; }
        /* Active filter pill entrance [easing-entrance-ease-out] */
        @keyframes pill-in {
          from { opacity: 0; transform: scale(0.85) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .filter-pill-enter { animation: pill-in 200ms cubic-bezier(0.22,1,0.36,1) both; }
        /* Citations badge – square-rounded [visual-concentric-radius] */
        .citations-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: #fff;
          padding: 3px 7px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .citations-badge.cited {
          background: #f8fafc;
          color: #475569;
        }
        /* Author truncated hover */
        .authors-truncated {
          display: inline;
          cursor: default;
        }
        .authors-truncated .authors-full {
          display: none;
        }
        .card:hover .authors-truncated .authors-short { display: none; }
        .card:hover .authors-truncated .authors-full { display: inline; }
        /* Micro-dialog tooltip [staging-one-focal-point] */
        .micro-dialog {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%) scale(0.88);
          background: #111;
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 8px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 140ms ease, transform 160ms cubic-bezier(0.22,1,0.36,1);
          z-index: 200;
        }
        .micro-dialog-parent:hover .micro-dialog {
          opacity: 1;
          transform: translateX(-50%) scale(1);
        }
        /* Explore field – amber accent (not purple/blue) */
        .explore-field-btn {
          border-radius: 12px;
          border: 1px solid #fde047;
          background: linear-gradient(135deg,#fefce8,#fef9c3);
          padding: 8px 12px;
          text-align: left;
          transition: background 160ms ease, border-color 160ms ease, transform 200ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms ease;
          will-change: transform;
        }
        .explore-field-btn:hover {
          background: linear-gradient(135deg,#fef9c3,#fef08a);
          border-color: #facc15;
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(202,138,4,0.15);
        }
        .explore-field-btn:active { transform: scale(0.97); }
        /* Search tips inline panel */
        .search-tips-panel {
          overflow: hidden;
          transition: max-height 280ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease;
        }
        /* [easing-entrance-ease-out] for search input focus */
        .search-container-wrap {
          transition: transform 220ms cubic-bezier(0.22,1,0.36,1);
        }
        /* Confirmation mini-toast (same style as main toast) */
        @keyframes mini-toast-in {
          from { opacity:0; transform:translateY(6px) scale(0.92); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .mini-toast {
          position: fixed;
          bottom: 72px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 60;
          animation: mini-toast-in 220ms cubic-bezier(0.22,1,0.36,1) both;
        }
      `}</style>

      <div className="grain-overlay" />

      <div className="relative z-10 mx-auto flex w-full max-w-[1600px] px-0 md:px-6">
        {/* Left sidebar – Linear/Notion-style library [ux-proximity-grouping] [visual-concentric-radius] */}
        <aside className="hide-scrollbar sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col overflow-y-auto border-r border-gray-100 pb-10 pt-8 pr-5 lg:flex">
          {/* Upper half: Brand, nav, description */}
          <div className="flex flex-col gap-5">
            {/* Brand */}
            <button 
              onClick={() => navigate("/")}
              className="flex cursor-default items-center gap-3 px-1 hover:opacity-80 transition-opacity"
            >
              <img 
                src="/new_logo_no_bg.png" 
                alt="Kumo"
                className="h-28 w-auto object-contain"
              />
            </button>

            {/* Nav links */}
            <nav className="flex items-center gap-4 px-1">
              <a href="/about" className="group relative text-[13px] font-semibold text-gray-400 transition-colors hover:text-gray-800">
                about
                <span className="absolute -bottom-0.5 left-0 h-[1.5px] w-full origin-left scale-x-0 bg-gray-800 transition-transform duration-250 group-hover:scale-x-100" />
              </a>
              <a href="https://github.com/saishankar404/kumo" target="_blank" rel="noopener noreferrer" className="group relative text-[13px] font-semibold text-gray-400 transition-colors hover:text-gray-800">
                github
                <span className="absolute -bottom-0.5 left-0 h-[1.5px] w-full origin-left scale-x-0 bg-gray-800 transition-transform duration-250 group-hover:scale-x-100" />
              </a>
            </nav>

            {/* Description */}
            <p className="text-[15px] font-medium leading-[1.6] text-gray-500">
              A lightning-fast research engine designed for cognitive ease. Find, read, and organize academic papers without the noise.
            </p>

          </div>

          {/* Spacer to push bottom content down */}
          <div className="flex-1" />

          {/* Bottom half: Library, Explore field, Footer */}
          <div className="flex flex-col gap-0.5">
            {/* Library section */}
            <div className="flex flex-col gap-0.5">
              {/* Section header */}
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Library</span>
                {canAddCollection && (
                  <button
                    type="button"
                    title="New collection"
                    onClick={() => {
                      const name = window.prompt("Collection name:");
                      if (name?.trim()) {
                        setNewCollectionName(name.trim());
                        setTimeout(() => {
                          const id = `col-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
                          setCollections((prev) => [...prev, { id, name: name.trim(), createdAt: new Date().toISOString() }]);
                          setActiveCollectionId(id);
                          setToastMessage(`Collection "${name.trim()}" created`);
                        }, 0);
                      }
                    }}
                    className="micro-dialog-parent relative flex h-5 w-5 items-center justify-center rounded-[5px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    aria-label="New collection"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    <span className="micro-dialog">New folder</span>
                  </button>
                )}
              </div>

              {/* Default saved */}
              <button
                type="button"
                onClick={() => setActiveCollectionId("all")}
                className={`collection-tree-item lib-tree-row w-full text-left pl-5 ${activeCollectionId === "all" ? "active" : ""}`}
              >
                <span className="lib-dot" />
                <span className="flex-1 truncate">Saved</span>
                <span className="lib-count-badge">{savedRows.length || ""}</span>
              </button>

              {/* Custom collections */}
              {customCollections.map((collection) => (
                <div key={collection.id} className="collection-tree-item group/col flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveCollectionId(collection.id)}
                    className={`lib-tree-row flex-1 text-left pl-5 ${activeCollectionId === collection.id ? "active" : ""}`}
                  >
                    <span className="lib-dot" />
                    <span className="flex-1 truncate">{collection.name}</span>
                    <span className="lib-count-badge">
                      {Object.values(savedLibrary).filter(p => p.collectionIds.includes(collection.id)).length || ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete "${collection.name}"?`)) removeCollection(collection.id);
                    }}
                    className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 group-hover/col:opacity-100"
                    aria-label={`Delete ${collection.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {/* Saved items list */}
              {visibleSavedRows.length === 0 ? (
                <div className="mt-3 rounded-[10px] border border-dashed border-gray-200 px-3 py-4 text-[12px] font-medium leading-relaxed text-gray-400">
                  Save papers to see them here.
                </div>
              ) : (
                <div className="mt-2 flex flex-col gap-0.5 pb-6">
                  {visibleSavedRows
                    .slice()
                    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
                    .slice(0, 10)
                    .map((paper) => {
                      const href = paper.pdfUrl || (paper.doi ? `https://doi.org/${paper.doi}` : paper.landingUrl);
                      return (
                        <div key={paper.id} className="flex items-center gap-1">
                          <a
                            href={href || "/search"}
                            target="_blank"
                            rel="noreferrer"
                            className="saved-item-link flex-1"
                            title={paper.title}
                          >
                            <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-gray-700 transition-colors hover:text-[#0369a1]">{stripHtml(paper.title)}</span>
                            <span className="text-[11px] font-medium text-gray-400">{paper.year || "Unknown"}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => removeSavedPaper(paper.id)}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500"
                            aria-label={`Remove ${stripHtml(paper.title)}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  {visibleSavedRows.length > 10 && (
                    <p className="ml-2 mt-1 text-[11px] font-semibold text-gray-400">
                      +{visibleSavedRows.length - 10} more
                    </p>
                  )}
                </div>
              )}

              {/* Explore field – amber accent instead of purple [user request] */}
              {suggestedConcept && !loading && (
                <button
                  type="button"
                  onClick={() => submitSearch(suggestedConcept)}
                  className="explore-field-btn mt-1 w-full"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#92400e]/60">Explore Field</p>
                  <p className="mt-0.5 text-[12px] font-bold text-[#92400e]">{suggestedConcept}</p>
                </button>
              )}

              {/* Footer */}
              <div className="pt-6 text-[11px] font-medium leading-relaxed text-gray-400 opacity-70 px-1">
                search beyond every paywall.
                <br />
                2026 @ <a href="https://github.com/saishankar404/kumo" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Kumo</a>.
              </div>
            </div>
          </div>
        </aside>

        <main className="min-h-screen w-full flex-1 px-3 py-6 md:px-8 md:py-10 xl:px-10">
          {/* Mobile header with hamburger */}
          <div className="flex items-center justify-between lg:hidden mb-4 -mt-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 active:bg-gray-200"
              aria-label="Open menu"
            >
              <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <div className="relative z-40 mb-6 w-full">
            <form
              ref={formRef}
              className="relative"
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch(inputValue);
              }}
            >
              <div
                ref={searchContainerRef}
                className="search-container-wrap relative flex h-[56px] md:h-[64px] w-full items-center rounded-[18px] md:rounded-[20px] border-[2px] border-gray-200 bg-[#f9fafb] px-3 md:px-4 hover:bg-[#f0f0f1] focus-within:-translate-y-0.5 focus-within:border-[#0ea5e9] focus-within:bg-white focus-within:shadow-[0_8px_30px_rgba(14,165,233,0.12)]"
              >
                <div className="group-focus-within:scale-110 pl-2 pr-2 md:pl-3 md:pr-3 text-[#0ea5e9] transition-transform duration-200">
                  <Search className="h-5 w-5 md:h-[24px] md:w-[24px] stroke-[2.5]" />
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(event) => {
                    setInputValue(event.target.value);
                    closeSuggestions();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitSearch(inputValue);
                      return;
                    }
                    if (event.key === "Escape") {
                      closeSuggestions();
                    }
                    // Keyboard shortcut: / to focus search
                    if (event.key === "/" && document.activeElement !== inputRef.current) {
                      event.preventDefault();
                      inputRef.current?.focus();
                    }
                  }}
                  placeholder="Find paper..."
                  autoComplete="off"
                  aria-label="Search papers"
                  className="search-input h-full flex-1 bg-transparent px-2 py-0 text-base md:text-[18px] font-bold text-gray-900 outline-none placeholder:font-bold placeholder:text-gray-400"
                />

                {inputValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputValue("");
                      submitSearch("");
                    }}
                    className="mr-2 rounded-full bg-gray-200 p-1.5 text-gray-500 transition-all hover:scale-110 hover:bg-gray-300 hover:text-gray-800"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4 stroke-[3]" />
                  </button>
                )}

                <div className="mx-1 md:mx-2 hidden md:block h-6 md:h-8 w-[1px] md:w-[2px] rounded-full bg-gray-200" />

                <div className="hidden md:flex items-center gap-1.5 mr-2">
                  <kbd className="rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">/</kbd>
                  <span className="text-[11px] text-gray-400">to search</span>
                </div>

                <div ref={sourceDropdownRef} className="relative hidden md:flex h-full items-center">
                  <button
                    type="button"
                    onClick={() => setSourceDropdownOpen((prev) => !prev)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSourceDropdownOpen(true);
                      }
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={sourceDropdownOpen}
                    className="group flex h-full items-center gap-2 rounded-[14px] px-3 text-[15px] font-bold text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900"
                  >
                    {selectedSourceLabel}
                    <ChevronDown className="h-4 w-4 text-gray-400 transition-transform duration-300 group-hover:translate-y-0.5" strokeWidth={2.5} />
                  </button>

                  {sourceDropdownOpen && (
                    <div ref={sourceDropdownMenuRef} className="absolute right-0 top-[110%] z-[100] w-52 rounded-[12px] border border-gray-100 bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
                      <button
                        className="flex w-full items-center justify-between rounded-[8px] bg-gray-50 px-3 py-2 text-left text-[13px] font-bold text-gray-900"
                        onClick={() => {
                          commitSearchState({ ...state, source: "", page: 1 }, setSearchParams, true);
                          setSourceDropdownOpen(false);
                        }}
                      >
                        All Sources
                        {!state.source && <Check className="h-4 w-4 text-gray-900" />}
                      </button>
                      {SOURCE_OPTIONS.map((source) => (
                        <button
                          key={source.key}
                          className="mt-1 flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                          onClick={() => setSource(source.key)}
                        >
                          {source.label}
                          {selectedSources.includes(source.key) && <Check className="h-4 w-4 text-gray-900" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </form>

            {/* Search tips inline – hidden on mobile, shown on lg */}
            <div className="mt-3 hidden rounded-[14px] border border-gray-100 bg-[#fafafa] px-4 py-2.5 lg:block">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] font-medium text-gray-500">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Tips:</span>
                <span>Use <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-700">AND</kbd> <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-700">OR</kbd> <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-700">NOT</kbd> operators</span>
                <span>or <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-700">"quoted phrases"</kbd></span>
                <span className="text-gray-400">·</span>
                <span className="text-[11px] text-gray-400"><span className="font-mono font-bold text-gray-500">/</span> to focus · <span className="font-mono font-bold text-gray-500">J/K</span> navigate · <span className="font-mono font-bold text-gray-500">O</span> open</span>
              </div>
            </div>

          </div>

          <div className="relative z-30 mb-2 flex w-full flex-col justify-between gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-1">
              <div className="text-[14px] font-medium text-gray-500">
                {loading ? (
                  <span>Searching…</span>
                ) : (
                  <span>~<span className="font-bold text-gray-900">{results.length.toLocaleString()}</span> papers</span>
                )}
                {state.q.trim() ? (
                  <>
                    {" "}for <span className="font-bold text-gray-900">"{state.q.trim()}"</span>
                    {!loading && firstResultMs && (
                      <> · <span className="font-bold text-green-600">
                        {firstResultMs < 500 ? `${firstResultMs}ms` : `${(firstResultMs / 1000).toFixed(1)}s`}
                      </span></>
                    )}
                  </>
                ) : (
                  <> based on relevance</>
                )}
              </div>
            </div>

            <div className="flex w-auto flex-wrap items-center gap-2 md:gap-3 lg:w-auto lg:justify-end overflow-x-auto">
              {/* Mobile: Filters button (UI-08) */}
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-gray-200 bg-white px-3.5 text-[13px] font-bold text-gray-600 transition-colors hover:bg-gray-50 lg:hidden"
                onClick={() => setMobileFiltersOpen(true)}
              >
                Filters
                {activeFilterPills.length > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0ea5e9] text-[10px] font-black text-white">
                    {activeFilterPills.length}
                  </span>
                )}
              </button>
              {/* Type chips + active filter pills - desktop only */}
              <div className="hidden lg:flex flex-wrap items-center gap-2">
                {TYPE_CHIPS.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    role="button"
                    aria-pressed={state.type === chip.value}
                    onClick={() => setType(chip.value)}
                    className={`group inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-4 text-[14px] font-bold shadow-sm transition-all duration-200 active:scale-95 ${state.type === chip.value
                        ? "border-[#0ea5e9] bg-[#f0f9ff] text-[#0369a1]"
                        : "border-gray-200 bg-white text-gray-600 hover:border-[#0ea5e9]/50 hover:bg-[#f0f9ff] hover:text-[#0369a1]"
                      }`}
                  >
                    <span>{chip.label}</span>
                  </button>
                ))}
                {/* Active filter pills – appended inline here [user request: remove separate Filters: row] */}
                {activeFilterPills.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    aria-label={`Remove filter: ${pill.label}`}
                    onClick={() => commitSearchState({ ...state, ...pill.clear, page: 1 }, setSearchParams, true)}
                    className="filter-pill-enter focus-pop inline-flex h-9 items-center gap-1 rounded-full border border-[#bae6fd] bg-[#e0f2fe] px-3 text-[13px] font-bold text-[#0369a1] transition-all hover:border-[#0ea5e9] hover:bg-[#bae6fd] active:scale-95"
                  >
                    {pill.label}
                    <X className="h-3 w-3" strokeWidth={3} />
                  </button>
                ))}
                {activeFilterPills.length > 0 && (
                  <button
                    type="button"
                    onClick={() => commitSearchState({ ...state, type: "all", sort: "relevance", year: "", filter: "", source: "", page: 1 }, setSearchParams, true)}
                    className="text-[12px] font-bold text-gray-400 underline underline-offset-2 transition-colors hover:text-gray-700"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div ref={sortDropdownRef} className="relative ml-auto hidden lg:block lg:ml-0">
                <button
                  type="button"
                  onClick={() => setSortDropdownOpen((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSortDropdownOpen(true);
                    }
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={sortDropdownOpen}
                  className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-[13px] text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 active:scale-95"
                >
                  Sort by: <span className="font-bold text-gray-700 group-hover:text-gray-900">{currentSortLabel}</span>
                  <ChevronDown className="h-4 w-4 text-gray-400 transition-colors group-hover:text-gray-700" />
                </button>

                {sortDropdownOpen && (
                  <div ref={sortDropdownMenuRef} className="absolute right-0 top-[120%] z-[100] w-44 rounded-[12px] border border-gray-100 bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
                    {SORT_OPTIONS.map((option, index) => (
                      <button
                        key={option.key}
                        className={`flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[13px] transition-colors ${index === 0 ? "" : "mt-1"
                          } ${state.sort === option.key
                            ? "bg-gray-50 font-bold text-gray-900"
                            : "font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                        onClick={() => setSort(option.key)}
                      >
                        {option.label}
                        {state.sort === option.key && <Check className="h-4 w-4 text-gray-900" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active filter pills are now inline with type chips above – no separate row */}

{fullFailure && (
<SearchErrorFallback
title="All sources unavailable"
message="We couldn't reach any search sources. Please try again or search directly on these platforms."
onRetry={() => submitSearch(state.q)}
isRetrying={loading}
/>
)}

{(searchMode === "doi" || searchMode === "arxiv") && state.q.trim() && (
            <div className="mb-3 rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] text-[#5e5d58]">
              Direct match mode active for {searchMode === "doi" ? "DOI" : "arXiv ID"} query.
            </div>
          )}

          {searchMode === "title" && results[0] && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-[#dbeafe] bg-[#f0f9ff] px-3 py-2 text-[12px]">
              <span className="font-semibold text-[#0369a1]">Did you mean this paper?</span>
              <span className="line-clamp-1 min-w-0 flex-1 font-medium text-gray-700">{results[0].title}</span>
              <a
                href={results[0].pdfUrl || toDoiUrl(results[0].doi) || results[0].landingUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[#bae6fd] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#0369a1] hover:bg-[#e0f2fe]"
              >
                Open
              </a>
            </div>
          )}

<SourceStatusIndicator 
  sources={progress.map(p => ({
    key: p.key,
    loading: p.loading,
    error: p.error,
    count: p.count,
  }))} 
 />

{initialState && !loading && (
  <SearchInitialState onSearch={submitSearch} />
)}

          <div
            id="feed"
            className="relative flex flex-col px-2 pb-24"
            style={{ perspective: 1000 }}
            onMouseEnter={() => {
              if (showSuggestions) closeSuggestions();
            }}
>
{loading && results.length === 0 && (
<SearchLoadingState count={4} />
)}

<ResultsTransition results={results} loading={loading}>
{visibleRows.map((paper, index) => {
              const expanded = expandedAbstract.has(paper.id);
              const cleanedAuthors = paper.authors.map(stripHtml).filter(Boolean);
              // Truncated: first author + N others [user request]
              const firstAuthor = cleanedAuthors[0] || "Unknown";
              const extraCount = cleanedAuthors.length - 1;
              const authorShort = cleanedAuthors.length > 1
                ? `${firstAuthor} +${extraCount} other${extraCount > 1 ? "s" : ""}`
                : firstAuthor;
              const authorFull = cleanedAuthors.join(", ") || "Unknown";
              const hasCitations = typeof paper.citations === "number" && paper.citations > 0;
              const citesLabel = hasCitations ? paper.citations.toLocaleString() : "-";
              const canOpenPdf = paper.pdfAvailable && paper.oaStatus !== "closed" && Boolean(paper.pdfUrl);
              const isSaved = savedIds.has(paper.id);
              const sourceTag = (paper.foundIn[0]?.toLowerCase().includes("arxiv")
                ? "arxiv"
                : paper.foundIn[0]?.toLowerCase().includes("openalex")
                  ? "openalex"
                  : paper.foundIn[0]?.toLowerCase().includes("semantic")
                    ? "semantic-scholar"
                    : "biorxiv-medrxiv") as SourceKey;

              return (
                <article
                  key={paper.id}
                  data-paper-id={paper.id}
                  aria-label={paper.title}
                  className="feed-item fp-feed-item relative w-full border-b border-gray-100 py-1"
                >
                  <div
                    className="card custom-table-grid no-select relative z-10 w-full cursor-pointer items-start px-3 md:px-5 py-4 md:py-7 wise-hover"
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest(".pdf-link") || target.closest(".bookmark-icon") || target.closest(".interactive-tag") || target.closest(".highlight-match") || target.closest("a,button")) return;
                      toggleAbstract(paper.id);
                    }}
                  >
                    <div className="card-bg pointer-events-none absolute -inset-x-5 -inset-y-1 -z-10 origin-center scale-95 rounded-[24px] border border-[#e0f2fe] bg-[#f0f9ff]/85 opacity-0 shadow-[0_12px_40px_rgba(2,132,199,0.12)] backdrop-blur-md" />

                    <div className="cell-paper relative z-10 flex min-w-0 flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">
                        <span className={`interactive-tag relative cursor-default overflow-hidden rounded-[8px] border px-2.5 py-1 text-center transition-all duration-300 hover:-translate-y-0.5 ${SOURCE_THEME[sourceTag] || "border-[#bae6fd] bg-[#e0f2fe] text-[#0284c7]"}`}>{paper.sourceLabel}</span>
                        <span className={`rounded-[8px] border px-2 py-1 ${canOpenPdf ? "border-[#bbf7d0] bg-[#dcfce7] text-[#15803d]" : "border-gray-200 bg-gray-50 text-gray-500"}`}>
                          {canOpenPdf ? "PDF" : "Abstract"}
                        </span>
                        <span className="rounded-[8px] border border-gray-200 bg-[#f8fafc] px-2 py-1 text-[#475569]">{paper.type}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="paper-title font-gt py-0.5 text-base sm:text-[17px] lg:text-[19px] font-medium leading-[1.3] tracking-[-0.01em] text-gray-900">
                          {stripHtml(paper.title)}
                        </h3>
                        {/* Citations – square-rounded [user request] */}
                        <span className={`citations-badge ${toneForCitations(paper.citations)}`}>
                          {citesLabel !== "-" ? `${citesLabel} cit.` : "—"}
                        </span>
                      </div>

                      <p className="text-[12px] font-medium text-gray-500">
                        {/* Author truncation: show short by default, full on card hover [user request] */}
                        <span className="authors-truncated">
                          <span className="authors-short">{authorShort}</span>
                          <span className="authors-full">{authorFull}</span>
                        </span>
                        <span className="mx-1.5 text-gray-300">•</span>
                        <span>{paper.venue || paper.sourceLabel}</span>
                        <span className="mx-1.5 text-gray-300">•</span>
                        <span>{paper.year || "-"}</span>
                        {paper.foundIn.length > 1 && (
                          <>
                            <span className="mx-1.5 text-gray-300">•</span>
                            <span>{paper.foundIn.length} sources</span>
                          </>
                        )}
                      </p>

                      <div className="cell-abstract border-t border-gray-100 pt-3">
                        <div className="abstract-wrap relative mt-0.5 overflow-hidden">
                            <div className={`abstract-text m-0 pr-2 text-[14px] leading-[1.68] text-gray-600 ${expanded ? "" : "line-clamp-2"}`}>
                              <HighlightedAbstract text={paper.abstract || "No abstract available."} query={state.q} />
                            </div>
                        </div>
                      </div>

                      {paper.concepts.length > 0 && (
                        <div className="tags-wrap mt-1 flex flex-wrap gap-1.5">
                          {paper.concepts.slice(0, 6).map((concept) => (
                            <button
                              key={concept}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                submitSearch(concept);
                              }}
                              className="focus-pop rounded-full border border-[#ddd6fe] bg-[#f5f3ff] px-2.5 py-1 text-[10px] font-bold text-[#5b4ca5] transition-all hover:bg-[#ede9fe]"
                              title={`Search: ${concept}`}
                            >
                              {concept}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="cell-actions mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                        <div className="actions-reveal flex flex-wrap items-center gap-2">
                          {/* + Save to Library replaces Expand abstract [user request] */}
                          <button
                            type="button"
                            className={`focus-pop paper-action-btn paper-action-btn-save micro-dialog-parent relative`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (isSaved) {
                                removeSavedPaper(paper.id);
                              } else {
                                addPaperToLibrary(paper);
                              }
                            }}
                            aria-label={isSaved ? "Remove from library" : "Save to Library"}
                          >
                            <span>{isSaved ? "− Remove" : "+ Save to Library"}</span>
                            <span className="micro-dialog">{isSaved ? "Remove from library" : "Save this paper"}</span>
                          </button>
                          {/* Explore related removed per user request */}
                        </div>

                        <div className="card-secondary-actions flex items-center gap-2 text-[11px] font-semibold text-gray-500">
                          {/* Bookmark icon removed per user request; save is in main actions-reveal button */}
                          {/* Collection quick-save dropdown for custom collections */}
                          {customCollections.length > 0 && (
                            <div className="action-menu-wrap relative">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenActionMenuFor((prev) => (prev === paper.id ? null : paper.id));
                                }}
                                className="micro-dialog-parent relative focus-pop inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-500 transition-all hover:border-[#0ea5e9] hover:bg-[#f0f9ff] hover:text-[#0369a1] active:scale-95"
                                aria-label="Save to collection"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Collection</span>
                                <span className="micro-dialog">Add to folder</span>
                              </button>
                              {openActionMenuFor === paper.id && (
                                <div
                                  data-action-menu={paper.id}
                                  className="absolute right-0 top-[115%] z-[90] w-56 rounded-[12px] border border-gray-200 bg-white p-1.5 shadow-[0_14px_32px_rgba(15,23,42,0.14)]"
                                >
                                  {customCollections.map((collection) => (
                                    <button
                                      key={`${paper.id}-${collection.id}`}
                                      type="button"
                                      className="action-menu-item mt-1 flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 first:mt-0"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        addPaperToCollection(paper, collection.id);
                                      }}
                                    >
                                      {collection.name}
                                      {(savedLibrary[paper.id]?.collectionIds || []).includes(collection.id) && <Check className="h-3.5 w-3.5 text-[#0ea5e9]" />}
                                    </button>
                                  ))}
                                  {customCollections.length > 0 && (
                                    <button
                                      type="button"
                                      className="action-menu-item mt-1 w-full rounded-[8px] border border-gray-100 bg-gray-50 px-2.5 py-2 text-left text-[12px] font-bold text-gray-600 transition-colors hover:bg-gray-100"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        addPaperToLibraryAndCollections(paper);
                                      }}
                                    >
                                      All collections
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {canOpenPdf ? (
                            <a
                              href={paper.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="focus-pop pdf-link paper-action-btn paper-action-btn-pdf micro-dialog-parent relative overflow-hidden whitespace-nowrap"
                              onClick={(event) => {
                                event.stopPropagation();
                                incrementJourneyClicks();
                                capturePDFDownload(paper.title, paper.id);
                              }}
                            >
                              <span className="pdf-aura pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_70%_20%,rgba(20,184,166,0.22),transparent_60%)] opacity-0" />
                              <span className="pdf-shine pointer-events-none absolute inset-y-0 left-[-35%] w-[30%] bg-gradient-to-r from-transparent via-white/65 to-transparent opacity-0" />
                              <svg className="pdf-glyph h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                              <span className="pdf-label">Open PDF</span>
                              <span className="micro-dialog">Open in new tab</span>
                            </a>
                          ) : (
                            <a
                              href={toDoiUrl(paper.doi) || paper.landingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="focus-pop hover:text-[#0369a1]"
                              onClick={(event) => {
                                event.stopPropagation();
                                incrementJourneyClicks();
                              }}
                            >
                              View abstract
                            </a>
                          )}
                          {paper.pdfOptions.length > 1 && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenVersionsFor((prev) => (prev === paper.id ? null : paper.id));
                              }}
                              className="focus-pop hover:text-[#0369a1]"
                            >
                              {paper.pdfOptions.length} versions
                            </button>
                          )}
                        </div>

                        {openVersionsFor === paper.id && (
                          <div className="versions-wrap relative mt-1 w-full rounded-[10px] border border-[#E1E1E1] bg-white py-1 shadow-[0_8px_22px_rgba(0,0,0,0.08)]">
                            {paper.pdfOptions.map((option, idx) => (
                              <a
                                key={`${paper.id}-option-${idx}-${option.url}`}
                                href={option.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="focus-pop block w-full rounded-[8px] px-3 py-1.5 text-left text-[11px] text-[#0F0F0F] transition-colors hover:bg-[#F1F1EF]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  incrementJourneyClicks();
                                }}
                              >
                                {option.label} · {option.source}
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Explore related panel removed from inline display per user request */}
                      </div>
                    </div>
                  </div>
</article>
);
})}
</ResultsTransition>

{noResults && (
<SearchEmptyState
  title="No papers found"
  message="Try adjusting your search terms or filters to find what you're looking for."
  suggestions={[
    "Try broader search",
    "Check arXiv",
    "Check OpenAlex",
  ]}
  onSuggestionClick={(suggestion) => {
    if (suggestion === "Try broader search") {
      submitSearch(state.q.split(" ").slice(0, 2).join(" "));
    } else if (suggestion === "Check arXiv") {
      window.open(`https://arxiv.org/search/?query=${encodeURIComponent(state.q)}&searchtype=all`, '_blank');
    } else if (suggestion === "Check OpenAlex") {
      window.open(`https://openalex.org/works?search=${encodeURIComponent(state.q)}`, '_blank');
    }
  }}
/>
)}
          </div>

          {visibleRows.length < results.length && (
            <div ref={loadMoreTriggerRef} className="mb-10 mt-2 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="rounded-[10px] border border-[#E1E1E1] bg-white px-6 py-2 text-[13px] font-bold text-[#0F0F0F] shadow-sm transition-colors hover:bg-[#FAFAFA] disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load more results'}
              </button>
            </div>
          )}
        </main>

        <aside className="hide-scrollbar sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col overflow-y-auto border-l border-gray-100 py-10 pl-6 lg:flex">
          <div className="flex flex-col pb-20">
            <div className="mb-6 flex h-[64px] items-center justify-between border-b border-gray-100">
              <h3 className="font-gt text-[15px] font-medium text-gray-900 tracking-[-0.01em]">Refine Search</h3>
              <button type="button" onClick={clearAllFilters} className="text-[11px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-gray-700">
                Clear all
              </button>
            </div>

            <div className="mb-6 flex flex-col gap-3 border-b border-gray-100 pb-6">
              <h4 className="mb-0.5 text-[13px] font-extrabold uppercase tracking-wider text-gray-400">Date Range</h4>
              <div className="flex flex-wrap gap-2.5">
                {YEAR_OPTIONS.map((option) => {
                  const active = state.year === option.value;
                  return (
                    <button
                      key={option.value || "all-time"}
                      type="button"
                      onClick={() => setYear(option.value)}
                      onMouseDown={(event) => bouncePress(event, 0.94)}
                      onMouseUp={(event) => bounceRelease(event)}
                      onMouseLeave={(event) => bounceRelease(event)}
                      className={`relative overflow-hidden rounded-[12px] border-2 px-3.5 py-2 text-[14px] font-bold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${active
                          ? "border-[#0ea5e9] bg-[#f0f9ff] text-[#0369a1] shadow-sm ring-4 ring-[#bae6fd]/50"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                    >
                      <span className="relative z-10">{option.label}</span>
                    </button>
                  );
                })}
              </div>
              {/* Custom year range (FR-01) */}
              <div className="flex items-center gap-1.5">
                <input
                  id="year-from"
                  type="number"
                  min="1900"
                  max={new Date().getFullYear()}
                  placeholder="From"
                  value={customYearFrom}
                  onChange={(e) => setCustomYearFrom(e.target.value)}
                  onBlur={() => {
                    const range = parseCustomYearRange(customYearFrom, customYearTo);
                    if (range) setYear(range);
                  }}
                  className="w-[72px] rounded-[10px] border-2 border-gray-200 bg-white px-2 py-1.5 text-[13px] font-bold text-gray-700 outline-none focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#bae6fd]/40"
                />
                <span className="text-[13px] font-bold text-gray-400">–</span>
                <input
                  id="year-to"
                  type="number"
                  min="1900"
                  max={new Date().getFullYear()}
                  placeholder="To"
                  value={customYearTo}
                  onChange={(e) => setCustomYearTo(e.target.value)}
                  onBlur={() => {
                    const range = parseCustomYearRange(customYearFrom, customYearTo);
                    if (range) setYear(range);
                  }}
                  className="w-[72px] rounded-[10px] border-2 border-gray-200 bg-white px-2 py-1.5 text-[13px] font-bold text-gray-700 outline-none focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#bae6fd]/40"
                />
              </div>
              <div className="text-[13px] font-bold text-slate-400 drop-shadow-sm">Current: <span className="text-slate-600">{selectedYearLabel}</span></div>
            </div>

            <div className="mb-6 flex flex-col gap-3 border-b border-gray-100 pb-6">
              <h4 className="mb-0.5 text-[13px] font-extrabold uppercase tracking-wider text-gray-400">Publication Type</h4>
              <div className="flex flex-col gap-1.5">
                {[
                  { key: "articles", label: "Articles & Conferences", active: state.type === "papers", target: "papers" as SearchTypeFilter },
                  { key: "preprint", label: "Preprint", active: state.type === "preprints", target: "preprints" as SearchTypeFilter },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setType(item.active ? "all" : item.target)}
                    onMouseDown={(event) => bouncePress(event, 0.96)}
                    onMouseUp={(event) => bounceRelease(event)}
                    onMouseLeave={(event) => bounceRelease(event)}
                    className="filter-checkbox group flex w-full items-center gap-3 rounded-[12px] p-2 text-left transition-colors hover:bg-[#f8fafc]"
                  >
                    <div className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[8px] border-2 shadow-sm transition-all duration-300 group-hover:scale-110 ${item.active ? "border-[#0ea5e9] bg-[#0ea5e9]" : "border-gray-300 bg-white"}`}>
                      <Check className={`cb-icon h-4 w-4 text-white transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${item.active ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} strokeWidth={3} />
                    </div>
                    <span className={`text-[15px] transition-colors ${item.active ? "font-bold text-gray-900" : "font-bold text-gray-500 group-hover:text-gray-800"}`}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-3 border-b border-gray-100 pb-6">
              <h4 className="mb-0.5 text-[13px] font-extrabold uppercase tracking-wider text-gray-400">Top Sources</h4>
              <div className="flex flex-col gap-1.5">
                {SOURCE_OPTIONS.slice(0, 4).map((source) => {
                  const active = selectedSources.includes(source.key);
                  return (
                    <button
                      key={source.key}
                      type="button"
                      onClick={() => setSource(source.key)}
                      onMouseDown={(event) => bouncePress(event, 0.96)}
                      onMouseUp={(event) => bounceRelease(event)}
                      onMouseLeave={(event) => bounceRelease(event)}
                      className="filter-checkbox group flex w-full items-center gap-3 rounded-[12px] p-2 text-left transition-colors hover:bg-[#f8fafc]"
                    >
                      <div className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[8px] border-2 shadow-sm transition-all duration-300 group-hover:scale-110 ${active ? "border-[#0ea5e9] bg-[#0ea5e9]" : "border-gray-300 bg-white"}`}>
                        <Check className={`cb-icon h-4 w-4 text-white transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${active ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} strokeWidth={3} />
                      </div>
                      <span className={`text-[15px] transition-colors ${active ? "font-bold text-gray-900" : "font-bold text-gray-500 group-hover:text-gray-800"}`}>{source.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={toggleOpenAccess}
                onMouseDown={(event) => gsap.to(event.currentTarget, { scale: 0.96, duration: 0.15, overwrite: "auto" })}
                onMouseUp={(event) => gsap.to(event.currentTarget, { scale: 1, duration: 0.4, ease: "back.out(2)", overwrite: "auto" })}
                onMouseLeave={(event) => gsap.to(event.currentTarget, { scale: 1, duration: 0.4, overwrite: "auto" })}
                className="filter-toggle group flex w-full items-center justify-between rounded-[16px] border-2 border-transparent bg-[#f9fafb] p-3 transition-colors hover:bg-[#f3f4f6]"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors ${openAccessOnly ? "bg-[#e0f2fe] text-[#0ea5e9]" : "bg-gray-200 text-gray-500"}`}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                  </div>
                  <span className="text-[15px] font-extrabold text-gray-800">PDF Available</span>
                </div>
                <div className={`toggle-bg relative h-6 w-[44px] rounded-full p-1 transition-all duration-300 ${openAccessOnly ? "bg-[#0ea5e9] shadow-inner" : "bg-gray-300"}`}>
                  <div className={`toggle-knob absolute h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${openAccessOnly ? "translate-x-5 scale-110" : "translate-x-0"}`} />
                </div>
              </button>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={exportAllBibtex}
                disabled={results.length === 0}
                className="group flex w-full items-center justify-between rounded-[16px] border-2 border-transparent bg-[#f9fafb] p-3 text-left transition-colors hover:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#eef2ff] text-[#5b4ca5] transition-colors group-hover:bg-[#e0e7ff]">
                    <FileOutput className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-[14px] font-extrabold text-gray-800">Bulk BibTeX</span>
                    <span className="text-[11px] font-semibold text-gray-400">{results.length} results</span>
                  </div>
                </div>
              </button>
            </div>


          </div>
        </aside>
      </div>

      {/* Mobile navigation drawer */}
      <MobileNav
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        collections={collections}
        activeCollectionId={activeCollectionId}
        onSelectCollection={setActiveCollectionId}
        onDeleteCollection={removeCollection}
        canAddCollection={canAddCollection}
        onAddCollection={() => {
          const name = window.prompt("Collection name:");
          if (name?.trim()) {
            setNewCollectionName(name.trim());
            const id = `col-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
            setCollections((prev) => [...prev, { id, name: name.trim(), createdAt: new Date().toISOString() }]);
            setActiveCollectionId(id);
            setToastMessage(`Collection "${name.trim()}" created`);
          }
        }}
        savedLibrary={savedLibrary}
        suggestedConcept={suggestedConcept}
        loading={loading}
        onExploreField={submitSearch}
        savedCount={savedRows.length}
        onDeletePaper={removeSavedPaper}
      />

      {/* Mobile filters slide-over (UI-08) */}
      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-[90] flex lg:hidden"
          role="dialog"
          aria-label="Search filters"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileFiltersOpen(false)} />
          <div className="hide-scrollbar relative ml-auto flex h-full w-[85vw] max-w-[320px] flex-col overflow-y-auto bg-white px-5 py-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-gray-900">Filters</h3>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="rounded-full p-1.5 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <h4 className="mb-2 text-[12px] font-extrabold uppercase tracking-wider text-gray-400">Date Range</h4>
            <div className="mb-4 flex flex-wrap gap-2">
              {YEAR_OPTIONS.map((option) => (
                <button
                  key={option.value || "all-time"}
                  type="button"
                  onClick={() => { setYear(option.value); setMobileFiltersOpen(false); }}
                  className={`rounded-[10px] border-2 px-3 py-1.5 text-[13px] font-bold transition-all ${
                    state.year === option.value
                      ? "border-[#0ea5e9] bg-[#f0f9ff] text-[#0369a1]"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mb-5 flex items-center gap-1.5">
              <input type="number" min="1900" max={new Date().getFullYear()} placeholder="From" value={customYearFrom}
                onChange={(e) => setCustomYearFrom(e.target.value)}
                onBlur={() => { const r = parseCustomYearRange(customYearFrom, customYearTo); if (r) { setYear(r); setMobileFiltersOpen(false); } }}
                className="w-[80px] rounded-[10px] border-2 border-gray-200 px-2 py-1.5 text-[13px] font-bold text-gray-700 outline-none focus:border-[#0ea5e9]"
              />
              <span className="text-gray-400">&ndash;</span>
              <input type="number" min="1900" max={new Date().getFullYear()} placeholder="To" value={customYearTo}
                onChange={(e) => setCustomYearTo(e.target.value)}
                onBlur={() => { const r = parseCustomYearRange(customYearFrom, customYearTo); if (r) { setYear(r); setMobileFiltersOpen(false); } }}
                className="w-[80px] rounded-[10px] border-2 border-gray-200 px-2 py-1.5 text-[13px] font-bold text-gray-700 outline-none focus:border-[#0ea5e9]"
              />
            </div>
            <h4 className="mb-2 mt-4 text-[12px] font-extrabold uppercase tracking-wider text-gray-400">Type</h4>
            <div className="mb-4 flex flex-wrap gap-2">
              {TYPE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => { setType(chip.value); setMobileFiltersOpen(false); }}
                  className={`rounded-full border-2 px-4 py-2 text-[13px] font-bold transition-all ${
                    state.type === chip.value
                      ? "border-[#0ea5e9] bg-[#f0f9ff] text-[#0369a1]"
                      : "border-gray-200 bg-white text-gray-600 hover:border-[#0ea5e9]/50"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <h4 className="mb-2 text-[12px] font-extrabold uppercase tracking-wider text-gray-400">Access</h4>
            <button
              type="button"
              onClick={() => { toggleOpenAccess(); setMobileFiltersOpen(false); }}
              className="mb-5 flex w-full items-center justify-between rounded-[14px] border-2 border-transparent bg-[#f9fafb] p-3 transition-colors hover:bg-[#f3f4f6]"
            >
              <span className="text-[14px] font-bold text-gray-800">PDF Available Only</span>
              <div className={`relative h-6 w-[44px] rounded-full p-1 transition-all duration-300 ${openAccessOnly ? "bg-[#0ea5e9]" : "bg-gray-300"}`}>
                <div className={`absolute h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${openAccessOnly ? "translate-x-5" : "translate-x-0"}`} />
              </div>
            </button>
            <h4 className="mb-2 mt-4 text-[12px] font-extrabold uppercase tracking-wider text-gray-400">Sort By</h4>
            <div className="mb-4 flex flex-wrap gap-2">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => { setSort(option.key); setMobileFiltersOpen(false); }}
                  className={`rounded-full border-2 px-4 py-2 text-[13px] font-bold transition-all ${
                    state.sort === option.key
                      ? "border-[#0ea5e9] bg-[#f0f9ff] text-[#0369a1]"
                      : "border-gray-200 bg-white text-gray-600 hover:border-[#0ea5e9]/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <h4 className="mb-2 text-[12px] font-extrabold uppercase tracking-wider text-gray-400">Sources</h4>
            <div className="mb-5 flex flex-col gap-1.5">
              {SOURCE_OPTIONS.map((src) => {
                const active = selectedSources.includes(src.key);
                return (
                  <button key={src.key} type="button" onClick={() => setSource(src.key)}
                    className="flex items-center gap-3 rounded-[10px] p-2 text-left hover:bg-gray-50"
                  >
                    <div className={`flex h-[20px] w-[20px] items-center justify-center rounded-[6px] border-2 ${active ? "border-[#0ea5e9] bg-[#0ea5e9]" : "border-gray-300 bg-white"}`}>
                      <Check className={`h-3 w-3 text-white transition-transform ${active ? "scale-100" : "scale-0"}`} strokeWidth={3} />
                    </div>
                    <span className={`text-[14px] ${active ? "font-bold text-gray-900" : "font-medium text-gray-500"}`}>{src.label}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => { clearAllFilters(); setMobileFiltersOpen(false); }}
              className="w-full rounded-[10px] border border-gray-200 py-2.5 text-[13px] font-bold text-gray-500 hover:bg-gray-50">
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {showShortcutHint && (
        <button
          type="button"
          onClick={() => {
            setShowShortcutHint(false);
            window.localStorage.setItem(SHORTCUT_HINT_KEY, "1");
            setShortcutsOpen(true);
          }}
          className="fixed bottom-5 right-5 z-40 rounded-full border border-[#E1E1E1] bg-white px-3 py-1.5 text-[11px] font-medium text-[#454441] shadow-sm hover:bg-[#F1F1EF]"
        >
          ? for shortcuts
        </button>
      )}

      {shortcutsOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/25 p-4" onClick={() => setShortcutsOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-[#E1E1E1] bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[#0F0F0F]">Keyboard shortcuts</h3>
              <button type="button" onClick={() => setShortcutsOpen(false)} className="rounded p-1 hover:bg-[#F1F1EF]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2 text-[12px] text-[#5f5e5a]">
              <li><span className="font-mono text-[#0F0F0F]">J / K</span> move selection</li>
              <li><span className="font-mono text-[#0F0F0F]">Enter</span> expand/collapse abstract</li>
              <li><span className="font-mono text-[#0F0F0F]">O</span> open selected paper</li>
              <li><span className="font-mono text-[#0F0F0F]">C</span> open citation menu</li>
              <li><span className="font-mono text-[#0F0F0F]">/</span> focus search</li>
              <li><span className="font-mono text-[#0F0F0F]">?</span> toggle this help</li>
            </ul>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="pointer-events-none fixed bottom-20 md:bottom-8 left-1/2 z-50 -translate-x-1/2" ref={toastRef}>
          {/* Toast design with layered shadows [visual-layered-shadows] */}
          <div className="flex items-center gap-3 rounded-[16px] bg-[#111] px-5 py-3 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.25),0_16px_40px_rgba(0,0,0,0.18),0_0_0_1px_rgba(255,255,255,0.06)_inset]">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#00a843] shadow-[0_2px_6px_rgba(0,168,67,0.4)]">
              <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
            </div>
            {toastMessage}
          </div>
        </div>
      )}

      {selectedPaper && <div className="sr-only">Selected paper: {selectedPaper.title}</div>}
    </div>
  );
};

export default SearchPage;
