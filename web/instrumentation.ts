// Next.js server instrumentation hook. Loads the right Sentry init per runtime and
// forwards server-side errors (Server Components, Route Handlers, Server Actions)
// to Sentry via onRequestError.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown during server rendering / route handling.
export const onRequestError = Sentry.captureRequestError;
