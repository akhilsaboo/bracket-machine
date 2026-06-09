// Sentry — Edge runtime init (middleware / edge routes). Loaded by instrumentation.ts.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: true,
    enabled: process.env.NODE_ENV === "production",
  });
}
