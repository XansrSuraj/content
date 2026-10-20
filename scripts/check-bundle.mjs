/**
 * Fails if secret-shaped values, configured secret values, or markers of server-only
 * modules (system prompts, DB drivers, password hashing) appear in the browser bundle (.next/static).
 * Env variable *names* may appear in help text and are allowed.
 * Run after `npm run build`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), ".next", "static");
const patterns = [
  /sk-ant-[A-Za-z0-9_-]{10,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /You are the caption assistant inside TrendSaathi/,
  /You are the content-brief assistant inside TrendSaathi/,
  /scrypt\$/,
  /drizzle-orm\/node-postgres/,
  /@electric-sql\/pglite/,
];
const secrets = ["ANTHROPIC_API_KEY", "YOUTUBE_API_KEY", "INGEST_SECRET"].map((k) => process.env[k]).filter((v) => v && v.length >= 12);

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|css|html|json|txt)$/.test(f)) yield p;
  }
}

let problems = 0;
let files = 0;
for (const file of walk(root)) {
  files++;
  const text = readFileSync(file, "utf8");
  for (const re of patterns) if (re.test(text)) { console.error(`Found ${re} in ${file}`); problems++; }
  for (const s of secrets) if (text.includes(s)) { console.error(`Found a configured secret value in ${file}`); problems++; }
}
console.log(`Scanned ${files} client files.`);
if (problems) process.exit(1);
console.log("No secrets or server-only code markers found in the client bundle.");
