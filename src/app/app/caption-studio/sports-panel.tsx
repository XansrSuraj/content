"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CalendarClock, ExternalLink, Link2, RefreshCw, Trophy } from "lucide-react";
import type { MatchSnapshot, SportsContextUsed } from "@/lib/db/schema";
import { useI18n } from "@/components/i18n-provider";
import { Badge, Button, Input, Notice, Select, formatDateTime } from "@/components/ui";

const PROVIDER_NAME: Record<string, string> = { openfootball: "openfootball", football_data: "football-data.org", cricapi: "CricketData.org" };

const STAGE_TONE = { upcoming: "info", live: "ok", completed: "neutral", postponed: "warn", cancelled: "warn", unknown: "warn" } as const;

export interface SportsPanelHandle {
  /** Re-checks the attached match's stage (called when the creator copies a caption). */
  check: () => void;
}

export const SportsPanel = forwardRef<
  SportsPanelHandle,
  {
    sports: SportsContextUsed;
    isLatest: boolean;
    onChooseMatch: (matchId: string, vs: string) => void;
    onRefresh: () => void;
  }
>(function SportsPanel({ sports, isLatest, onChooseMatch, onRefresh }, ref) {
  const { d, lang } = useI18n();
  const t = d.sports;
  const [current, setCurrent] = useState<MatchSnapshot | null>(null);
  const [adding, setAdding] = useState(false);
  const lastCheck = useRef(0);
  const match = sports.match;

  const check = useCallback(() => {
    if (!match || !isLatest) return;
    if (Date.now() - lastCheck.current < 30_000) return;
    lastCheck.current = Date.now();
    fetch(`/api/sports/matches/${match.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.match && setCurrent(j.match))
      .catch(() => undefined);
  }, [match, isLatest]);

  useImperativeHandle(ref, () => ({ check }), [check]);
  useEffect(() => {
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [check]);

  if (!sports.sport && !match && sports.references.length === 0) return null;
  const changed = match && current && current.stage !== match.stage;

  return (
    <div className="rounded-lg border border-line p-3 text-sm">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Trophy aria-hidden className="h-3.5 w-3.5" />
        {t.title}
      </p>

      {changed && (
        <Notice tone="warn" title={t.changedTitle} className="mb-2">
          <p>{t.changed(t.stage[match.stage], t.stage[current.stage])}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={onRefresh}>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            {t.refresh}
          </Button>
        </Notice>
      )}

      {match ? (
        <MatchLine m={current ?? match} />
      ) : sports.candidates.length > 0 ? (
        <div>
          <p className="font-semibold">{t.whichMatch}</p>
          <p className="text-xs text-muted">{t.whichMatchHint}</p>
          <ul className="mt-2 space-y-1.5">
            {sports.candidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => onChooseMatch(c.id, `${c.homeName} vs ${c.awayName}`)}>
                  {t.useThis}
                </Button>
                <span>
                  {c.homeName} vs {c.awayName}
                </span>
                <Badge tone={STAGE_TONE[c.stage]}>{t.stage[c.stage]}</Badge>
                <span className="text-xs text-muted">{formatDateTime(c.startsAt, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : sports.sport ? (
        <p className="text-xs text-muted">{t.noFixture}</p>
      ) : null}

      {sports.sport && !match && (
        adding ? (
          <AddMatchForm
            sport={sports.sport}
            home={sports.teams[0] ?? ""}
            away={sports.teams[1] ?? ""}
            onCancel={() => setAdding(false)}
            onSaved={(id, vs) => {
              setAdding(false);
              onChooseMatch(id, vs);
            }}
          />
        ) : (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAdding(true)}>
            {t.notListed}
          </Button>
        )
      )}

      {sports.references.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold">{t.references}</p>
          <ul className="mt-1 space-y-1 text-xs">
            {sports.references.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5">
                <Link2 aria-hidden className="h-3 w-3 text-muted" />
                <span className="font-medium">{r.topic}</span>
                <span className="text-muted">
                  · {r.platform} · {r.evidenceType === "creator_reference" ? t.refCreator : t.refTool(r.sourceTool)}
                </span>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand" aria-label={r.topic}>
                    <ExternalLink aria-hidden className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

function MatchLine({ m }: { m: MatchSnapshot }) {
  const { d, lang } = useI18n();
  const t = d.sports;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {m.homeName} vs {m.awayName}
        </span>
        <Badge tone={STAGE_TONE[m.stage]}>{t.stage[m.stage]}</Badge>
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
        <CalendarClock aria-hidden className="h-3 w-3" />
        {m.competition} · {t.startsAt(formatDateTime(m.startsAt, lang))}
      </p>
      {m.stage === "completed" && m.resultSummary && <p className="mt-1 text-xs">{m.resultSummary}</p>}
      <p className="mt-1 text-[11px] text-muted">
        {m.statusSource === "creator" ? t.creatorEntered : `${t.source(PROVIDER_NAME[m.provider] ?? m.provider)} · ${t.checked(formatDateTime(m.statusCheckedAt, lang))}`}
        {m.statusSource === "schedule_only" ? ` · ${t.scheduleOnly}` : ""}
      </p>
    </div>
  );
}

function AddMatchForm({
  sport,
  home,
  away,
  onCancel,
  onSaved,
}: {
  sport: "cricket" | "football";
  home: string;
  away: string;
  onCancel: () => void;
  onSaved: (id: string, vs: string) => void;
}) {
  const { d } = useI18n();
  const t = d.sports;
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const [f, setF] = useState({
    sport,
    home,
    away,
    competition: "",
    date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    time: "19:30",
    status: "scheduled",
    result: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    setError(false);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    const res = await fetch("/api/sports/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, timezone }),
    }).catch(() => null);
    setBusy(false);
    const j = res?.ok ? await res.json().catch(() => null) : null;
    if (!j?.match) return setError(true);
    onSaved(j.match.id, `${f.home} vs ${f.away}`);
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-surface-2 p-3">
      <p className="text-sm font-semibold">{t.addTitle}</p>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label={t.sport} value={f.sport} onChange={(e) => set("sport", e.target.value)}>
          <option value="cricket">{t.sportNames.cricket}</option>
          <option value="football">{t.sportNames.football}</option>
        </Select>
        <Select aria-label={t.status} value={f.status} onChange={(e) => set("status", e.target.value)}>
          {Object.entries(t.statusOpts).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input aria-label={t.home} placeholder={t.home} value={f.home} maxLength={60} onChange={(e) => set("home", e.target.value)} />
        <Input aria-label={t.away} placeholder={t.away} value={f.away} maxLength={60} onChange={(e) => set("away", e.target.value)} />
        <Input aria-label={t.date} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
        <Input aria-label={t.time} type="time" value={f.time} onChange={(e) => set("time", e.target.value)} />
      </div>
      <Input aria-label={t.competition} placeholder={t.competition} value={f.competition} maxLength={80} onChange={(e) => set("competition", e.target.value)} />
      {f.status === "finished" && (
        <Input aria-label={t.result} placeholder={t.result} value={f.result} maxLength={160} onChange={(e) => set("result", e.target.value)} />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || f.home.trim().length < 2 || f.away.trim().length < 2}>
          {busy ? t.saving : t.saveRefresh}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {d.common.cancel}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {t.addFailed}
        </p>
      )}
    </div>
  );
}
