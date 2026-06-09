import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  devIndicators: false,
};

// Wraps the build to upload source maps (readable stack traces) and route Sentry
// events through your own domain to dodge ad-blockers. Source-map upload only runs
// when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set at build time, so
// local/dev builds are unaffected.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  telemetry: false,
});
