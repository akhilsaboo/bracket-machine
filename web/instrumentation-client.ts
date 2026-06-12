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
    // Drop noise that isn't our app: scripts the browser itself injects (Brave/
    // Firefox-iOS inject content scripts under window.__firefox__ that throw before
    // their global is ready), plus a few universally non-actionable errors.
    ignoreErrors: [
      // Brave / Firefox-iOS injected content scripts (window.__firefox__).
      /__firefox__/,
      "Can't find variable: __firefox__",
      /refresh_youtube_quality/,
      // Crypto-wallet extensions (MetaMask, Coinbase, Brave Wallet) inject
      // window.ethereum / web3 / solana and throw setting up their provider.
      /ethereum/i,
      /web3/i,
      /solana/i,
      "Cannot redefine property: ethereum",
      // Browser/webview blocks storage (private mode, in-app webviews, strict
      // privacy). The app already degrades to guest mode — these are environment,
      // not bugs, and can't be fixed in code.
      /localStorage/,
      /sessionStorage/,
      "Access is denied for this document",
      "The request was denied",
      // Universally non-actionable noise.
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      /^Non-Error promise rejection captured/,
    ],
    // Errors thrown from browser-extension / injected contexts.
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-(web-)?extension:\/\//],
  });
}

// Adds navigation breadcrumbs / ties traces to client-side route changes.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
