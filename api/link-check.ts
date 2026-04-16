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
  const errorRes = requireGet(req) || enforceOriginCheck(req) || enforceRateLimit(req, "linkCheck");
  if (errorRes) return errorRes;

  const url = new URL(req.url);
  const { value: urlParam, error: queryError } = requireQueryParam(url, "url", { maxLen: 2000 });
  if (queryError) return queryError;
  if (!urlParam) return sendErrorResponse(400, "invalid_request", "Missing url");

  let parsed: URL;
  try {
    parsed = new URL(urlParam);
  } catch {
    return sendErrorResponse(400, "invalid_request", "Invalid url");
  }

  const target = parseAndValidateUrl(urlParam, [parsed.hostname]);
  if (!target) {
    return sendErrorResponse(400, "invalid_request", "Invalid or forbidden url");
  }

  if (!(await assertPublicHostname(target.hostname))) {
    return sendErrorResponse(400, "invalid_request", "Forbidden host");
  }

  const distinctId = req.headers.get("x-posthog-distinct-id") ?? "anonymous";
  const posthog = createPostHogClient();

  try {
    let upstream = await fetch(target.toString(), {
      method: "HEAD",
      redirect: "manual",
    });

    if (upstream.status === 405 || upstream.status === 403) {
      upstream = await fetch(target.toString(), {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "manual",
      });
    }

    if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.has("location")) {
      const redirectUrl = new URL(upstream.headers.get("location")!, target);
      if (!(await assertPublicHostname(redirectUrl.hostname))) {
        const errResp = sendErrorResponse(400, "invalid_request", "Forbidden redirect host");
        posthog.captureImmediate({
          distinctId,
          event: "api_link_check_error",
          properties: { url: urlParam, error: "Forbidden redirect host" },
        });
        return errResp;
      }
    }

    const result = {
      ok: upstream.ok,
      status: upstream.status,
      finalUrl: upstream.url,
      contentType: upstream.headers.get("content-type"),
    };

    const headers = getSecurityHeaders();
    headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");

    posthog.captureImmediate({
      distinctId,
      event: "api_link_checked",
      properties: {
        url: urlParam,
        ok: result.ok,
        status_code: result.status,
        content_type: result.contentType,
      },
    });

    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    posthog.captureException(error, distinctId, { url: urlParam });
    
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to check link", detail: message }), 
      { 
        status: 200, 
        headers: getSecurityHeaders() 
      }
    );
  }
}
