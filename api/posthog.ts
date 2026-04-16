/**
 * Lightweight PostHog client for Vercel Edge Runtime.
 * Uses native fetch to avoid Node.js-specific dependencies.
 */

export type PostHogEvent = {
  distinctId: string;
  event: string;
  properties?: Record<string, any>;
  timestamp?: number;
};

export function createPostHogClient() {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || "https://us.posthog.com";

  return {
    captureImmediate: async (event: PostHogEvent) => {
      if (!apiKey) return;

      try {
        await fetch(`${host}/capture/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: apiKey,
            event: event.event,
            distinct_id: event.distinctId,
            properties: {
              ...event.properties,
              $lib: "kumo-edge",
            },
            timestamp: event.timestamp || new Date().toISOString(),
          }),
        });
      } catch (err) {
        console.error("PostHog Edge Capture Error:", err);
      }
    },
    captureException: async (error: unknown, distinctId: string, properties?: Record<string, any>) => {
      if (!apiKey) return;

      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      await fetch(`${host}/capture/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          event: "exception",
          distinct_id: distinctId,
          properties: {
            ...properties,
            message,
            stack,
            $lib: "kumo-edge",
          },
        }),
      });
    },
    shutdown: async () => {
      // No-op for fetch-based client
    },
  };
}

export const POSTHOG_CONFIG = {
  autocapture: true,
  capturePageview: true,
  capturePageleave: true,
  decodeRouteParams: true,
};