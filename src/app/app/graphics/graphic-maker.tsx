"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { MatchSnapshot } from "@/lib/db/schema";
import { useI18n } from "@/components/i18n-provider";
import { Button, Field, Input, Notice, Select, cx } from "@/components/ui";

export type GraphicTemplate = "matchday" | "countdown" | "poll" | "result";
type Format = "square" | "portrait" | "story";

const SIZES: Record<Format, [number, number]> = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920] };
const BRAND_KEY = "ts_graphic_brand";

interface Brand {
  primary: string;
  accent: string;
  handle: string;
}

function loadBrand(): Brand {
  try {
    const raw = localStorage.getItem(BRAND_KEY);
    if (raw) return { primary: "#1e1b4b", accent: "#f59e0b", handle: "", ...JSON.parse(raw) };
  } catch {
    // Storage blocked: defaults are fine.
  }
  return { primary: "#1e1b4b", accent: "#f59e0b", handle: "" };
}

/** Largest font size (down from `size`) at which `text` fits in `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, weight = 800): number {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px system-ui, "Segoe UI", "Noto Sans", "Noto Sans Devanagari", sans-serif`;
    if (ctx.measureText(text).width <= max) return s;
    s -= 4;
  } while (s > 18);
  return s;
}

function line(ctx: CanvasRenderingContext2D, text: string, y: number, w: number, size: number, color: string, weight = 800) {
  fit(ctx, text, w - 140, size, weight);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, y);
}

export interface GraphicText {
  matchday: string;
  whoWins: string;
  voteHint: string;
  daysToGo: (n: number) => string;
  hoursToGo: (n: number) => string;
  startsNow: string;
  fullTime: string;
  vs: string;
}

export function draw(
  canvas: HTMLCanvasElement,
  opts: { template: GraphicTemplate; format: Format; match: MatchSnapshot; brand: Brand; score: [string, string]; text: GraphicText; kickoff: string; now: Date },
) {
  const [w, h] = SIZES[opts.format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { brand, match: m, text: t } = opts;
  // Background: brand gradient with a diagonal accent band.
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, brand.primary);
  g.addColorStop(1, "#0b1020");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = brand.accent;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  ctx.lineTo(w, h * 0.38);
  ctx.lineTo(w, h * 0.5);
  ctx.lineTo(0, h * 0.74);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cy = h / 2;
  const top = opts.template === "matchday" ? t.matchday : opts.template === "poll" ? t.whoWins : opts.template === "result" ? t.fullTime : countdownLabel(m, opts.now, t);
  // Header label in an accent pill.
  ctx.font = `800 ${Math.round(w * 0.05)}px system-ui, sans-serif`;
  const pillW = Math.min(w - 120, ctx.measureText(top).width + 90);
  ctx.fillStyle = brand.accent;
  roundRect(ctx, (w - pillW) / 2, cy - h * 0.3 - 50, pillW, 100, 50);
  ctx.fill();
  line(ctx, top, cy - h * 0.3, w, Math.round(w * 0.05), "#0b1020");

  if (opts.template === "result") {
    line(ctx, m.homeName, cy - 170, w, 88, "#ffffff");
    line(ctx, `${opts.score[0] || "–"}  :  ${opts.score[1] || "–"}`, cy, w, 190, brand.accent, 900);
    line(ctx, m.awayName, cy + 170, w, 88, "#ffffff");
  } else {
    line(ctx, m.homeName, cy - 130, w, 96, "#ffffff");
    line(ctx, t.vs, cy, w, 64, brand.accent, 900);
    line(ctx, m.awayName, cy + 130, w, 96, "#ffffff");
  }

  const info = opts.template === "poll" ? t.voteHint : opts.kickoff;
  line(ctx, info, cy + h * 0.25, w, 44, "#e5e7eb", 600);
  line(ctx, m.competition, cy + h * 0.25 + 64, w, 34, "#cbd5e1", 500);
  if (brand.handle.trim()) line(ctx, brand.handle.trim(), h - 70, w, 34, brand.accent, 700);
}

function countdownLabel(m: MatchSnapshot, now: Date, t: GraphicText): string {
  const ms = new Date(m.startsAt).getTime() - now.getTime();
  if (ms <= 0) return t.startsNow;
  const hours = Math.ceil(ms / 3_600_000);
  return hours >= 48 ? t.daysToGo(Math.floor(hours / 24)) : t.hoursToGo(hours);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function GraphicMaker({ matches, initialMatchId }: { matches: MatchSnapshot[]; initialMatchId: string | null }) {
  const { d, lang } = useI18n();
  const t = d.graphics;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [matchId, setMatchId] = useState(initialMatchId ?? matches[0]?.id ?? "");
  const [template, setTemplate] = useState<GraphicTemplate>("matchday");
  const [format, setFormat] = useState<Format>("portrait");
  const [brand, setBrand] = useState<Brand>({ primary: "#1e1b4b", accent: "#f59e0b", handle: "" });
  const [score, setScore] = useState<[string, string]>(["", ""]);
  const match = matches.find((m) => m.id === matchId) ?? matches[0];
  const verifiedResult = match?.stage === "completed" && match.statusSource === "provider";

  // The saved brand loads after hydration so the server and first client render match.
  useEffect(() => {
    const saved = loadBrand();
    const id = requestAnimationFrame(() => setBrand(saved));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
    } catch {
      // Not saved; the graphic still renders.
    }
  }, [brand]);

  const kickoff = useMemo(
    () => (match ? new Intl.DateTimeFormat(lang === "english" ? "en-IN" : "hi-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(match.startsAt)) : ""),
    [match, lang],
  );

  useEffect(() => {
    if (!match || !canvasRef.current) return;
    draw(canvasRef.current, { template, format, match, brand, score, text: t.canvas, kickoff, now: new Date() });
  }, [template, format, match, brand, score, t, kickoff]);

  if (!match) return <Notice tone="info" title={t.noMatchesTitle}>{t.noMatchesText}</Notice>;

  const download = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${match.homeName}-vs-${match.awayName}-${template}-${format}.png`.replace(/[^\p{L}\p{N}.-]+/gu, "-");
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Field label={t.match} htmlFor="g-match">
          <Select id="g-match" value={match.id} onChange={(e) => setMatchId(e.target.value)}>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.homeName} vs {m.awayName}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t.template}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["matchday", "countdown", "poll", "result"] as GraphicTemplate[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={template === k}
                onClick={() => setTemplate(k)}
                className={cx("rounded-lg border px-3 py-2 text-left text-sm", template === k ? "border-brand bg-brand-soft text-brand-ink" : "border-line hover:border-brand/60")}
              >
                <span className="block font-semibold">{t.templates[k].t}</span>
                <span className="block text-xs text-muted">{t.templates[k].d}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {template === "result" && (
          <div>
            <Notice tone={verifiedResult ? "info" : "warn"} title={verifiedResult ? t.resultVerified : t.resultOnlyAfter}>
              {t.resultNote}
            </Notice>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label={match.homeName} htmlFor="g-s1">
                <Input id="g-s1" inputMode="numeric" maxLength={9} value={score[0]} onChange={(e) => setScore([e.target.value, score[1]])} />
              </Field>
              <Field label={match.awayName} htmlFor="g-s2">
                <Input id="g-s2" inputMode="numeric" maxLength={9} value={score[1]} onChange={(e) => setScore([score[0], e.target.value])} />
              </Field>
            </div>
          </div>
        )}
        <Field label={t.format} htmlFor="g-format">
          <Select id="g-format" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {(["square", "portrait", "story"] as Format[]).map((f) => (
              <option key={f} value={f}>
                {t.formats[f]}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-2 text-sm font-semibold">{t.brand}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="color" value={brand.primary} onChange={(e) => setBrand({ ...brand, primary: e.target.value })} aria-label={t.primaryColor} />
            {t.primaryColor}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="color" value={brand.accent} onChange={(e) => setBrand({ ...brand, accent: e.target.value })} aria-label={t.accentColor} />
            {t.accentColor}
          </label>
        </fieldset>
        <Field label={t.handle} htmlFor="g-handle">
          <Input id="g-handle" maxLength={40} placeholder="@yourchannel" value={brand.handle} onChange={(e) => setBrand({ ...brand, handle: e.target.value })} />
        </Field>
        <Button onClick={download} className="w-full">
          <Download aria-hidden className="h-4 w-4" />
          {t.download}
        </Button>
        <p className="text-xs text-muted">{t.privacy}</p>
      </div>
      <div className="flex justify-center rounded-xl border border-line bg-surface-2 p-4">
        <canvas ref={canvasRef} aria-label={t.previewLabel} className="h-auto max-h-[78vh] w-auto max-w-full rounded-lg shadow" />
      </div>
    </div>
  );
}
