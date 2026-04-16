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

  const endpoint = `https://zenodo.org/api/records/?q=${encodeURIComponent(query)}&size=20`;
  try {
    const upstream = await fetch(endpoint);
    const text = await upstream.text();
    if (!upstream.ok) {
      const resp = sendErrorResponse(upstream.status, "Upstream Zenodo error", text.slice(0, 400));
      posthog.captureImmediate({
        distinctId,
        event: "api_search_error",
        properties: {
          source: "zenodo",
          query,
          status_code: upstream.status,
        },
      });
      return resp;
    }
    const data = JSON.parse(text) as { hits?: { total?: number; hits?: unknown[] } };
    const headers = getSecurityHeaders();
    headers.set("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
    
    posthog.captureImmediate({
      distinctId,
      event: "api_search_requested",
      properties: {
        source: "zenodo",
        query,
        result_count: data.hits?.total ?? data.hits?.hits?.length ?? 0,
      },
    });

    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    posthog.captureException(error, distinctId, { source: "zenodo", query });
    return sendErrorResponse(502, "Failed to resolve Zenodo", message);
  }
}
