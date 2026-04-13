import {
  type ApiRequest,
  type ApiResponse,
  enforceOriginCheck,
  enforceRateLimit,
  isValidDoi,
  requireGet,
  requireQueryParam,
  sendError,
  setSecurityHeaders,
} from "./_security";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!requireGet(req, res)) return;
  if (!enforceOriginCheck(req, res)) return;
  if (!enforceRateLimit(req, res, "unpaywall")) return;
  setSecurityHeaders(res);

  const doi = requireQueryParam(req, res, "doi", { maxLen: 300 });
  if (!doi) return;
  if (!isValidDoi(doi)) {
    sendError(res, 400, "invalid_request", "Invalid doi");
    return;
  }

  const email = process.env.UNPAYWALL_EMAIL;
  if (!email) {
    sendError(res, 503, "UNPAYWALL_EMAIL not configured", "Set server env UNPAYWALL_EMAIL to enable OA PDF resolution");
    return;
  }

  try {
    const upstream = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`);

    if (!upstream.ok) {
      const text = await upstream.text();
      sendError(res, upstream.status, "Upstream unpaywall error", text.slice(0, 400));
      return;
    }

    const payload = await upstream.json();
    setSecurityHeaders(res);
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, 502, "Failed to resolve Unpaywall", message);
  }
}
