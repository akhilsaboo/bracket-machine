// Sentry — server (Node.js runtime) init. Loaded once by instrumentation.ts.
// No-op until NEXT_PUBLIC_SENTRY_DSN is set, so local dev stays silent.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // 10% of requests get a performance trace — plenty for a launch, well within
    // the free tier. Bump up if you want more visibility into slow routes.
    tracesSampleRate: 0.1,
    // Attach request headers + IP so you can tell *who/where* an error hit.
    sendDefaultPii: true,
    enabled: process.env.NODE_ENV === "production",
  });
}
