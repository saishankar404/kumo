import type { SetURLSearchParams } from "react-router-dom";

export type SearchTypeFilter = "all" | "papers" | "preprints" | "reviews" | "datasets";
export type SearchSort = "relevance" | "recent" | "cited" | "oa";
export type QueryMode = "doi" | "arxiv" | "author" | "title" | "keyword";

export type SourceKey = "openalex" | "arxiv" | "biorxiv-medrxiv" | "pmc-europepmc" | "semantic-scholar" | "core" | "zenodo";

export interface SearchState {
  q: string;
  type: SearchTypeFilter;
  sort: SearchSort;
  year: string;
  filter: string;
  source: string;
  page: number;
}

export interface SearchSuggestion {
  id: string;
  label: string;
  sublabel: string;
  kind: "paper" | "author" | "concept";
}

export interface CitationPayload {
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  url?: string;
}

export interface PdfOption {
  label: string;
  url: string;
  source: string;
  preferred?: boolean;
}

export interface NormalizedPaperResult {
  id: string;
  title: string;
  normalizedTitle: string;
  authors: string[];
  year?: number;
  venue?: string;
  abstract: string;
  doi?: string;
  citations?: number;
  type: Exclude<SearchTypeFilter, "all">;
  sourceKeys: SourceKey[];
  sourceLabel: string;
  foundIn: string[];
  pdfAvailable: boolean;
  pdfUrl?: string;
  pdfOptions: PdfOption[];
  oaStatus: "open" | "closed" | "unknown";
  landingUrl?: string;
  relevanceScore: number;
  openAlexId?: string;
  /** High-confidence OpenAlex concept/topic names for this paper (max 5) */
  concepts: string[];
}

export interface SearchProgress {
  key: SourceKey;
  loading: boolean;
  error?: string;
  count?: number;
}

export interface SearchResultBundle {
  mode: QueryMode;
  results: NormalizedPaperResult[];
  progress: SearchProgress[];
  overallMs?: number;
  firstResultMs?: number;
  partialFailure: boolean;
  fullFailure: boolean;
}

interface OpenAlexAuthor {
  display_name?: string;
}

interface OpenAlexAuthorship {
  author?: OpenAlexAuthor;
}

interface OpenAlexSource {
  display_name?: string;
  is_in_doaj?: boolean;
}

interface OpenAlexLocation {
  source?: OpenAlexSource;
  pdf_url?: string;
  landing_page_url?: string;
}

interface OpenAlexWork {
  id?: string;
  doi?: string;
  display_name?: string;
  abstract_inverted_index?: Record<string, number[]>;
  abstract?: string;
  authorships?: OpenAlexAuthorship[];
  publication_year?: number;
  primary_location?: OpenAlexLocation;
  host_venue?: OpenAlexSource;
  cited_by_count?: number;
  type?: string;
  best_oa_location?: OpenAlexLocation;
  open_access?: { is_oa?: boolean };
  relevance_score?: number;
  topics?: { display_name?: string; score?: number }[];
  concepts?: { display_name?: string; score?: number }[];
}

interface EuropePmcFullText {
  documentStyle?: string;
  url?: string;
}

interface EuropePmcResult {
  id?: string;
  journalTitle?: string;
  title?: string;
  authorString?: string;
  pubYear?: string;
  doi?: string;
  fullTextUrlList?: { fullTextUrl?: EuropePmcFullText[] };
  source?: string;
  abstractText?: string;
  citedByCount?: string;
}

interface OpenAlexAutocompleteEntry {
  id?: string;
  display_name?: string;
}

interface OpenAlexAutocompleteResponse {
  results?: OpenAlexAutocompleteEntry[];
}

interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  abstract?: string;
  year?: number;
  venue?: string;
  citationCount?: number;
  openAccessPdf?: { url?: string };
  externalIds?: { DOI?: string; ArXiv?: string };
  authors?: { name?: string }[];
  url?: string;
}

interface SemanticScholarSearchResponse {
  data?: SemanticScholarPaper[];
}

interface CoreAuthor {
  name?: string;
}

interface CoreResult {
  id?: string | number;
  title?: string;
  abstract?: string;
  yearPublished?: number;
  doi?: string;
  downloadUrl?: string;
  sourceFulltextUrls?: string[];
  fullTextIdentifier?: string[];
  authors?: CoreAuthor[];
  publisher?: string;
}

interface CoreResponse {
  results?: CoreResult[];
}

interface ZenodoCreator {
  name?: string;
}

interface ZenodoRecord {
  id?: string | number;
  created?: string;
  metadata?: {
    title?: string;
    description?: string;
    publication_date?: string;
    doi?: string;
    creators?: ZenodoCreator[];
    journal_title?: string;
  };
  links?: {
    self_html?: string;
    doi?: string;
    latest_html?: string;
  };
}

interface ZenodoResponse {
  hits?: {
    hits?: ZenodoRecord[];
  };
}

interface SourceAdapter {
  key: SourceKey;
  label: string;
  search: (ctx: SourceSearchContext) => Promise<NormalizedPaperResult[]>;
}

interface SourceSearchContext {
  state: SearchState;
  normalizedQuery: string;
  mode: QueryMode;
  signal: AbortSignal;
}

const DOI_RE = /^10\.\d{4,}\/\S+$/i;
const ARXIV_RE = /^\d{4}\.\d{4,5}(v\d+)?$/i;
const AUTHOR_PREFIX = /^author\s*:/i;

const SOURCE_LABELS: Record<SourceKey, string> = {
  openalex: "OpenAlex",
  arxiv: "arXiv",
  "biorxiv-medrxiv": "bioRxiv/medRxiv",
  "pmc-europepmc": "PMC/EuropePMC",
  "semantic-scholar": "Semantic Scholar",
  core: "CORE",
  zenodo: "Zenodo",
};

