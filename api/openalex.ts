import { createPostHogClient } from "./posthog";
import {
  assertPublicHostname,
  enforceOriginCheck,
  enforceRateLimit,
  getSecurityHeaders,
  parseAndValidateUrl,
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
  const { value: urlParam, error: queryError } = requireQueryParam(url, "url", { maxLen: 2200 });
  if (queryError) return queryError;
  if (!urlParam) return sendErrorResponse(400, "invalid_request", "Missing url");

  const upstreamUrl = parseAndValidateUrl(urlParam, ["api.openalex.org"]);
  if (!upstreamUrl) {
    return sendErrorResponse(400, "invalid_request", "Invalid or forbidden upstream URL");
  }
  if (!(await assertPublicHostname(upstreamUrl.hostname))) {
    return sendErrorResponse(400, "invalid_request", "Forbidden host");
  }

  const distinctId = req.headers.get("x-posthog-distinct-id") ?? "anonymous";
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
      const resp = sendErrorResponse(upstream.status, "Upstream openalex error", text.slice(0, 400));
      posthog.captureImmediate({
        distinctId,
        event: "api_search_error",
        properties: {
          source: "openalex",
          query,
          status_code: upstream.status,
        },
      });
      return resp;
    }

    const data = JSON.parse(text) as { meta?: { count?: number }; results?: unknown[] };
    const headers = getSecurityHeaders();
    headers.set("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=21600");

    posthog.captureImmediate({
      distinctId,
      event: "api_search_requested",
      properties: {
        source: "openalex",
        query,
        result_count: data.meta?.count ?? data.results?.length ?? 0,
      },
    });

    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    posthog.captureException(error, distinctId, { source: "openalex", query });
    return sendErrorResponse(502, "Failed to resolve OpenAlex", message);
  }
}
