import { createPostHogClient } from "./posthog";
import {
  type ApiRequest,
  type ApiResponse,
  assertPublicHostname,
  enforceOriginCheck,
  enforceRateLimit,
  getSingle,
  parseAndValidateUrl,
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

  const urlParam = requireQueryParam(req, res, "url", { maxLen: 2200 });
  if (!urlParam) return;

  const upstreamUrl = parseAndValidateUrl(urlParam, ["api.openalex.org"]);
  if (!upstreamUrl) {
    sendError(res, 400, "invalid_request", "Invalid or forbidden upstream URL");
    return;
  }
  if (!(await assertPublicHostname(upstreamUrl.hostname))) {
    sendError(res, 400, "invalid_request", "Forbidden host");
    return;
  }

  const distinctId = getSingle(req.headers?.["x-posthog-distinct-id"]) ?? "anonymous";
  const posthog = createPostHogClient();
  const query = upstreamUrl.searchParams.get("search") ?? upstreamUrl.searchParams.get("filter") ?? urlParam;

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: {
        "User-Agent": "kumo/1.0 (+https://kumo.saishankar.xyz)",
      },
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      sendError(res, upstream.status, "Upstream openalex error", text.slice(0, 400));
      await posthog.captureImmediate({
        distinctId,
        event: "api_search_error",
        properties: {
          source: "openalex",
          query,
          status_code: upstream.status,
        },
      });
      await posthog.shutdown();
      return;
    }

    const data = JSON.parse(text) as { meta?: { count?: number }; results?: unknown[] };
    setSecurityHeaders(res);
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=21600");
    res.status(200).json(data);
    await posthog.captureImmediate({
      distinctId,
      event: "api_search_requested",
      properties: {
        source: "openalex",
        query,
        result_count: data.meta?.count ?? data.results?.length ?? 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, 502, "Failed to resolve OpenAlex", message);
    posthog.captureException(error, distinctId, { source: "openalex", query });
  }
  await posthog.shutdown();
}
