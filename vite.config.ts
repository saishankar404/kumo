import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

function getRateLimitKey(ip: string, endpoint: string): string {
  return `${ip}:${endpoint}`;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok || attempt === maxRetries) {
        return response;
      }

      if (response.status === 429) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = new Error(`Rate limited (429), attempt ${attempt + 1}`);
        continue;
      }

      if (response.status >= 500) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = new Error(`Server error (${response.status}), attempt ${attempt + 1}`);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown fetch error");
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Failed after retries");
}

function localApiPlugin(unpaywallEmail?: string, coreApiKey?: string, openalexApiKey?: string): Plugin {
  return {
    name: "local-api-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();
        const parsed = new URL(req.url, "http://localhost");
        const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          (req.socket?.remoteAddress || "unknown");

        if (parsed.pathname === "/api/arxiv") {
          const upstreamParam = parsed.searchParams.get("url");
          if (!upstreamParam) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing url query param" }));
            return;
          }

          let upstreamUrl: URL;
          try {
            upstreamUrl = new URL(upstreamParam);
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Invalid url" }));
            return;
          }

          if (upstreamUrl.hostname !== "export.arxiv.org") {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Only export.arxiv.org allowed" }));
            return;
          }

          try {
            const upstream = await fetch(upstreamUrl.toString());
            const body = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/atom+xml; charset=utf-8");
            res.end(body);
            return;
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Failed to resolve arXiv", detail: error instanceof Error ? error.message : "Unknown error" }));
            return;
          }
        }

        if (parsed.pathname === "/api/openalex") {
          const upstreamParam = parsed.searchParams.get("url");
          if (!upstreamParam) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing url query param" }));
            return;
          }

          let upstreamUrl: URL;
          try {
            upstreamUrl = new URL(upstreamParam);
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Invalid url" }));
            return;
          }

          if (upstreamUrl.hostname !== "api.openalex.org") {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Only api.openalex.org allowed" }));
            return;
          }

          try {
            const headers: Record<string, string> = {
              "User-Agent": "kumo/1.0 (+https://kumo.saishankar.xyz)",
            };
            if (openalexApiKey) {
              headers["Authorization"] = `Bearer ${openalexApiKey}`;
            }
            const upstream = await fetch(upstreamUrl.toString(), { headers });
            const body = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(body);
            return;
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Failed to resolve OpenAlex", detail: error instanceof Error ? error.message : "Unknown error" }));
            return;
          }
        }

        if (parsed.pathname === "/api/semantic-scholar") {
          const rateLimitKey = getRateLimitKey(clientIp, "semantic-scholar");
          if (!checkRateLimit(rateLimitKey, 3, 1000)) {
            res.statusCode = 429;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Retry-After", "1");
            res.end(JSON.stringify({ error: "Rate limited. Try again in 1 second." }));
            return;
          }

          const query = parsed.searchParams.get("query")?.trim();
          if (!query) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing query" }));
            return;
          }

          const upstreamUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=15&fields=title,abstract,year,venue,citationCount,openAccessPdf,externalIds,authors,url`;
          try {
            const upstream = await fetchWithRetry(upstreamUrl, {}, 3, 3000); // 3s base delay for semantic scholar
            const body = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(body);
            return;
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({ error: "Failed to resolve Semantic Scholar", detail: error instanceof Error ? error.message : "Unknown error" })
            );
            return;
          }
        }

        if (parsed.pathname === "/api/core") {
          const rateLimitKey = getRateLimitKey(clientIp, "core");
          if (!checkRateLimit(rateLimitKey, 10, 60000)) { // 10 reqs per minute (200k/day = ~140/min)
            res.statusCode = 429;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Retry-After", "60");
            res.end(JSON.stringify({ error: "Rate limited. Try again in 60 seconds." }));
            return;
          }

          const query = parsed.searchParams.get("query")?.trim();
          if (!query) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing query" }));
            return;
          }

          const headers: Record<string, string> = {};
          if (coreApiKey) {
            headers["Authorization"] = `Bearer ${coreApiKey}`;
          }

          const upstreamUrl = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&limit=20`;
          try {
            const upstream = await fetchWithRetry(upstreamUrl, { headers }, 3, 2000);
            const body = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(body);
            return;
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Failed to resolve CORE", detail: error instanceof Error ? error.message : "Unknown error" }));
            return;
          }
        }

        if (parsed.pathname === "/api/zenodo") {
          const query = parsed.searchParams.get("query")?.trim();
          if (!query) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing query" }));
            return;
          }

          const upstreamUrl = `https://zenodo.org/api/records/?q=${encodeURIComponent(query)}&size=20`;
          try {
            const upstream = await fetch(upstreamUrl);
            const body = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(body);
            return;
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Failed to resolve Zenodo", detail: error instanceof Error ? error.message : "Unknown error" }));
            return;
          }
        }

        if (parsed.pathname === "/api/unpaywall") {
          const doi = parsed.searchParams.get("doi");
          if (!doi) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing doi query param" }));
            return;
          }

          if (!unpaywallEmail) {
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "UNPAYWALL_EMAIL not configured" }));
            return;
          }

          try {
            const upstream = await fetch(
              `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(unpaywallEmail)}`
            );
            const body = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json");
            res.end(body);
            return;
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Failed to resolve Unpaywall", detail: error instanceof Error ? error.message : "Unknown error" }));
            return;
          }
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), localApiPlugin(env.UNPAYWALL_EMAIL, env.CORE_API_KEY, env.OPENALEX_API_KEY)].filter(Boolean),
    build: {
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            query: ["@tanstack/react-query", "@tanstack/query-core"],
            motion: ["framer-motion", "gsap"],
            icons: ["lucide-react", "@hugeicons/react", "@hugeicons/core-free-icons"],
            radix: [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-tooltip",
              "@radix-ui/react-popover",
              "@radix-ui/react-select",
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
