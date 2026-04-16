import {
  enforceOriginCheck,
  enforceRateLimit,
  getSecurityHeaders,
  isValidDoi,
  requireGet,
  requireQueryParam,
  sendErrorResponse,
} from "./_security";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request): Promise<Response> {
  const errorRes = requireGet(req) || enforceOriginCheck(req) || enforceRateLimit(req, "unpaywall");
  if (errorRes) return errorRes;

  const url = new URL(req.url);
  const { value: doi, error: queryError } = requireQueryParam(url, "doi", { maxLen: 300 });
  if (queryError) return queryError;
  if (!doi) return sendErrorResponse(400, "invalid_request", "Missing doi");

  if (!isValidDoi(doi)) {
    return sendErrorResponse(400, "invalid_request", "Invalid doi");
  }

  const email = process.env.UNPAYWALL_EMAIL;
  if (!email) {
    return sendErrorResponse(503, "UNPAYWALL_EMAIL not configured", "Set server env UNPAYWALL_EMAIL to enable OA PDF resolution");
  }

  try {
    const upstream = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`);

    if (!upstream.ok) {
      const text = await upstream.text();
      return sendErrorResponse(upstream.status, "Upstream unpaywall error", text.slice(0, 400));
    }

    const payload = await upstream.json();
    const headers = getSecurityHeaders();
    headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    
    return new Response(JSON.stringify(payload), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return sendErrorResponse(502, "Failed to resolve Unpaywall", message);
  }
}