const ALL_SOURCES: SourceKey[] = ["openalex", "arxiv", "biorxiv-medrxiv", "pmc-europepmc", "semantic-scholar", "core", "zenodo"];

const DEFAULT_STATE: SearchState = {
  q: "",
  type: "all",
  sort: "relevance",
  year: "",
  filter: "",
  source: "",
  page: 1,
};

function mapPage(value: string | null | undefined): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function mapType(value: string | null | undefined): SearchTypeFilter {
  const input = (value || "").toLowerCase();
  if (input === "papers" || input === "preprints" || input === "reviews" || input === "datasets") return input;
  return "all";
}

function mapSort(value: string | null | undefined): SearchSort {
  const input = (value || "").toLowerCase();
  if (input === "recent" || input === "cited" || input === "oa") return input;
  return "relevance";
}

export function parseSearchState(params: URLSearchParams): SearchState {
  return {
    q: params.get("q")?.trim() || DEFAULT_STATE.q,
    type: mapType(params.get("type")),
    sort: mapSort(params.get("sort")),
    year: params.get("year")?.trim() || DEFAULT_STATE.year,
    filter: params.get("filter")?.trim() || DEFAULT_STATE.filter,
    source: params.get("source")?.trim() || DEFAULT_STATE.source,
    page: mapPage(params.get("page")),
  };
}

export function serializeSearchState(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.type !== "all") params.set("type", state.type);
  if (state.sort !== "relevance") params.set("sort", state.sort);
  if (state.year.trim()) params.set("year", state.year.trim());
  if (state.filter.trim()) params.set("filter", state.filter.trim());
  if (state.source.trim()) params.set("source", state.source.trim());
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export function commitSearchState(state: SearchState, setSearchParams: SetURLSearchParams, push = true) {
  setSearchParams(serializeSearchState(state), { replace: !push });
}

export function preprocessQuery(raw: string): string {
  return raw
    .trim()
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ");
}

export function classifyQuery(query: string): QueryMode {
  const q = preprocessQuery(query);
  if (!q) return "keyword";
  if (DOI_RE.test(q)) return "doi";
  if (ARXIV_RE.test(q)) return "arxiv";
  if (AUTHOR_PREFIX.test(q)) return "author";

  const wordCount = q.split(/\s+/).filter(Boolean).length;
  const looksLikeTitle = wordCount > 6 && /^[\w\s.,:;()'"-]+$/.test(q);
  return looksLikeTitle ? "title" : "keyword";
}

export function isOpenAccessOnly(state: SearchState): boolean {
  return state.filter.split(",").map((v) => v.trim()).includes("oa");
}

export function getActiveSources(state: SearchState): SourceKey[] {
  if (!state.source) return ALL_SOURCES;
  const requested = state.source
    .split(",")
    .map((value) => value.trim() as SourceKey)
    .filter((value) => ALL_SOURCES.includes(value));
  return requested.length > 0 ? requested : ALL_SOURCES;
}

export function getYearRange(state: SearchState): { from?: number; to?: number } {
  const input = state.year.trim();
  if (!input) return {};
  const [fromRaw, toRaw] = input.split("-");
  const from = Number.parseInt(fromRaw, 10);
  const to = Number.parseInt(toRaw, 10);

  if (Number.isNaN(from) && Number.isNaN(to)) return {};
  if (!Number.isNaN(from) && !Number.isNaN(to)) return { from: Math.min(from, to), to: Math.max(from, to) };
  if (!Number.isNaN(from)) return { from };
  return { to };
}

function normalizeDoi(value?: string): string | undefined {
  if (!value) return undefined;
  const clean = value.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").trim();
  return clean || undefined;
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function titleSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const bigrams = (text: string) => {
    const out = new Set<string>();
    for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
    return out;
  };

  const a2 = bigrams(a);
  const b2 = bigrams(b);
  let overlap = 0;
  a2.forEach((item) => {
    if (b2.has(item)) overlap += 1;
  });

  return (2 * overlap) / (a2.size + b2.size || 1);
}

function typeFromOpenAlex(rawType?: string): Exclude<SearchTypeFilter, "all"> {
  const value = (rawType || "").toLowerCase();
  if (value.includes("review")) return "reviews";
  if (value.includes("dataset")) return "datasets";
  if (value.includes("preprint")) return "preprints";
  return "papers";
}

function textFromAbstractInvertedIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words = Object.entries(index).flatMap(([word, positions]) => positions.map((position) => ({ position, word })));
  words.sort((a, b) => a.position - b.position);
  return words.map((item) => item.word).join(" ");
}

function splitAbstractSnippet(value: string): string {
  if (!value) return "";
  const cleaned = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^abstract[:\s-]*/i, "");
  const sentences = cleaned
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return sentences.slice(0, 3).join(" ");
}

function applyClientFilters(state: SearchState, rows: NormalizedPaperResult[]): NormalizedPaperResult[] {
  const { from, to } = getYearRange(state);
  const openOnly = isOpenAccessOnly(state);
  const activeSources = new Set(getActiveSources(state));

  return rows.filter((row) => {
    if (state.type !== "all" && row.type !== state.type) return false;
    if (openOnly && !row.pdfAvailable) return false;
    if (from && row.year && row.year < from) return false;
    if (to && row.year && row.year > to) return false;
    if (!row.sourceKeys.some((key) => activeSources.has(key))) return false;
    return true;
  });
}

