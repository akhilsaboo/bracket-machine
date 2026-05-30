import { gd, points, type StandingRow } from "@/lib/engine";
import { flag } from "@/lib/flags";

const QUALIFY = "border-l-2 border-l-emerald-500";
const THIRD = "border-l-2 border-l-amber-400";

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr className="text-slate-400">
          <th className="py-1 text-left font-medium">#</th>
          <th className="py-1 text-left font-medium">Team</th>
          <th className="w-6 py-1 text-center font-medium" title="Played">P</th>
          <th className="w-6 py-1 text-center font-medium" title="Goal difference">GD</th>
          <th className="w-7 py-1 text-center font-semibold" title="Points">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const rec = r.record;
          const accent = i < 2 ? QUALIFY : i === 2 ? THIRD : "border-l-2 border-l-transparent";
          return (
            <tr key={rec.team.code} className={`${accent} border-b border-slate-100 last:border-0 dark:border-slate-800`}>
              <td className="py-1 pl-1 text-slate-400">{r.rank}</td>
              <td className="py-1">
                <span className="mr-1">{flag(rec.team.code)}</span>
                {rec.team.name}
              </td>
              <td className="py-1 text-center">{rec.played}</td>
              <td className="py-1 text-center">{gd(rec) > 0 ? `+${gd(rec)}` : gd(rec)}</td>
              <td className="py-1 text-center font-semibold">{points(rec)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
