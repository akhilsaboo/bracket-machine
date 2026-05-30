import Link from "next/link";

export const metadata = {
  title: "Terms of Service — World Cup 2026 Bracket Machine",
};

const LAST_UPDATED = "May 29, 2026";
const CONTACT_EMAIL = "akoolsaboo@gmail.com";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
      <Link href="/" className="text-xs text-[var(--wc-accent)] hover:underline">
        ← Back to the app
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
        Terms of Service
      </h1>
      <p className="mt-1 text-xs text-slate-500">Last updated: {LAST_UPDATED}</p>

      <p className="mt-6">
        By using World Cup 2026 Bracket Machine ("the app") you agree to these
        terms. The app is a free hobby project — please use it in good faith.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">What this is</h2>
      <p className="mt-2">
        A web app for predicting matches of the 2026 FIFA World Cup. It is{" "}
        <strong>not affiliated with, endorsed by, or sponsored by FIFA</strong>,
        any participating federation, or any broadcaster. All team names, fixtures,
        and competition data are referenced for informational and entertainment
        purposes only.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Accounts</h2>
      <p className="mt-2">
        You must be 13 or older to create an account. You agree to provide
        accurate sign-up information and to keep your account credentials secure.
        You're responsible for activity that happens under your account.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Acceptable use</h2>
      <p className="mt-2">
        Don't try to break, reverse-engineer, or abuse the app. Don't use it for
        anything unlawful. Don't impersonate others or harass other users in
        future shared/leaderboard features.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">No gambling</h2>
      <p className="mt-2">
        This is a free prediction game. We don't accept money for entries and we
        don't award cash prizes. The app is not a gambling service.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">As-is, no warranty</h2>
      <p className="mt-2">
        The app is provided "as is" without warranties of any kind. Match
        schedules, scores, and standings shown in the app may contain errors or
        be out of date. We make no guarantee of accuracy.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Limitation of liability</h2>
      <p className="mt-2">
        To the maximum extent permitted by law, we are not liable for any
        indirect, incidental, or consequential damages arising from your use of
        the app.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Termination</h2>
      <p className="mt-2">
        You can delete your account at any time (see the Privacy Policy). We may
        suspend or terminate accounts that violate these terms.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Changes</h2>
      <p className="mt-2">
        If we materially change these terms we'll update the "Last updated" date
        and surface a notice in the app.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900 dark:text-white">Contact</h2>
      <p className="mt-2">
        Questions:{" "}
        <a className="text-[var(--wc-accent)] underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </article>
  );
}