function sortRows(state: SearchState, rows: NormalizedPaperResult[]): NormalizedPaperResult[] {
  const copy = [...rows];
  switch (state.sort) {
    case "recent":
      copy.sort((a, b) => (b.year || 0) - (a.year || 0));
      return copy;
    case "cited":
      copy.sort((a, b) => (b.citations || 0) - (a.citations || 0));
      return copy;
    case "oa":
      copy.sort((a, b) => Number(b.pdfAvailable) - Number(a.pdfAvailable) || (b.citations || 0) - (a.citations || 0));
      return copy;
    default:
      copy.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
      return copy;
  }
}

function mergeRows(incoming: NormalizedPaperResult[]): NormalizedPaperResult[] {
  const merged: NormalizedPaperResult[] = [];

  const doiIndex = new Map<string, number>();

  for (const row of incoming) {
    const doiKey = normalizeDoi(row.doi);

    if (doiKey && doiIndex.has(doiKey)) {
      const idx = doiIndex.get(doiKey)!;
      merged[idx] = mergeRecord(merged[idx], row);
      continue;
    }

    let fuzzyIndex = -1;
    for (let i = 0; i < merged.length; i += 1) {
      const candidate = merged[i];
      if (candidate.doi || row.doi) continue;
      if ((candidate.type === "preprints") !== (row.type === "preprints")) continue;
      const score = titleSimilarity(candidate.normalizedTitle, row.normalizedTitle);
      if (score >= 0.92) {
        fuzzyIndex = i;
        break;
      }
    }

    if (fuzzyIndex >= 0) {
      merged[fuzzyIndex] = mergeRecord(merged[fuzzyIndex], row);
      continue;
    }

    const idx = merged.push(row) - 1;
    if (doiKey) doiIndex.set(doiKey, idx);
  }

  return merged;
}

function mergeRecord(base: NormalizedPaperResult, next: NormalizedPaperResult): NormalizedPaperResult {
  const pdfOptionsMap = new Map<string, PdfOption>();
  [...base.pdfOptions, ...next.pdfOptions].forEach((option) => {
    if (!pdfOptionsMap.has(option.url)) pdfOptionsMap.set(option.url, option);
  });

  const mergedPdfOptions = Array.from(pdfOptionsMap.values());
  const preferredPdf = mergedPdfOptions.find((option) => option.preferred) || mergedPdfOptions[0];
  const citationValues = [base.citations, next.citations].filter((value): value is number => typeof value === "number");
  // Merge concept lists, dedup, keep top 5
  const mergedConcepts = Array.from(new Set([...base.concepts, ...next.concepts])).slice(0, 5);

  return {
    ...base,
    title: base.title.length >= next.title.length ? base.title : next.title,
    authors: base.authors.length >= next.authors.length ? base.authors : next.authors,
    year: base.year || next.year,
    venue: base.venue || next.venue,
    abstract: base.abstract.length >= next.abstract.length ? base.abstract : next.abstract,
    doi: base.doi || next.doi,
    citations: citationValues.length > 0 ? Math.max(...citationValues) : undefined,
    type: base.type,
    sourceKeys: Array.from(new Set([...base.sourceKeys, ...next.sourceKeys])),
    foundIn: Array.from(new Set([...base.foundIn, ...next.foundIn])),
    pdfAvailable: mergedPdfOptions.length > 0,
    pdfUrl: preferredPdf?.url,
    pdfOptions: mergedPdfOptions,
    oaStatus: base.oaStatus === "open" || next.oaStatus === "open" ? "open" : base.oaStatus,
    landingUrl: base.landingUrl || next.landingUrl,
    relevanceScore: Math.max(base.relevanceScore, next.relevanceScore),
    openAlexId: base.openAlexId || next.openAlexId,
    concepts: mergedConcepts,
  };
}

async function withTimeout<T>(promiseFactory: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parentSignal: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  parentSignal.addEventListener("abort", onAbort);

  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", onAbort);
  }
}

function mapOpenAlexWork(item: OpenAlexWork, source: SourceKey): NormalizedPaperResult {
  const doi = normalizeDoi(item.doi);
  const abstractText = textFromAbstractInvertedIndex(item.abstract_inverted_index);
  const snippet = splitAbstractSnippet(abstractText || item.abstract || "");

  const pdfOptions: PdfOption[] = [];
  const best = item.best_oa_location;

  if (best?.pdf_url) {
    pdfOptions.push({
      label: "Open PDF",
      url: best.pdf_url,
      source: SOURCE_LABELS[source],
      preferred: Boolean(best.source?.is_in_doaj),
    });
  }

  if (best?.landing_page_url && !best?.pdf_url && item.open_access?.is_oa) {
    pdfOptions.push({
      label: "Open location",
      url: best.landing_page_url,
      source: SOURCE_LABELS[source],
    });
  }

  // Collect high-confidence concept/topic names (score >= 0.3, max 5)
  const CONCEPT_SCORE_THRESHOLD = 0.3;
  const rawTopics = (item.topics || []);
  const rawConcepts = (item.concepts || []);
  const conceptSource = rawTopics.length > 0 ? rawTopics : rawConcepts;
  const concepts = conceptSource
    .filter((c) => (c.score ?? 1) >= CONCEPT_SCORE_THRESHOLD && c.display_name)
    .slice(0, 5)
    .map((c) => c.display_name as string);

  return {
    id: item.id || `${source}-${item.display_name}`,
    title: item.display_name || "Untitled",
    normalizedTitle: normalizeTitle(item.display_name || "Untitled"),
    authors: (item.authorships || []).map((entry) => entry?.author?.display_name).filter(Boolean) as string[],
    year: item.publication_year,
    venue: item.primary_location?.source?.display_name || item.host_venue?.display_name,
    abstract: snippet,
    doi,
    citations: item.cited_by_count,
    type: typeFromOpenAlex(item.type),
    sourceKeys: [source],
    sourceLabel: SOURCE_LABELS[source],
    foundIn: [SOURCE_LABELS[source]],
    pdfAvailable: pdfOptions.length > 0,
    pdfUrl: pdfOptions[0]?.url,
    pdfOptions,
    oaStatus: item.open_access?.is_oa ? "open" : "closed",
    landingUrl: item.primary_location?.landing_page_url || item.id,
    relevanceScore: item.relevance_score || item.cited_by_count || 0,
    openAlexId: item.id?.includes("openalex.org/") ? item.id : undefined,
    concepts,
  };
}

