import dns from "node:dns/promises";
import net from "node:net";

export interface ApiRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

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
const PRIVATE_HOST_RE = /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|::1)$/i;

export function getSingle(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getHeader(req: ApiRequest, name: string): string | undefined {
  const direct = req.headers?.[name];
  if (direct) return getSingle(direct);

  const lower = name.toLowerCase();
  const key = Object.keys(req.headers || {}).find((headerName) => headerName.toLowerCase() === lower);
  if (!key) return undefined;
  return getSingle(req.headers?.[key]);
}

export function setSecurityHeaders(res: ApiResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
}

export function sendError(res: ApiResponse, statusCode: number, error: string, detail?: string): void {
  setSecurityHeaders(res);
  res.setHeader("Cache-Control", "no-store");
  res.status(statusCode).json({
    error,
    ...(detail ? { detail } : {}),
  });
}

export function requireGet(req: ApiRequest, res: ApiResponse): boolean {
  if (req.method === "GET") return true;
  sendError(res, 405, "Method not allowed");
  return false;
}

export function enforceOriginCheck(req: ApiRequest, res: ApiResponse): boolean {
  const strict = process.env.STRICT_ORIGIN_CHECK === "true";
  if (!strict) return true;

  const origin = getHeader(req, "origin");
  const referer = getHeader(req, "referer");
  if (!origin && !referer) return true;

  let requestOrigin = origin;
  if (!requestOrigin && referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      sendError(res, 403, "invalid_request", "Invalid referer header");
      return false;
    }
  }

  const host = getHeader(req, "host");
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if (host) allowedOrigins.add(`https://${host}`);
  allowedOrigins.add("http://localhost:8080");
  allowedOrigins.add("http://localhost:5173");

  if (!requestOrigin || allowedOrigins.has(requestOrigin)) return true;
  sendError(res, 403, "invalid_request", "Origin not allowed");
  return false;
}

function getClientKey(req: ApiRequest): string {
  const forwarded = getHeader(req, "x-forwarded-for");
  const realIp = getHeader(req, "x-real-ip");
  const cfIp = getHeader(req, "cf-connecting-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || cfIp || "anonymous";
  const ua = (getHeader(req, "user-agent") || "ua-unknown").slice(0, 120);
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

export function enforceRateLimit(req: ApiRequest, res: ApiResponse, routeGroup: keyof typeof ROUTE_LIMITS | "default" = "default"): boolean {
  const mode = (process.env.RATE_LIMIT_MODE || (process.env.NODE_ENV === "production" ? "enforce" : "soft")).toLowerCase();
  if (mode === "off") return true;

  const limit = routeGroup === "default" ? DEFAULT_LIMIT : ROUTE_LIMITS[routeGroup];
  const key = `${routeGroup}:${getClientKey(req)}`;
  const result = consumeToken(key, limit);

  res.setHeader("X-RateLimit-Limit", String(limit.max));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(result.resetSec));

  if (result.allowed) return true;
  if (mode === "soft") return true;

  res.setHeader("Retry-After", String(result.resetSec));
  sendError(res, 429, "rate_limited", `Retry in ${result.resetSec}s`);
  return false;
}

export function requireQueryParam(
  req: ApiRequest,
  res: ApiResponse,
  name: string,
  opts?: { minLen?: number; maxLen?: number; pattern?: RegExp }
): string | null {
  const value = getSingle(req.query?.[name])?.trim();
  if (!value) {
    sendError(res, 400, "invalid_request", `Missing ${name}`);
    return null;
  }

  const minLen = opts?.minLen ?? 1;
  const maxLen = opts?.maxLen ?? 1024;
  if (value.length < minLen || value.length > maxLen) {
    sendError(res, 400, "invalid_request", `Invalid ${name} length`);
    return null;
  }

  if (opts?.pattern && !opts.pattern.test(value)) {
    sendError(res, 400, "invalid_request", `Invalid ${name}`);
    return null;
  }

  return value;
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

function isPrivateIp(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  if (!normalized) return true;

  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) {
    if (normalized.startsWith("10.")) return true;
    if (normalized.startsWith("127.")) return true;
    if (normalized.startsWith("192.168.")) return true;
    if (normalized.startsWith("169.254.")) return true;
    const second = Number.parseInt(normalized.split(".")[1] || "", 10);
    if (normalized.startsWith("172.") && second >= 16 && second <= 31) return true;
    return false;
  }

  if (ipVersion === 6) {
    if (normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80:")) return true;
    return false;
  }

  return true;
}

export async function assertPublicHostname(hostname: string): Promise<boolean> {
  if (isPrivateHost(hostname)) return false;
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) return false;
    return records.every((record) => !isPrivateIp(record.address));
  } catch {
    return false;
  }
}

export function isValidDoi(value: string): boolean {
  return /^10\.\d{4,}\/\S+$/i.test(value);
}

