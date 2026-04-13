import { evaluateEdgePrefilter } from "./src/lib/edge-prefilter";

export default function middleware(request: Request): Response | void {
  const url = new URL(request.url);
  const decision = evaluateEdgePrefilter({
    method: request.method,
    pathname: url.pathname,
    search: url.search,
    userAgent: request.headers.get("user-agent") || "",
  });

  if (!decision.block) return;

  return new Response(
    JSON.stringify({
      error: "invalid_request",
      detail: `Request blocked by edge prefilter (${decision.reason || "unknown"})`,
    }),
    {
      status: decision.status || 403,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-edge-prefilter": "blocked",
      },
    }
  );
}

export const config = {
  matcher: ["/api/:path*"],
};

