// Sentry — browser init. Runs after the document loads, before React hydration.
// No-op until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Session Replay: record nothing normally, but capture a full replay of the
      // session whenever an error fires — so you can watch what the user did.
      // Text + media are masked by default for privacy.
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0, // don't record normal sessions
    replaysOnErrorSampleRate: 1.0, // record 100% of sessions that hit an error
    sendDefaultPii: true,
    enabled: process.env.NODE_ENV === "production",
  });
}

// Adds navigation breadcrumbs / ties traces to client-side route changes.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
