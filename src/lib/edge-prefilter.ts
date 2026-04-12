export type EdgePrefilterInput = {
  method: string;
  pathname: string;
  search: string;
  userAgent: string;
};

export type EdgePrefilterDecision = {
  block: boolean;
  reason?: string;
  status?: number;
};

const API_PREFIX = "/api/";
const MAX_PATH_LEN = 256;
const MAX_QUERY_LEN = 2200;
const MAX_URL_LEN = 3000;

const BLOCKED_UA_RE = /(sqlmap|nikto|masscan|nmap|zgrab|acunetix|dirbuster|wpscan|curl\/|wget\/|python-requests|libwww-perl|httpclient|go-http-client|okhttp|java\/|botnet|crawler|burp)/i;
const TRAVERSAL_RE = /(\.\.|%2e%2e|\\|%5c)/i;
const INJECTION_RE = /(union\s+select|<script|%3cscript|%00|\$\{jndi:|sleep\(|benchmark\()/i;

export function evaluateEdgePrefilter(input: EdgePrefilterInput): EdgePrefilterDecision {
  const method = (input.method || "").toUpperCase();
  const pathname = input.pathname || "";
  const search = input.search || "";
  let decodedSearch = search;
  try {
    decodedSearch = decodeURIComponent(search);
  } catch {
    decodedSearch = search;
  }
  const userAgent = input.userAgent || "";

  if (!pathname.startsWith(API_PREFIX)) return { block: false };

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { block: true, reason: "unsupported_method", status: 405 };
  }

  if (pathname.length > MAX_PATH_LEN) {
    return { block: true, reason: "path_too_long", status: 400 };
  }

  if (search.length > MAX_QUERY_LEN || pathname.length + search.length > MAX_URL_LEN) {
    return { block: true, reason: "query_too_long", status: 400 };
  }

  if (TRAVERSAL_RE.test(pathname) || TRAVERSAL_RE.test(search)) {
    return { block: true, reason: "path_anomaly", status: 400 };
  }

  if (INJECTION_RE.test(search) || INJECTION_RE.test(decodedSearch)) {
    return { block: true, reason: "query_anomaly", status: 400 };
  }

  if (!userAgent.trim()) {
    return { block: true, reason: "missing_user_agent", status: 403 };
  }

  if (BLOCKED_UA_RE.test(userAgent)) {
    return { block: true, reason: "blocked_user_agent", status: 403 };
  }

  return { block: false };
}