async function resolveUnpaywall(doi: string, signal: AbortSignal): Promise<PdfOption | null> {
  try {
    const response = await fetch(`/api/unpaywall?doi=${encodeURIComponent(doi)}`, { signal });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || payload.oa_status === "closed") return null;

    const pdfUrl = payload.best_oa_location?.url_for_pdf || payload.best_oa_location?.url;
    if (!pdfUrl) return null;

    return {
      label: "Open PDF",
      url: pdfUrl,
      source: "Unpaywall",
      preferred: true,
    };
  } catch {
    return null;
  }
}

async function fetchOpenAlex<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const activeSignal = signal || new AbortController().signal;
    let response = await fetch(`/api/openalex?url=${encodeURIComponent(url)}`, { signal: activeSignal });
    if (!response.ok) {
      response = await fetch(url, { signal: activeSignal });
      if (!response.ok) return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const openAlexAdapter: SourceAdapter = {
  key: "openalex",
  label: SOURCE_LABELS.openalex,
  async search(ctx) {
    const query = preprocessQuery(ctx.normalizedQuery);

    if (!query) return [];

    if (ctx.mode === "doi") {
      const doi = normalizeDoi(query);
      if (!doi) return [];
      const endpoint = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`;
      const item = await fetchOpenAlex<OpenAlexWork>(endpoint, ctx.signal);
      if (!item) return [];
      const row = mapOpenAlexWork(item, "openalex");

      const unpaywall = row.doi ? await resolveUnpaywall(row.doi, ctx.signal) : null;
      if (unpaywall && !row.pdfOptions.some((option) => option.url === unpaywall.url)) {
        row.pdfOptions.unshift(unpaywall);
        row.pdfAvailable = true;
        row.pdfUrl = unpaywall.url;
        row.oaStatus = "open";
      }

      return [row];
    }

    let endpoint = `https://api.openalex.org/works?per-page=25&search=${encodeURIComponent(query)}`;

    const filters: string[] = [];

    if (ctx.mode === "author") {
      const authorQuery = query.replace(AUTHOR_PREFIX, "").trim();
      endpoint = `https://api.openalex.org/works?per-page=25&search=${encodeURIComponent(authorQuery)}`;
      if (authorQuery) {
        filters.push(`authorships.author.display_name.search:${authorQuery}`);
      }
    }

    if (ctx.state.type === "preprints") filters.push("type:preprint");
    if (ctx.state.type === "reviews") filters.push("type:review");
    if (ctx.state.type === "datasets") filters.push("type:dataset");

    const years = getYearRange(ctx.state);
    if (years.from) filters.push(`from_publication_date:${years.from}-01-01`);
    if (years.to) filters.push(`to_publication_date:${years.to}-12-31`);

    if (filters.length > 0) {
      endpoint += `&filter=${encodeURIComponent(filters.join(","))}`;
    }

    const payload = await fetchOpenAlex<{ results?: OpenAlexWork[] }>(endpoint, ctx.signal);
    if (!payload) return [];
    const rows = (payload?.results || []).map((item) => mapOpenAlexWork(item, "openalex"));

    await Promise.all(
      rows.map(async (row) => {
        if (!row.doi || row.pdfAvailable) return;
        const option = await resolveUnpaywall(row.doi, ctx.signal);
        if (!option) return;

        row.pdfOptions.unshift(option);
        row.pdfAvailable = true;
        row.pdfUrl = option.url;
        row.oaStatus = "open";
      })
    );

    return rows;
  },
};

function mapArxivType(value: string): Exclude<SearchTypeFilter, "all"> {
  if (value.toLowerCase().includes("review")) return "reviews";
  return "preprints";
}

const arxivAdapter: SourceAdapter = {
  key: "arxiv",
  label: SOURCE_LABELS.arxiv,
  async search(ctx) {
    const query = preprocessQuery(ctx.normalizedQuery);
    if (!query) return [];

    const upstream =
      ctx.mode === "arxiv"
        ? `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(query)}`
        : `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=15`;

    let response = await fetch(`/api/arxiv?url=${encodeURIComponent(upstream)}`, { signal: ctx.signal });
    if (!response.ok) {
      // Fallback for environments without local API handler
      response = await fetch(upstream, { signal: ctx.signal });
      if (!response.ok) return [];
    }

    const xml = await response.text();
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const entries = Array.from(doc.querySelectorAll("entry"));

    return entries.map((entry, index) => {
      const title = (entry.querySelector("title")?.textContent || "Untitled").replace(/\s+/g, " ").trim();
      const summary = (entry.querySelector("summary")?.textContent || "").replace(/\s+/g, " ").trim();
      const published = entry.querySelector("published")?.textContent || "";
      const year = Number.parseInt(published.slice(0, 4), 10);
      const id = entry.querySelector("id")?.textContent?.trim() || `arxiv-${index}-${title}`;
      const authors = Array.from(entry.querySelectorAll("author > name")).map((node) => node.textContent || "").filter(Boolean);
      const pdfLink = Array.from(entry.querySelectorAll("link")).find((link) => link.getAttribute("title") === "pdf")?.getAttribute("href");
      const landing = Array.from(entry.querySelectorAll("link")).find((link) => link.getAttribute("rel") === "alternate")?.getAttribute("href");

      const pdfOptions = pdfLink
        ? [
            {
              label: "Open PDF",
              url: pdfLink,
              source: SOURCE_LABELS.arxiv,
              preferred: true,
            },
          ]
        : [];

      return {
        id,
        title,
        normalizedTitle: normalizeTitle(title),
        authors,
        year: Number.isNaN(year) ? undefined : year,
        venue: "arXiv",
        abstract: splitAbstractSnippet(summary),
        doi: undefined,
        citations: undefined,
        type: mapArxivType(title),
        sourceKeys: ["arxiv"],
        sourceLabel: SOURCE_LABELS.arxiv,
        foundIn: [SOURCE_LABELS.arxiv],
        pdfAvailable: pdfOptions.length > 0,
        pdfUrl: pdfOptions[0]?.url,
        pdfOptions,
        oaStatus: pdfOptions.length > 0 ? "open" : "unknown",
        landingUrl: landing || id,
        relevanceScore: entries.length - index,
        concepts: [],
      } as NormalizedPaperResult;
    });
  },
};

const biorxivAdapter: SourceAdapter = {
  key: "biorxiv-medrxiv",
  label: SOURCE_LABELS["biorxiv-medrxiv"],
  async search(ctx) {
    const query = preprocessQuery(ctx.normalizedQuery);
    if (!query || ctx.mode === "doi" || ctx.mode === "arxiv") return [];

    const endpoint = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&pageSize=20&resultType=core&query=${encodeURIComponent(`${query} SRC:PPR`)}`;
    const response = await fetch(endpoint, { signal: ctx.signal });
    if (!response.ok) return [];

    const payload = (await response.json()) as { resultList?: { result?: EuropePmcResult[] } };
    const rows = payload?.resultList?.result || [];

    return rows.map((item, index: number) => {
      const sourceName = (item.journalTitle || "").toLowerCase().includes("medrxiv") ? "medRxiv" : "bioRxiv";
      const title = item.title || "Untitled";
      const authors = item.authorString ? item.authorString.split(",").map((text: string) => text.trim()).filter(Boolean) : [];
      const year = Number.parseInt(item.pubYear || "", 10);
      const doi = normalizeDoi(item.doi);
      const pdfUrl = item.fullTextUrlList?.fullTextUrl?.find((entry) => /pdf/i.test(entry.documentStyle || ""))?.url;
      const landingUrl = item.source || (doi ? `https://doi.org/${doi}` : undefined);

      return {
        id: item.id || `europepmc-${index}`,
        title,
        normalizedTitle: normalizeTitle(title),
        authors,
        year: Number.isNaN(year) ? undefined : year,
        venue: sourceName,
        abstract: splitAbstractSnippet(item.abstractText || ""),
        doi,
        citations: (() => {
          const value = Number.parseInt(item.citedByCount || "", 10);
          return Number.isFinite(value) && value > 0 ? value : undefined;
        })(),
        type: "preprints",
        sourceKeys: ["biorxiv-medrxiv"],
        sourceLabel: SOURCE_LABELS["biorxiv-medrxiv"],
        foundIn: [SOURCE_LABELS["biorxiv-medrxiv"]],
        pdfAvailable: Boolean(pdfUrl),
        pdfUrl,
        pdfOptions: pdfUrl
          ? [
              {
                label: "Open PDF",
                url: pdfUrl,
                source: SOURCE_LABELS["biorxiv-medrxiv"],
              },
            ]
          : [],
        oaStatus: pdfUrl ? "open" : "unknown",
        landingUrl,
        relevanceScore: rows.length - index,
        concepts: [],
      } as NormalizedPaperResult;
    });
  },
};

