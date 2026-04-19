/**
 * Security Utilities for Vercel Edge Runtime
 */

export const config = {
  runtime: "edge",
};

type LimitConfig = {
  max: number;
  windowMs: number;
};

type RateBucket = {
  tokens: number;
  updatedAt: number;
};

const DEFAULT_LIMIT: LimitConfig = { max: 60, windowMs: 60_000 };

const ROUTE_LIMITS: Record<string, LimitConfig> = {
  search: { max: 40, windowMs: 60_000 },
  linkCheck: { max: 15, windowMs: 60_000 },
  unpaywall: { max: 25, windowMs: 60_000 },
};

const RATE_BUCKETS = new Map<string, RateBucket>();
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const PRIVATE_HOST_RE = /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|::1|[fF][eE]80::.*)$/i;

export function getSecurityHeaders(): Headers {
  const headers = new Headers();
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return headers;
}

export function sendErrorResponse(statusCode: number, error: string, detail?: string): Response {
  const headers = getSecurityHeaders();
  headers.set("Cache-Control", "no-store");
  return new Response(
    JSON.stringify({
      error,
      ...(detail ? { detail } : {}),
    }),
    { status: statusCode, headers }
  );
}

export function requireGet(req: Request): Response | null {
  if (req.method === "GET") return null;
  return sendErrorResponse(405, "Method not allowed");
}

export function enforceOriginCheck(req: Request): Response | null {
  const strict = process.env.STRICT_ORIGIN_CHECK === "true";
  if (!strict) return null;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  
  if (!origin && !referer) {
    return sendErrorResponse(403, "invalid_request", "Missing origin or referer header");
  }

  let requestOrigin = origin;
  if (!requestOrigin && referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      return sendErrorResponse(403, "invalid_request", "Invalid referer header");
    }
  }

  const host = req.headers.get("host");
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if (host) allowedOrigins.add(`https://${host}`);
  allowedOrigins.add("http://localhost:8080");
  allowedOrigins.add("http://localhost:5173");

  if (!requestOrigin || allowedOrigins.has(requestOrigin)) return null;
  return sendErrorResponse(403, "invalid_request", "Origin not allowed");
}

function getClientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "anonymous";
  const ua = (req.headers.get("user-agent") || "ua-unknown").slice(0, 120);
  return `${ip}|${ua}`;
}

function consumeToken(key: string, limit: LimitConfig): { allowed: boolean; remaining: number; resetSec: number } {
  const now = Date.now();
  const refillPerMs = limit.max / limit.windowMs;
  const bucket = RATE_BUCKETS.get(key) || { tokens: limit.max, updatedAt: now };
  const elapsed = Math.max(0, now - bucket.updatedAt);
  bucket.tokens = Math.min(limit.max, bucket.tokens + elapsed * refillPerMs);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    RATE_BUCKETS.set(key, bucket);
    const deficit = 1 - bucket.tokens;
    const waitMs = Math.ceil(deficit / refillPerMs);
    return {
      allowed: false,
      remaining: 0,
      resetSec: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }

  bucket.tokens -= 1;
  RATE_BUCKETS.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, Math.floor(bucket.tokens)),
    resetSec: Math.ceil(limit.windowMs / 1000),
  };
}

export function enforceRateLimit(req: Request, routeGroup: keyof typeof ROUTE_LIMITS | "default" = "default"): Response | null {
  const mode = (process.env.RATE_LIMIT_MODE || (process.env.NODE_ENV === "production" ? "enforce" : "soft")).toLowerCase();
  if (mode === "off") return null;

  const limit = routeGroup === "default" ? DEFAULT_LIMIT : ROUTE_LIMITS[routeGroup];
  const key = `${routeGroup}:${getClientKey(req)}`;
  const result = consumeToken(key, limit);

  // Note: We can't set headers on a Response we haven't created yet in this helper pattern
  // but we can return the error response with correct headers if blocked.
  if (!result.allowed && mode === "enforce") {
    const errorRes = sendErrorResponse(429, "rate_limited", `Retry in ${result.resetSec}s`);
    errorRes.headers.set("Retry-After", String(result.resetSec));
    errorRes.headers.set("X-RateLimit-Limit", String(limit.max));
    errorRes.headers.set("X-RateLimit-Remaining", "0");
    errorRes.headers.set("X-RateLimit-Reset", String(result.resetSec));
    return errorRes;
  }

  return null;
}

export function requireQueryParam(
  url: URL,
  name: string,
  opts?: { minLen?: number; maxLen?: number; pattern?: RegExp }
): { value: string | null; error?: Response } {
  const value = url.searchParams.get(name)?.trim();
  if (!value) {
    return { value: null, error: sendErrorResponse(400, "invalid_request", `Missing ${name}`) };
  }

  const minLen = opts?.minLen ?? 1;
  const maxLen = opts?.maxLen ?? 1024;
  if (value.length < minLen || value.length > maxLen) {
    return { value: null, error: sendErrorResponse(400, "invalid_request", `Invalid ${name} length`) };
  }

  if (opts?.pattern && !opts.pattern.test(value)) {
    return { value: null, error: sendErrorResponse(400, "invalid_request", `Invalid ${name}`) };
  }

  return { value };
}

export function parseAndValidateUrl(urlParam: string, allowedHosts: string[]): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(urlParam);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
  if (!allowedHosts.includes(parsed.hostname)) return null;
  return parsed;
}

export function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (PRIVATE_HOST_RE.test(normalized)) return true;
  if (normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  return false;
}

function isIP(address: string): 4 | 6 | 0 {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(address)) return 4;
  if (/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(address)) return 6;
  if (address.includes(":")) return 6;
  return 0;
}

export async function assertPublicHostname(hostname: string): Promise<boolean> {
  if (isPrivateHost(hostname)) return false;
  // DNS is not available at Edge
  return true;
}

export function isValidDoi(value: string): boolean {
  return /^10\.\d{4,}\/\S+$/i.test(value);
}
