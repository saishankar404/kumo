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
  const { value: urlParam, error: queryError } = requireQueryParam(url, "url", { maxLen: 2000 });
  if (queryError) return queryError;
  if (!urlParam) return sendErrorResponse(400, "invalid_request", "Missing url");

  const upstreamUrl = parseAndValidateUrl(urlParam, ["export.arxiv.org"]);
  if (!upstreamUrl) {
    return sendErrorResponse(400, "invalid_request", "Invalid or forbidden upstream URL");
  }

  if (!(await assertPublicHostname(upstreamUrl.hostname))) {
    return sendErrorResponse(400, "invalid_request", "Forbidden host");
  }

  try {
    const upstream = await fetch(upstreamUrl.toString());
    if (!upstream.ok) {
      const text = await upstream.text();
      return sendErrorResponse(upstream.status, "Upstream arXiv error", text.slice(0, 400));
    }

    const xml = await upstream.text();
    const headers = getSecurityHeaders();
    headers.set("Content-Type", "application/atom+xml; charset=utf-8");
    headers.set("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=21600");
    
    return new Response(xml, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return sendErrorResponse(502, "Failed to resolve arXiv", message);
  }
}