const pmcAdapter: SourceAdapter = {
  key: "pmc-europepmc",
  label: SOURCE_LABELS["pmc-europepmc"],
  async search(ctx) {
    const query = preprocessQuery(ctx.normalizedQuery);
    if (!query) return [];

    const endpoint = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&pageSize=20&resultType=core&query=${encodeURIComponent(`${query} SRC:PMC OPEN_ACCESS:y`)}`;
    const response = await fetch(endpoint, { signal: ctx.signal });
    if (!response.ok) return [];

    const payload = (await response.json()) as { resultList?: { result?: EuropePmcResult[] } };
    const rows = payload?.resultList?.result || [];

    return rows.map((item, index: number) => {
      const title = item.title || "Untitled";
      const authors = item.authorString ? item.authorString.split(",").map((text: string) => text.trim()).filter(Boolean) : [];
      const year = Number.parseInt(item.pubYear || "", 10);
      const doi = normalizeDoi(item.doi);
      const pdfUrl = item.fullTextUrlList?.fullTextUrl?.find((entry) => /pdf/i.test(entry.documentStyle || ""))?.url;
      const landingUrl = doi ? `https://doi.org/${doi}` : item.id ? `https://europepmc.org/article/PMC/${item.id}` : undefined;

      return {
        id: `pmc-${item.id || index}`,
        title,
        normalizedTitle: normalizeTitle(title),
        authors,
        year: Number.isNaN(year) ? undefined : year,
        venue: item.journalTitle || "PubMed Central",
        abstract: splitAbstractSnippet(item.abstractText || ""),
        doi,
        citations: (() => {
          const value = Number.parseInt(item.citedByCount || "", 10);
          return Number.isFinite(value) && value > 0 ? value : undefined;
        })(),
        type: "papers",
        sourceKeys: ["pmc-europepmc"],
        sourceLabel: SOURCE_LABELS["pmc-europepmc"],
        foundIn: [SOURCE_LABELS["pmc-europepmc"]],
        pdfAvailable: Boolean(pdfUrl),
        pdfUrl,
        pdfOptions: pdfUrl
          ? [
              {
                label: "Open PDF",
                url: pdfUrl,
                source: SOURCE_LABELS["pmc-europepmc"],
              },
            ]
          : [],
        oaStatus: pdfUrl ? "open" : "unknown",
        landingUrl,
        relevanceScore: rows.length - index,
        concepts: [],
      } as NormalizedPaperResult;
    });
  },
};

