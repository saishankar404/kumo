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
  if (!enforceRateLimit(req, res, "linkCheck")) return;
  setSecurityHeaders(res);

  const urlParam = requireQueryParam(req, res, "url", { maxLen: 2000 });
  if (!urlParam) return;
  let parsed: URL;
  try {
    parsed = new URL(urlParam);
  } catch {
    sendError(res, 400, "invalid_request", "Invalid url");
    return;
  }
  const target = parseAndValidateUrl(urlParam, [parsed.hostname]);
  if (!target) {
    sendError(res, 400, "invalid_request", "Invalid url");
    return;
  }
  if (!(await assertPublicHostname(target.hostname))) {
    sendError(res, 400, "invalid_request", "Forbidden host");
    return;
  }

  const distinctId = getSingle(req.headers?.["x-posthog-distinct-id"]) ?? "anonymous";
  const posthog = createPostHogClient();

  try {
    let upstream = await fetch(target.toString(), {
      method: "HEAD",
      redirect: "follow",
    });

    if (upstream.status === 405 || upstream.status === 403) {
      upstream = await fetch(target.toString(), {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
      });
    }

    const finalUrl = upstream.url ? new URL(upstream.url) : target;
    if (!(await assertPublicHostname(finalUrl.hostname))) {
      sendError(res, 400, "invalid_request", "Forbidden redirect host");
      await posthog.captureImmediate({
        distinctId,
        event: "api_link_check_error",
        properties: { url: urlParam, error: "Forbidden redirect host" },
      });
      await posthog.shutdown();
      return;
    }

    const result = {
      ok: upstream.ok,
      status: upstream.status,
      finalUrl: upstream.url,
      contentType: upstream.headers.get("content-type"),
    };
    setSecurityHeaders(res);
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");
    res.status(200).json(result);
    await posthog.captureImmediate({
      distinctId,
      event: "api_link_checked",
      properties: {
        url: urlParam,
        ok: result.ok,
        status_code: result.status,
        content_type: result.contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setSecurityHeaders(res);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: false, error: "Failed to check link", detail: message });
    posthog.captureException(error, distinctId, { url: urlParam });
    await posthog.captureImmediate({
      distinctId,
      event: "api_link_check_error",
      properties: { url: urlParam, error: message },
    });
  }
  await posthog.shutdown();
}
