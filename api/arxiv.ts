import {
  type ApiRequest,
  type ApiResponse,
  assertPublicHostname,
  enforceOriginCheck,
  enforceRateLimit,
  parseAndValidateUrl,
  requireGet,
  requireQueryParam,
  sendError,
  setSecurityHeaders,
} from "./_security";

interface ApiResponseWithSend extends ApiResponse {
  send: (payload: string) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponseWithSend) {
  if (!requireGet(req, res)) return;
  if (!enforceOriginCheck(req, res)) return;
  if (!enforceRateLimit(req, res, "search")) return;
  setSecurityHeaders(res);

  const urlParam = requireQueryParam(req, res, "url", { maxLen: 2000 });
  if (!urlParam) return;

  const upstreamUrl = parseAndValidateUrl(urlParam, ["export.arxiv.org"]);
  if (!upstreamUrl) {
    sendError(res, 400, "invalid_request", "Invalid or forbidden upstream URL");
    return;
  }

  if (!(await assertPublicHostname(upstreamUrl.hostname))) {
    sendError(res, 400, "invalid_request", "Forbidden host");
    return;
  }

  try {
    const upstream = await fetch(upstreamUrl.toString());
    if (!upstream.ok) {
      const text = await upstream.text();
      sendError(res, upstream.status, "Upstream arXiv error", text.slice(0, 400));
      return;
    }

    const xml = await upstream.text();
    setSecurityHeaders(res);
    res.setHeader("Content-Type", "application/atom+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=21600");
    res.status(200).send(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, 502, "Failed to resolve arXiv", message);
  }
}
