"use client";

// Top-level React error boundary. Catches render errors anywhere in the tree,
// reports them to Sentry, and shows a minimal recover screen. (Replaces the whole
// document, so it ships its own <html>/<body>.)
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0f172a",
          color: "#e2e8f0",
          margin: 0,
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ opacity: 0.8, marginBottom: "1.5rem" }}>
            We&apos;ve been notified and are looking into it.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#fff",
              color: "#0f172a",
              border: "none",
              borderRadius: "9999px",
              padding: "0.6rem 1.4rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
