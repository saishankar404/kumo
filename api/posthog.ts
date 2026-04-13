import { PostHog } from "posthog-node";

export function createPostHogClient(): PostHog {
  return new PostHog(process.env.POSTHOG_API_KEY ?? "", {
    host: process.env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });
}

export const POSTHOG_CONFIG = {
  autocapture: true,
  capturePageview: true,
  capturePageleave: true,
  decodeRouteParams: true,
};