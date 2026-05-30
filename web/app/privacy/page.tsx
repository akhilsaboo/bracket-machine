import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — World Cup 2026 Bracket Machine",
};

const LAST_UPDATED = "May 29, 2026";
const CONTACT_EMAIL = "akoolsaboo@gmail.com";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
      <Link href="/" className="text-xs text-[var(--wc-accent)] hover:underline">
        ← Back to the app
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
        Privacy Policy
      </h1>
      <p className="mt-1 text-xs text-slate-500">Last updated: {LAST_UPDATED}</p>

      <p className="mt-6">
        World Cup 2026 Bracket Machine ("we", "our", or "the app") is a free hobby
        project that lets you predict the 2026 FIFA World Cup. This policy explains
        what we collect, why, and your rights over your data.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>Account info.</strong> Your email address. If you sign in with
          Google, we also receive your name and profile picture from Google.
        </li>
        <li>
          <strong>Bracket data.</strong> The match scores and knockout picks you
          enter, plus your tiebreaker number when you submit.
        </li>
        <li>
          <strong>Technical cookies.</strong> Authentication cookies set by our
          backend (Supabase) to keep you signed in. No third-party analytics or
          advertising trackers.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">How we use it</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>To save your bracket to your account and let you access it across devices.</li>
        <li>To enable friend leagues / leaderboards when those features launch.</li>
        <li>To respond to support questions you send us.</li>
      </ul>
      <p className="mt-2">
        We do not use your data for advertising, profiling, or any other purpose.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Where it's stored</h2>
      <p className="mt-2">
        Your account and bracket data is stored in Supabase (US-hosted Postgres)
        with Row Level Security policies that prevent any other user from reading
        your bracket. The app itself is hosted on Vercel. We do not store your
        password — Supabase handles password hashing and authentication.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Sharing</h2>
      <p className="mt-2">
        We don't sell, rent, or share your personal data with third parties. The
        only third parties that ever see your data are the infrastructure
        providers we use to run the app (Supabase for storage/auth, Vercel for
        hosting, Google if you choose to sign in with Google).
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Your rights</h2>
      <p className="mt-2">
        You can delete your account and all associated bracket data at any time
        by emailing us at <a className="text-[var(--wc-accent)] underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from
        the email address tied to your account. We'll process the deletion within
        7 days.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Children</h2>
      <p className="mt-2">
        The app is not directed at children under 13 and we do not knowingly
        collect data from them.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Changes</h2>
      <p className="mt-2">
        If we materially change this policy we'll update the "Last updated" date
        and surface a notice in the app.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Contact</h2>
      <p className="mt-2">
        Questions about this policy or your data:{" "}
        <a className="text-[var(--wc-accent)] underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </article>
  );
}
