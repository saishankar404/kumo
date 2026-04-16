import { createPostHogClient } from "./posthog";
import {
  enforceOriginCheck,
  enforceRateLimit,
  getSecurityHeaders,
  requireGet,
  requireQueryParam,
  sendErrorResponse,
} from "./_security";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request): Promise<Response> {
  const errorRes = requireGet(req) || enforceOriginCheck(req) || enforceRateLimit(req, "search");
  if (errorRes) return errorRes;

  const url = new URL(req.url);
  const { value: query, error: queryError } = requireQueryParam(url, "query", { minLen: 2, maxLen: 400 });
  if (queryError) return queryError;
  if (!query) return sendErrorResponse(400, "invalid_request", "Missing query");

  const distinctId = req.headers.get("x-posthog-distinct-id") ?? "anonymous";
  const posthog = createPostHogClient();

  const endpoint = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=15&fields=title,abstract,year,venue,citationCount,openAccessPdf,externalIds,authors,url`;

  try {
    const upstream = await fetch(endpoint);
    const text = await upstream.text();

    if (!upstream.ok) {
      const resp = sendErrorResponse(upstream.status, "Upstream semantic-scholar error", text.slice(0, 400));
      posthog.captureImmediate({
        distinctId,
        event: "api_search_error",
        properties: {
          source: "semantic-scholar",
          query,
          status_code: upstream.status,
        },
      });
      return resp;
    }

    const data = JSON.parse(text) as { total?: number; data?: unknown[] };
    const headers = getSecurityHeaders();
    headers.set("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    
    posthog.captureImmediate({
      distinctId,
      event: "api_search_requested",
      properties: {
        source: "semantic-scholar",
        query,
        result_count: data.total ?? data.data?.length ?? 0,
      },
    });

    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    posthog.captureException(error, distinctId, { source: "semantic-scholar", query });
    return sendErrorResponse(502, "Failed to resolve Semantic Scholar", message);
  }
}
