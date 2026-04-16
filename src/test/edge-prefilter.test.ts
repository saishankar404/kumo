import { describe, expect, it } from "vitest";
import { evaluateEdgePrefilter } from "@/lib/edge-prefilter";

describe("edge prefilter", () => {
  it("allows normal browser GET /api request", () => {
    const decision = evaluateEdgePrefilter({
      method: "GET",
      pathname: "/api/openalex",
      search: "?url=https%3A%2F%2Fapi.openalex.org%2Fworks%3Fsearch%3Dtransformer",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/124.0",
    });
    expect(decision.block).toBe(false);
  });

  it("blocks non-GET/HEAD/OPTIONS requests", () => {
    const decision = evaluateEdgePrefilter({
      method: "POST",
      pathname: "/api/openalex",
      search: "?url=https%3A%2F%2Fapi.openalex.org%2Fworks%3Fsearch%3Dtransformer",
      userAgent: "Mozilla/5.0",
    });
    expect(decision.block).toBe(true);
    expect(decision.reason).toBe("unsupported_method");
    expect(decision.status).toBe(405);
  });

  it("blocks traversal/path anomalies", () => {
    const decision = evaluateEdgePrefilter({
      method: "GET",
      pathname: "/api/../etc/passwd",
      search: "",
      userAgent: "Mozilla/5.0",
    });
    expect(decision.block).toBe(true);
    expect(decision.reason).toBe("path_anomaly");
  });

  it("blocks obvious injection probes in query", () => {
    const decision = evaluateEdgePrefilter({
      method: "GET",
      pathname: "/api/openalex",
      search: "?query=union%20select%20password%20from%20users",
      userAgent: "Mozilla/5.0",
    });
    expect(decision.block).toBe(true);
    expect(decision.reason).toBe("query_anomaly");
  });

  it("blocks suspicious scanner user agents", () => {
    const decision = evaluateEdgePrefilter({
      method: "GET",
      pathname: "/api/openalex",
      search: "?url=https%3A%2F%2Fapi.openalex.org%2Fworks%3Fsearch%3Dtransformer",
      userAgent: "sqlmap/1.8",
    });
    expect(decision.block).toBe(true);
    expect(decision.reason).toBe("blocked_user_agent");
  });
});

