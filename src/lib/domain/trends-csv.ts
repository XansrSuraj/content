/**
 * Parses the "Related queries" / "Related topics" CSV that Google Trends Explore
 * exports (e.g. with the "YouTube Search" filter). Format varies a little across
 * versions, so this is tolerant: it tracks TOP/RISING sections and reads
 * "query,value" rows where value is a number, "+250%" or "Breakout".
 */

export interface TrendsCsvRow {
  query: string;
  section: "top" | "rising";
  /** 0–100 relative interest (top) or percentage increase (rising); null for "Breakout". */
  value: number | null;
  label: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** A real Google Trends export has a TOP/RISING section or the "Category:" header line. */
export function looksLikeTrendsCsv(text: string): boolean {
  return /(^|\n)\s*"?(TOP|RISING|Category:|Top queries|Rising queries)/i.test(text.replace(/^﻿/, ""));
}

export function parseTrendsCsv(text: string, max = 100): TrendsCsvRow[] {
  const rows: TrendsCsvRow[] = [];
  let section: "top" | "rising" = "top";
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const upper = line.replace(/"/g, "").toUpperCase();
    if (upper === "TOP" || upper.startsWith("TOP QUERIES") || upper.startsWith("TOP TOPICS")) {
      section = "top";
      continue;
    }
    if (upper === "RISING" || upper.startsWith("RISING QUERIES") || upper.startsWith("RISING TOPICS")) {
      section = "rising";
      continue;
    }
    const cells = splitCsvLine(line);
    if (cells.length < 2) continue;
    const [query, ...rest] = cells;
    if (!query || /^(query|topic|category:|related)/i.test(query)) continue;
    const valueCell = rest.find((c) => /^(\+?[\d,]+%?|breakout)$/i.test(c.replace(/\s/g, "")));
    if (!valueCell) continue;
    const v = valueCell.replace(/\s/g, "");
    const breakout = /^breakout$/i.test(v);
    const num = breakout ? null : Number(v.replace(/[+,%]/g, ""));
    rows.push({ query: query.slice(0, 120), section: v.includes("%") || breakout ? "rising" : section, value: num !== null && Number.isFinite(num) ? num : null, label: v });
    if (rows.length >= max) break;
  }
  return rows;
}
