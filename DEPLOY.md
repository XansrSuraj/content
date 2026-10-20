# Deploy TrendSaathi for free (production)

> **Current live deployment:** https://trendsaathi.onrender.com (Render service `trendsaathi`, Ohio), Neon project `content` (US East 2), Groq `openai/gpt-oss-20b`. Pushing to `main` on GitHub redeploys automatically.

This puts the app online with **free tiers only**. No credit card is needed for any of the three services at the time of writing. Total setup time is about 20 minutes. You need three free accounts, which only you can create:

| Piece | Free service | Why this one |
|---|---|---|
| **AI** (open-source models) | [Groq](https://console.groq.com) | Serves open-weight models (OpenAI `gpt-oss-20b`/`120b`, Qwen) with strict JSON output in seconds. Free tier: about 1,000 requests and 200K tokens per day per model (check your limits page). |
| **Database** | [Neon](https://neon.tech) Postgres | Free Postgres that doesn't expire. Render's free Postgres is deleted after 30 days. |
| **Website** | [Render](https://render.com) free web service | Runs the Node server. Vercel's free plan forbids commercial use. |

> **Honest limits of free tiers**
> - **Render free sleeps after 15 minutes without visitors.** The next visit takes about a minute to wake it.
> - **Groq's free tier has daily limits.** When they're reached, creators see a clear "limit reached" message, not broken output.
> - **Groq's terms don't clearly say whether the free tier may serve a commercial product.** Read them, and plan to move to their paid tier (or another host) once you have real users.
> - **The Google Trends RSS feed is free.** Google's terms don't explicitly cover commercial display at scale; get a quick legal check before launch.

---

## 1. Create a Groq API key (AI)

1. Sign up at **console.groq.com**.
2. **API Keys → Create API Key.** Copy it (it starts with `gsk_`).
3. Keep it secret: it goes only into Render's settings, never into code.

## 2. Create a Neon database

1. Sign up at **neon.tech** → **Create project** (region: Singapore or Mumbai if offered).
2. Copy the **connection string**. It looks like `postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.

## 3. Put the code on GitHub

1. Create a **private** repository on github.com (e.g. `trendsaathi`).
2. In this folder, push it:
   ```bash
   git remote add origin https://github.com/<your-username>/trendsaathi.git
   git push -u origin main
   ```

## 4. Deploy on Render

1. Sign up at **render.com** with GitHub.
2. **New → Blueprint** → choose your repository. Render reads [`render.yaml`](render.yaml).
3. Fill in the values it asks for:

| Variable | Value |
|---|---|
| `APP_URL` | `https://<your-service>.onrender.com` (shown by Render; you can edit it after the first deploy) |
| `DATABASE_URL` | the Neon connection string |
| `ADMIN_EMAILS` | your email (you get the Admin page when you sign up with it) |
| `OPENAI_COMPAT_API_KEY` | the Groq key |
| `TRENDSAATHI_USER_AGENT` | `TrendSaathi/1.0 (+https://<your-service>.onrender.com)` |

4. Click **Apply**. The build takes a few minutes. Migrations run automatically on every start.
5. Open `https://<your-service>.onrender.com/api/health`. You should see `"ok": true, "db": "postgres", "ai": {"kind": "open", …}`.
6. Open the site, **Create account** with your admin email, and try Caption Studio.

## 5. Optional

- **Keep trends fresh while nobody is using the app:** the app already refreshes Google Trends on demand. For background refreshes, add GitHub repository secrets `APP_URL` and `INGEST_SECRET` (copy `INGEST_SECRET` from Render's environment page). The workflow in `.github/workflows/refresh-trends.yml` then runs every 2 hours for free.
- **A bigger model:** set `OPENAI_COMPAT_MODEL=openai/gpt-oss-120b` for better Hinglish (lower free daily limits).
- **Another open-model host** (OpenRouter, Together, a self-hosted vLLM server): set `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL`. If the host doesn't support JSON-schema output, set `OPENAI_COMPAT_JSON_MODE=json_object`.
- **Anthropic later** (paid, best quality): set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.

## What was verified before shipping

The same production build was run locally with:

- `NODE_ENV=production`
- a real Postgres-protocol server and the `pg` driver
- migrations via `npm run db:migrate`
- the open-model provider over the OpenAI-compatible protocol (Ollama's `/v1` stand-in for Groq)
- live Google Trends

Health check, all 7 browser tests, a real caption generation with trend context, and the "no `DATABASE_URL` in production" safety stop all passed. A real Groq key and a real Neon/Render account were **not** available, so those last connections are untested until you deploy.
