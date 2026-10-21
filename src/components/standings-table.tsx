import type { StandingRow } from "@/lib/db/schema";
import { cx } from "@/components/ui";

/** A compact league table; `highlight` marks rows (e.g. the two teams of a match). */
export function StandingsTable({
  rows,
  cols,
  highlight = [],
  limit,
}: {
  rows: StandingRow[];
  cols: { pos: string; team: string; played: string; gd: string; pts: string };
  highlight?: string[];
  limit?: number;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="w-8 py-2 pr-2 text-right font-semibold">
              {cols.pos}
            </th>
            <th scope="col" className="py-2 pl-2 font-semibold">
              {cols.team}
            </th>
            <th scope="col" className="w-10 py-2 text-right font-semibold">
              {cols.played}
            </th>
            <th scope="col" className="w-12 py-2 text-right font-semibold">
              {cols.gd}
            </th>
            <th scope="col" className="w-12 py-2 pr-1 text-right font-semibold">
              {cols.pts}
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.position + r.team} className={cx("border-b border-line/60 last:border-0", highlight.includes(r.team) && "bg-brand-soft/50 font-semibold")}>
              <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{r.position}</td>
              <td className="truncate py-1.5 pl-2">{r.team}</td>
              <td className="py-1.5 text-right tabular-nums">{r.played}</td>
              <td className="py-1.5 text-right tabular-nums">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
              <td className="py-1.5 pr-1 text-right font-semibold tabular-nums">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
