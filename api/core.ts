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

  const apiKey = process.env.CORE_API_KEY;
  if (!apiKey) {
    return sendErrorResponse(503, "CORE_API_KEY not configured");
  }

  const distinctId = req.headers.get("x-posthog-distinct-id") ?? "anonymous";
  const posthog = createPostHogClient();

  const endpoint = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&limit=20`;
  try {
    const upstream = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      const resp = sendErrorResponse(upstream.status, "Upstream CORE error", text.slice(0, 400));
      await posthog.captureImmediate({
        distinctId,
        event: "api_search_error",
        properties: {
          source: "core",
          query,
          status_code: upstream.status,
        },
      });
      return resp;
    }
    const data = JSON.parse(text) as { totalHits?: number; results?: unknown[] };
    const headers = getSecurityHeaders();
    headers.set("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
    
    // Non-blocking capture
    posthog.captureImmediate({
      distinctId,
      event: "api_search_requested",
      properties: {
        source: "core",
        query,
        result_count: data.totalHits ?? data.results?.length ?? 0,
      },
    });

    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    posthog.captureException(error, distinctId, { source: "core", query });
    return sendErrorResponse(502, "Failed to resolve CORE", message);
  }
}