const semanticScholarAdapter: SourceAdapter = {
  key: "semantic-scholar",
  label: SOURCE_LABELS["semantic-scholar"],
  async search(ctx) {
    const query = preprocessQuery(ctx.normalizedQuery);
    if (!query) return [];

    const response = await fetch(`/api/semantic-scholar?query=${encodeURIComponent(query)}`, { signal: ctx.signal });
    if (!response.ok) return [];
    const payload = (await response.json()) as SemanticScholarSearchResponse;
    const rows = payload.data || [];

    return rows.map((item, index) => {
      const title = item.title || "Untitled";
      const doi = normalizeDoi(item.externalIds?.DOI);
      const authors = (item.authors || []).map((author) => author.name).filter(Boolean) as string[];
      const pdfUrl = item.openAccessPdf?.url;
      return {
        id: `semantic-${item.paperId || index}`,
        title,
        normalizedTitle: normalizeTitle(title),
        authors,
        year: item.year,
        venue: item.venue || "Semantic Scholar",
        abstract: splitAbstractSnippet(item.abstract || ""),
        doi,
        citations: typeof item.citationCount === "number" && item.citationCount > 0 ? item.citationCount : undefined,
        type: "papers",
        sourceKeys: ["semantic-scholar"],
        sourceLabel: SOURCE_LABELS["semantic-scholar"],
        foundIn: [SOURCE_LABELS["semantic-scholar"]],
        pdfAvailable: Boolean(pdfUrl),
        pdfUrl,
        pdfOptions: pdfUrl
          ? [
              {
                label: "Open PDF",
                url: pdfUrl,
                source: SOURCE_LABELS["semantic-scholar"],
              },
            ]
          : [],
        oaStatus: pdfUrl ? "open" : "unknown",
        landingUrl: item.url || (doi ? `https://doi.org/${doi}` : undefined),
        relevanceScore: rows.length - index,
        concepts: [],
      } as NormalizedPaperResult;
    });
  },
};

