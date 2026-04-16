import { describe, expect, it } from "vitest";
import {
  classifyQuery,
  getActiveSources,
  isOpenAccessOnly,
  parseSearchState,
  preprocessQuery,
  serializeSearchState,
} from "@/lib/search-engine";

describe("search-engine state", () => {
  it("parses and serializes URL state predictably", () => {
    const params = new URLSearchParams("q=test&type=preprints&sort=cited&year=2020-2024&filter=oa&source=arxiv&page=3");
    const state = parseSearchState(params);

    expect(state.q).toBe("test");
    expect(state.type).toBe("preprints");
    expect(state.sort).toBe("cited");
    expect(state.year).toBe("2020-2024");
    expect(state.filter).toBe("oa");
    expect(state.source).toBe("arxiv");
    expect(state.page).toBe(3);

    const out = serializeSearchState(state);
    expect(out.get("q")).toBe("test");
    expect(out.get("page")).toBe("3");
  });

  it("defaults invalid page to 1", () => {
    const state = parseSearchState(new URLSearchParams("q=test&page=-4"));
    expect(state.page).toBe(1);
  });
});

describe("query routing", () => {
  it("classifies DOI, arXiv, author and title/keyword", () => {
    expect(classifyQuery("10.1038/nature12373")).toBe("doi");
    expect(classifyQuery("1706.03762v3")).toBe("arxiv");
    expect(classifyQuery("author: geoffrey hinton")).toBe("author");
    expect(classifyQuery("A long paper title with multiple words and no symbols")).toBe("title");
    expect(classifyQuery("transformer"))
      .toBe("keyword");
  });

  it("normalizes smart quotes and whitespace", () => {
    expect(preprocessQuery("  \u201chello\u201d   world  ")).toBe('"hello" world');
  });
});

describe("filters", () => {
  it("parses OA filter and selected sources", () => {
    const state = parseSearchState(new URLSearchParams("q=test&filter=oa&source=arxiv,openalex"));
    expect(isOpenAccessOnly(state)).toBe(true);
    expect(getActiveSources(state)).toEqual(["arxiv", "openalex"]);
  });

  it("defaults sources to all", () => {
    const state = parseSearchState(new URLSearchParams("q=test"));
    expect(getActiveSources(state)).toEqual(["openalex", "arxiv", "biorxiv-medrxiv", "pmc-europepmc", "semantic-scholar", "core", "zenodo"]);
  });
});
