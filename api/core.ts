import { createPostHogClient } from "./posthog";
import {
  type ApiRequest,
  type ApiResponse,
  enforceOriginCheck,
  enforceRateLimit,
  getSingle,
  requireGet,
  requireQueryParam,
  sendError,
  setSecurityHeaders,
} from "./_security";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!requireGet(req, res)) return;
  if (!enforceOriginCheck(req, res)) return;
  if (!enforceRateLimit(req, res, "search")) return;
  setSecurityHeaders(res);

  const query = requireQueryParam(req, res, "query", { minLen: 2, maxLen: 400 });
  if (!query) return;

  const apiKey = process.env.CORE_API_KEY;
  if (!apiKey) {
    sendError(res, 503, "CORE_API_KEY not configured");
    return;
  }

  const distinctId = getSingle(req.headers?.["x-posthog-distinct-id"]) ?? "anonymous";
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
      sendError(res, upstream.status, "Upstream CORE error", text.slice(0, 400));
      await posthog.captureImmediate({
        distinctId,
        event: "api_search_error",
        properties: {
          source: "core",
          query,
          status_code: upstream.status,
        },
      });
      await posthog.shutdown();
      return;
    }
    const data = JSON.parse(text) as { totalHits?: number; results?: unknown[] };
    setSecurityHeaders(res);
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
    res.status(200).json(data);
    await posthog.captureImmediate({
      distinctId,
      event: "api_search_requested",
      properties: {
        source: "core",
        query,
        result_count: data.totalHits ?? data.results?.length ?? 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, 502, "Failed to resolve CORE", message);
    posthog.captureException(error, distinctId, { source: "core", query });
  }
  await posthog.shutdown();
}