const coreAdapter: SourceAdapter = {
  key: "core",
  label: SOURCE_LABELS.core,
  async search(ctx) {
    const query = preprocessQuery(ctx.normalizedQuery);
    if (!query) return [];

    const response = await fetch(`/api/core?query=${encodeURIComponent(query)}`, { signal: ctx.signal });
    if (!response.ok) return [];
    const payload = (await response.json()) as CoreResponse;
    const rows = payload.results || [];

    return rows.slice(0, 20).map((item, index) => {
      const title = item.title || "Untitled";
      const doi = normalizeDoi(item.doi);
      const authors = (item.authors || []).map((author) => author.name).filter(Boolean) as string[];
      const pdfUrl =
        item.downloadUrl ||
        item.sourceFulltextUrls?.find((url) => /\.pdf($|\?)/i.test(url)) ||
        item.fullTextIdentifier?.find((url) => /^https?:\/\//i.test(url) && /\.pdf($|\?)/i.test(url));
      const landingUrl = doi ? `https://doi.org/${doi}` : item.sourceFulltextUrls?.[0];

      return {
        id: `core-${item.id || index}`,
        title,
        normalizedTitle: normalizeTitle(title),
        authors,
        year: item.yearPublished,
        venue: item.publisher || "CORE",
        abstract: splitAbstractSnippet(item.abstract || ""),
        doi,
        citations: undefined,
        type: "papers",
        sourceKeys: ["core"],
        sourceLabel: SOURCE_LABELS.core,
        foundIn: [SOURCE_LABELS.core],
        pdfAvailable: Boolean(pdfUrl),
        pdfUrl,
        pdfOptions: pdfUrl
          ? [
              {
                label: "Open PDF",
                url: pdfUrl,
                source: SOURCE_LABELS.core,
              },
            ]
          : [],
        oaStatus: pdfUrl ? "open" : "unknown",
        landingUrl,
        relevanceScore: rows.length - index,
        concepts: [],
      } as NormalizedPaperResult;
    });
  },
};

const zenodoAdapter: SourceAdapter = {
  key: "zenodo",
  label: SOURCE_LABELS.zenodo,
  async search(ctx) {
    const query = preprocessQuery(ctx.normalizedQuery);
    if (!query) return [];

    const response = await fetch(`/api/zenodo?query=${encodeURIComponent(query)}`, { signal: ctx.signal });
    if (!response.ok) return [];
    const payload = (await response.json()) as ZenodoResponse;
    const rows = payload.hits?.hits || [];

    return rows.slice(0, 20).map((item, index) => {
      const title = item.metadata?.title || "Untitled";
      const abstract = item.metadata?.description || "";
      const year = Number.parseInt((item.metadata?.publication_date || item.created || "").slice(0, 4), 10);
      const doi = normalizeDoi(item.metadata?.doi || item.links?.doi);
      const authors = (item.metadata?.creators || []).map((creator) => creator.name).filter(Boolean) as string[];
      const landingUrl = item.links?.latest_html || item.links?.self_html || (doi ? `https://doi.org/${doi}` : undefined);

      return {
        id: `zenodo-${item.id || index}`,
        title,
        normalizedTitle: normalizeTitle(title),
        authors,
        year: Number.isNaN(year) ? undefined : year,
        venue: item.metadata?.journal_title || "Zenodo",
        abstract: splitAbstractSnippet(abstract),
        doi,
        citations: undefined,
        type: "datasets",
        sourceKeys: ["zenodo"],
        sourceLabel: SOURCE_LABELS.zenodo,
        foundIn: [SOURCE_LABELS.zenodo],
        pdfAvailable: false,
        pdfUrl: undefined,
        pdfOptions: [],
        oaStatus: "unknown",
        landingUrl,
        relevanceScore: rows.length - index,
        concepts: [],
      } as NormalizedPaperResult;
    });
  },
};

const ADAPTERS: Record<SourceKey, SourceAdapter> = {
  openalex: openAlexAdapter,
  arxiv: arxivAdapter,
  "biorxiv-medrxiv": biorxivAdapter,
  "pmc-europepmc": pmcAdapter,
  "semantic-scholar": semanticScholarAdapter,
  core: coreAdapter,
  zenodo: zenodoAdapter,
};

export interface RunSearchOptions {
  state: SearchState;
  onUpdate: (bundle: SearchResultBundle) => void;
  signal: AbortSignal;
}

export async function runSearch(options: RunSearchOptions): Promise<void> {
  const normalizedQuery = preprocessQuery(options.state.q);
  const mode = classifyQuery(normalizedQuery);
  const active = getActiveSources(options.state);
  const searchStart = performance.now();

  if (!normalizedQuery) {
    options.onUpdate({
      mode,
      results: [],
      progress: active.map((key) => ({ key, loading: false })),
      overallMs: undefined,
      partialFailure: false,
      fullFailure: false,
    });
    return;
  }

  let collected: NormalizedPaperResult[] = [];
  let overallMs: number | undefined;
  let firstResultMs: number | undefined;
  const progressMap = new Map<SourceKey, SearchProgress>();
  active.forEach((key) => progressMap.set(key, { key, loading: true }));

  const emit = () => {
    const deduped = mergeRows(collected);
    const filtered = applyClientFilters(options.state, deduped);
    const sorted = sortRows(options.state, filtered);
    const progress = Array.from(progressMap.values());
    const failedCount = progress.filter((entry) => Boolean(entry.error)).length;

    options.onUpdate({
      mode,
      results: sorted,
      progress,
      overallMs,
      firstResultMs,
      partialFailure: failedCount > 0 && failedCount < progress.length,
      fullFailure: failedCount === progress.length,
    });
  };

  emit();

  await Promise.all(
    active.map(async (key) => {
      const adapter = ADAPTERS[key];
      try {
        const rows = await withTimeout(
          (innerSignal) => adapter.search({ state: options.state, normalizedQuery, mode, signal: innerSignal }),
          8000,
          options.signal
        );
        collected = [...collected, ...rows];
        if (overallMs === undefined && rows.length > 0) {
          overallMs = Math.max(0, Math.round(performance.now() - searchStart));
        }
        if (firstResultMs === undefined && rows.length > 0) {
          firstResultMs = Math.max(0, Math.round(performance.now() - searchStart));
        }
        progressMap.set(key, { key, loading: false, count: rows.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "source unavailable";
        progressMap.set(key, { key, loading: false, error: message });
      }

      emit();
    })
  );
}

export async function fetchAutocompleteSuggestions(input: string): Promise<SearchSuggestion[]> {
  const q = preprocessQuery(input);
  if (q.length < 3) return [];

  const [works, authors, concepts] = await Promise.allSettled([
    fetch(`/api/openalex?url=${encodeURIComponent(`https://api.openalex.org/autocomplete/works?q=${encodeURIComponent(q)}`)}`).then((res) =>
      res.ok ? (res.json() as Promise<OpenAlexAutocompleteResponse>) : { results: [] }
    ),
    fetch(`/api/openalex?url=${encodeURIComponent(`https://api.openalex.org/autocomplete/authors?q=${encodeURIComponent(q)}`)}`).then((res) =>
      res.ok ? (res.json() as Promise<OpenAlexAutocompleteResponse>) : { results: [] }
    ),
    fetch(`/api/openalex?url=${encodeURIComponent(`https://api.openalex.org/autocomplete/concepts?q=${encodeURIComponent(q)}`)}`).then((res) =>
      res.ok ? (res.json() as Promise<OpenAlexAutocompleteResponse>) : { results: [] }
    ),
  ]);

  const mapped: SearchSuggestion[] = [];

  if (works.status === "fulfilled") {
    (works.value.results || []).slice(0, 2).forEach((item) => {
      mapped.push({
        id: `work-${item.id || item.display_name}`,
        label: item.display_name,
        sublabel: "Paper",
        kind: "paper",
      });
    });
  }

  if (authors.status === "fulfilled") {
    (authors.value.results || []).slice(0, 2).forEach((item) => {
      mapped.push({
        id: `author-${item.id || item.display_name}`,
        label: `author: ${item.display_name}`,
        sublabel: "Author",
        kind: "author",
      });
    });
  }

  if (concepts.status === "fulfilled") {
    (concepts.value.results || []).slice(0, 1).forEach((item) => {
      mapped.push({
        id: `concept-${item.id || item.display_name}`,
        label: item.display_name,
        sublabel: "Concept",
        kind: "concept",
      });
    });
  }

  return mapped.slice(0, 5);
}

function quoteValue(input: string) {
  return input.replace(/"/g, "'").trim();
}

export function buildCitations(payload: CitationPayload) {
  const authorList = payload.authors.length > 0 ? payload.authors : ["Unknown"];
  const year = payload.year || new Date().getFullYear();
  const doiUrl = payload.doi ? `https://doi.org/${payload.doi}` : payload.url || "";
  const venue = payload.venue || "Unknown venue";

  const bibtexAuthors = authorList.join(" and ");
  const firstAuthorLast = authorList[0].split(" ").slice(-1)[0] || "paper";
  const key = `${firstAuthorLast}${year}`.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  const bibtex = [
    `@article{${key},`,
    `  title = {${quoteValue(payload.title)}},`,
    `  author = {${quoteValue(bibtexAuthors)}},`,
    `  year = {${year}},`,
    payload.doi ? `  doi = {${payload.doi}},` : "",
    payload.venue ? `  journal = {${quoteValue(venue)}},` : "",
    doiUrl ? `  url = {${doiUrl}},` : "",
    `}`,
  ]
    .filter(Boolean)
    .join("\n");

  const apa = `${authorList.join(", ")} (${year}). ${payload.title}. ${venue}.${doiUrl ? ` ${doiUrl}` : ""}`;
  const mla = `${authorList.join(", ")}. "${payload.title}." ${venue}, ${year}.${doiUrl ? ` ${doiUrl}.` : ""}`;
  const chicago = `${authorList.join(", ")}. ${year}. "${payload.title}." ${venue}.${doiUrl ? ` ${doiUrl}.` : ""}`;
  const ris = [
    "TY  - JOUR",
    ...authorList.map((author) => `AU  - ${author}`),
    `TI  - ${payload.title}`,
    `PY  - ${year}`,
    payload.venue ? `JO  - ${venue}` : "",
    payload.doi ? `DO  - ${payload.doi}` : "",
    doiUrl ? `UR  - ${doiUrl}` : "",
    "ER  -",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    bibtex,
    apa,
    mla,
    chicago,
    ris,
  };
}

export function sourceDisplay(key: SourceKey): string {
  return SOURCE_LABELS[key];
}

export const SOURCE_OPTIONS: { key: SourceKey; label: string }[] = ALL_SOURCES.map((key) => ({ key, label: SOURCE_LABELS[key] }));

/** Source urls for manual fallback when all sources fail */
export const SOURCE_MANUAL_URLS: Record<SourceKey, string> = {
  openalex: "https://openalex.org/works",
  arxiv: "https://arxiv.org/search/",
  "biorxiv-medrxiv": "https://www.biorxiv.org/search",
  "pmc-europepmc": "https://europepmc.org/search",
  "semantic-scholar": "https://www.semanticscholar.org/search",
  core: "https://core.ac.uk/search",
  zenodo: "https://zenodo.org/search",
};

/**
 * Returns a list of {label, value} describing active non-default filters,
 * used to render the dismissable active-filter pills row.
 */
export interface ActiveFilterPill {
  id: string;
  label: string;
  /** Partial state patch to apply when this pill is dismissed */
  clear: Partial<SearchState>;
}

export function getActiveFilterPills(state: SearchState): ActiveFilterPill[] {
  const pills: ActiveFilterPill[] = [];

  if (state.type !== "all") {
    const label = state.type === "papers" ? "Articles" : state.type === "preprints" ? "Preprints" : state.type === "reviews" ? "Reviews" : "Datasets";
    pills.push({ id: "type", label, clear: { type: "all" } });
  }

  if (state.year) {
    const [from, to] = state.year.split("-");
    pills.push({ id: "year", label: `${from}–${to}`, clear: { year: "" } });
  }

  if (isOpenAccessOnly(state)) {
    pills.push({ id: "oa", label: "PDF available", clear: { filter: "" } });
  }

  if (state.source) {
    const parts = state.source.split(",").map((v) => v.trim()).filter(Boolean) as SourceKey[];
    parts.forEach((key) => {
      pills.push({
        id: `source-${key}`,
        label: SOURCE_LABELS[key],
        clear: { source: parts.filter((k) => k !== key).join(",") },
      });
    });
  }

  return pills;
}

/**
 * Parses a custom free-form year range entered by user (e.g. "2015" or "2015-2023").
 * Returns empty string if invalid.
 */
export function parseCustomYearRange(from: string, to: string): string {
  const f = Number.parseInt(from.trim(), 10);
  const t = Number.parseInt(to.trim(), 10);
  if (Number.isNaN(f) && Number.isNaN(t)) return "";
  const lo = !Number.isNaN(f) ? f : t;
  const hi = !Number.isNaN(t) ? t : f;
  return `${Math.min(lo, hi)}-${Math.max(lo, hi)}`;
}

export async function fetchRelatedOpenAlexPapers(
  input: NormalizedPaperResult,
  signal?: AbortSignal
): Promise<NormalizedPaperResult[]> {
  if (!input.openAlexId) return [];

  try {
    const base = await fetchOpenAlex<{ related_works?: string[] }>(`${input.openAlexId}`, signal);
    if (!base) return [];
    const relatedIds = (base.related_works || []).slice(0, 5);
    if (relatedIds.length === 0) return [];

    const rows = await Promise.all(
      relatedIds.map(async (id) => {
        try {
          const row = await fetchOpenAlex<OpenAlexWork>(id, signal);
          if (!row) return null;
          return mapOpenAlexWork(row, "openalex");
        } catch {
          return null;
        }
      })
    );

    return rows.filter(Boolean) as NormalizedPaperResult[];
  } catch {
    return [];
  }
}
