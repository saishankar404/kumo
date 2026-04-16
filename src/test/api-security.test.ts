import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  return {
    default: { lookup },
    lookup,
  };
});

import arxivHandler from "../../api/arxiv";
import linkCheckHandler from "../../api/link-check";
import { isValidDoi, parseAndValidateUrl } from "../../api/_security";

type Req = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

function makeRes() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let jsonBody: unknown = null;
  let textBody = "";

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      jsonBody = payload;
    },
    send(payload: string) {
      textBody = payload;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
  };

  return { res, headers, get statusCode() { return statusCode; }, get jsonBody() { return jsonBody; }, get textBody() { return textBody; } };
}

describe("api security helpers", () => {
  it("validates DOI format", () => {
    expect(isValidDoi("10.1000/xyz123")).toBe(true);
    expect(isValidDoi("10.12/nope")).toBe(false);
    expect(isValidDoi("not-a-doi")).toBe(false);
  });

  it("parses and validates URL host/protocol allowlist", () => {
    expect(parseAndValidateUrl("https://api.openalex.org/works?search=a", ["api.openalex.org"])?.hostname).toBe("api.openalex.org");
    expect(parseAndValidateUrl("http://api.openalex.org/works?search=a", ["api.openalex.org"])?.hostname).toBe("api.openalex.org");
    expect(parseAndValidateUrl("ftp://api.openalex.org/works", ["api.openalex.org"])).toBeNull();
    expect(parseAndValidateUrl("https://evil.com", ["api.openalex.org"])).toBeNull();
  });
});

describe("arxiv handler guardrails", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.STRICT_ORIGIN_CHECK;
    delete process.env.RATE_LIMIT_MODE;
  });

  it("rejects non-GET requests", async () => {
    const out = makeRes();
    await arxivHandler({ method: "POST", query: {} }, out.res);
    expect(out.statusCode).toBe(405);
    expect(out.headers.get("cache-control")).toBe("no-store");
  });

  it("returns cache headers on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "<feed><entry /></feed>",
      status: 200,
    } as Response);

    const out = makeRes();
    await arxivHandler({ method: "GET", query: { url: "https://export.arxiv.org/api/query?search_query=all:test" } }, out.res);
    expect(out.statusCode).toBe(200);
    expect(out.headers.get("cache-control")).toContain("s-maxage=1800");
    expect(out.headers.get("x-content-type-options")).toBe("nosniff");
    expect(out.textBody).toContain("<feed>");
  });

  it("enforces rate limiting in enforce mode", async () => {
    process.env.RATE_LIMIT_MODE = "enforce";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "<feed><entry /></feed>",
      status: 200,
    } as Response);

    let hit429 = false;
    for (let i = 0; i < 45; i += 1) {
      const out = makeRes();
      await arxivHandler(
        {
          method: "GET",
          query: { url: "https://export.arxiv.org/api/query?search_query=all:test" },
          headers: { "x-forwarded-for": "1.1.1.1", "user-agent": "vitest" },
        },
        out.res
      );
      if (out.statusCode === 429) {
        hit429 = true;
        expect(out.headers.get("retry-after")).toBeTruthy();
        break;
      }
    }

    expect(hit429).toBe(true);
  });
});

describe("link-check hardening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.STRICT_ORIGIN_CHECK;
    delete process.env.RATE_LIMIT_MODE;
  });

  it("blocks private hosts", async () => {
    const out = makeRes();
    await linkCheckHandler({ method: "GET", query: { url: "http://127.0.0.1:8080" } }, out.res);
    expect(out.statusCode).toBe(400);
    expect(out.headers.get("cache-control")).toBe("no-store");
  });
});
