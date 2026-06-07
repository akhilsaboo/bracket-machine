import Link from "next/link";

export const metadata = {
  title: "FAQ — World Cup 2026 Bracket Machine",
};

const CONTACT_EMAIL = "akoolsaboo@gmail.com";

interface QA {
  q: string;
  a: React.ReactNode;
}

const FAQS: QA[] = [
  {
    q: "What is World Cup 2026 Bracket Machine?",
    a: (
      <>
        A live, interactive bracket for the 2026 FIFA World Cup. Pick scores for every group-stage match, watch
        standings recompute instantly with full FIFA tiebreakers, and your knockout bracket builds itself via the
        official Annex C allocation. Compete with friends in pools.
      </>
    ),
  },
  {
    q: "Is this affiliated with FIFA?",
    a: (
      <>
        No. This is an independent fan project. We aren't affiliated with, endorsed by, or sponsored by FIFA, any
        federation, or any broadcaster. Team names and fixtures are referenced for informational and entertainment
        purposes only.
      </>
    ),
  },
  {
    q: "How does scoring work?",
    a: (
      <>
        <strong>Group stage (per match):</strong>
        <ul className="ml-5 list-disc">
          <li>Exact score: <span className="font-bold text-emerald-600 dark:text-emerald-400">+10</span></li>
          <li>Correct outcome (right winner/draw, wrong score): <span className="font-bold text-amber-600 dark:text-amber-400">+5</span></li>
        </ul>
        <strong className="mt-2 block">Knockout (per correct match winner):</strong>
        <ul className="ml-5 list-disc">
          <li>Round of 32: +20</li>
          <li>Round of 16: +40</li>
          <li>Quarter-finals: +80</li>
          <li>Semi-finals: +160</li>
          <li>Third-place playoff: +160</li>
          <li>Final (champion): +320</li>
        </ul>
        <p className="mt-2">
          Tiebreakers, in order: <em>total points</em> → <em>knockout points</em> → <em>exact-score count</em> → <em>tiebreaker total-goals predicted</em>.
        </p>
      </>
    ),
  },
  {
    q: "When does my bracket lock?",
    a: (
      <>
        Each match locks individually at its kickoff time — you can edit any prediction up until the second its match starts.
        Once it kicks off, that row turns red and drops to the bottom of the schedule. Once the actual result is known,
        the pick gets graded green ★ (exact) / yellow ✓ (correct) / red ✗ (wrong).
      </>
    ),
  },
  {
    q: "How do friend pools / leaderboards work?",
    a: (
      <>
        Go to the <strong>Pools</strong> tab and <strong>join a pool</strong> with an invite code (something like{" "}
        <code>Z9U8XX</code>) or the shareable link (<code>bracketmachine.app/?join=Z9U8XX</code>) someone sends you —
        you sign in and one click joins you. Everyone's bracket counts on the same leaderboard.
      </>
    ),
  },
  {
    q: "Can I see other members' brackets?",
    a: (
      <>
        Only after the knockout round begins (June 28, 2026). Before then, while group stages are still being
        predicted and edited up to kickoff, everyone's picks are private. From R32 onward, tap any member's row on
        the leaderboard to see their full knockout bracket — read-only, with grading.
      </>
    ),
  },
  {
    q: "Why don't I see other members' group-stage scores?",
    a: (
      <>
        On purpose. Group-stage picks can be edited up until each match kicks off, so showing them to other members
        early would be both noisy and a privacy leak. The bracket — which is what really matters for the leaderboard —
        reveals once the knockout phase starts.
      </>
    ),
  },
  {
    q: "Is my password / data safe?",
    a: (
      <>
        Yes. Passwords are <strong>never stored in plaintext</strong>. Our backend (Supabase) hashes them with bcrypt
        and stores only the hash; nobody — including us — can read your password. Brackets are stored in your account
        with Row Level Security, so only you and your pool-mates (after the bracket unlocks) can see your data. See
        the <Link href="/privacy" className="underline">Privacy Policy</Link> for details.
      </>
    ),
  },
  {
    q: "Can I have multiple brackets?",
    a: (
      <>
        Not yet — one bracket per account today. Multi-bracket support is on the roadmap so you can keep a "real" pick
        alongside a chaos pick for different pools.
      </>
    ),
  },
  {
    q: "I forgot my password / want to delete my account.",
    a: (
      <>
        Email <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address tied to
        your account and we'll handle it within 7 days.
      </>
    ),
  },
  {
    q: "How does the bracket actually get built from my group picks?",
    a: (
      <>
        The full FIFA tiebreaker cascade (head-to-head → overall GD → goals scored → fair play → FIFA ranking) ranks
        each group; the top 2 + best 8 third-placed teams advance via the official <em>Annex C</em> matchup table (495
        scenarios — yes, all of them). The engine is the same one used in the Python reference implementation, ported
        to TypeScript and validated against shared test vectors. So: it's correct.
      </>
    ),
  },
  {
    q: "Why does Google sign-in show 'World Cup 2026 Bracket Machine' now (used to be something weird)?",
    a: (
      <>
        Earlier the consent screen showed the underlying backend's URL. After Google verified the app's brand, the
        consent screen now shows the app name and logo. Cosmetic but professional.
      </>
    ),
  },
];

export default function FAQPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
      <Link href="/" className="text-xs text-[var(--wc-accent)] hover:underline">
        ← Back to the app
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
        Frequently asked questions
      </h1>
      <p className="mt-2 text-xs text-slate-500">
        Don't see your question?{" "}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
          Email us.
        </a>
      </p>

      <div className="mt-8 space-y-6">
        {FAQS.map((item, i) => (
          <section key={i} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{item.q}</h2>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.a}</div>
          </section>
        ))}
      </div>
    </article>
  );
}
