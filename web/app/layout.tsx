import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PredictionProvider } from "@/lib/predictions";
import { AuthProvider } from "@/lib/auth";
import { ProfileProvider } from "@/lib/profile";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bracketmachine.app"),
  title: "World Cup 2026 Bracket Machine",
  description:
    "Predict every group-stage score and watch your 2026 World Cup knockout bracket build itself — live, with full FIFA tiebreakers.",
  verification: {
    // Both Search Console properties: the new bracketmachine.app and the
    // legacy vercel.app one (harmless to keep).
    google: [
      "EdWMqkGn1f0_ZYnfYOk0G9g72n7Y0Ur_RUeyNxKTqB0",
      "hipCuD3X0nwhLqg0qUP7NphYaqt3vg9IsWc8k5fBRM8",
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthProvider>
          <ProfileProvider>
            <PredictionProvider>{children}</PredictionProvider>
          </ProfileProvider>
        </AuthProvider>
        <footer className="border-t border-slate-200 px-4 py-4 text-center text-[11px] text-slate-400 dark:border-slate-800">
          <a href="/faq" className="hover:text-[var(--wc-accent)]">FAQ</a>
          {" · "}
          <a href="/privacy" className="hover:text-[var(--wc-accent)]">Privacy</a>
          {" · "}
          <a href="/terms" className="hover:text-[var(--wc-accent)]">Terms</a>
          {" · "}
          <span>Not affiliated with FIFA</span>
        </footer>
      </body>
    </html>
  );
}
