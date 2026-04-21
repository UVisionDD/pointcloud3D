# pointcloud3D — Setup & Launch Checklist

This is the step-by-step for taking the code in this repo and standing up a live
site at **pointcloud3d.com** with a Mac Mini M4 worker running the depth +
point-cloud pipeline.

Work top-to-bottom. Everything that needs a credential from you is called out
explicitly. Each section says **what to do**, **what key/value to copy**, and
**where it goes** (always `web/.env.local` unless noted).

---

## 0. Prerequisites

- The domain `pointcloud3d.com` on Cloudflare (you have this).
- A Mac Mini (M-series) that will run the worker 24/7.
- Node 20+ and Python 3.11 on whatever machine you deploy the worker on.
- Accounts (free tiers are fine to start): Clerk, Neon, Cloudflare, Stripe,
  Vercel, optionally Resend.

Copy the env template now so you have somewhere to paste keys as you go:

```bash
cp web/.env.example web/.env.local
cp worker/.env.example worker/.env
```

---

## 1. Clerk (auth)

1. Go to https://dashboard.clerk.com and create an application.
   Name: `pointcloud3D`. Enable Email + Google (at minimum).
2. In **API Keys**, copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → `web/.env.local`
   - `CLERK_SECRET_KEY` → `web/.env.local`
3. Under **Paths**, confirm sign-in = `/sign-in`, sign-up = `/sign-up`
   (matches the middleware in [web/src/middleware.ts](web/src/middleware.ts)).
4. Under **Domains**, after you deploy to Vercel, add `pointcloud3d.com` as a
   production domain. Clerk will give you a new production publishable /
   secret key pair — swap those into Vercel's env vars (NOT your local file).

---

## 2. Neon Postgres

1. https://console.neon.tech → create project `pointcloud3d`.
2. Use the **pooled** connection string (it has `-pooler` in the host).
3. `DATABASE_URL=postgresql://...?sslmode=require` → paste into both
   `web/.env.local` and `worker/.env`.
4. Push the schema from the web app:
   ```bash
   cd web
   npm install
   npx drizzle-kit push
   ```
   This creates users, subscriptions, jobs, exports, user_presets, and
   credit_ledger tables defined in [web/src/lib/db/schema.ts](web/src/lib/db/schema.ts).

---

## 3. Cloudflare R2 (object storage)

1. Cloudflare Dashboard → **R2** → create bucket `pointcloud3d`.
2. **Manage R2 API Tokens** → create token with **Read & Write** on that
   bucket. Copy:
   - `R2_ACCOUNT_ID` (visible on R2 overview page)
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET=pointcloud3d`
   Paste all four into both `web/.env.local` and `worker/.env`.
3. **CORS** for the bucket (Settings → CORS policy) — needed so browser uploads
   to presigned PUT URLs work. Include every origin the app is served from —
   the apex redirects to `www.`, and Vercel preview deployments have their own
   hostnames. Missing any of these causes "Failed to fetch" on upload:
   ```json
   [
     {
       "AllowedOrigins": [
         "http://localhost:3000",
         "https://pointcloud3d.com",
         "https://www.pointcloud3d.com",
         "https://*.vercel.app"
       ],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. (Optional) Public CDN for exports: R2 → Settings → **Connect custom domain**
   → `cdn.pointcloud3d.com`. Cloudflare will auto-create the DNS record.
   Then set `R2_PUBLIC_URL=https://cdn.pointcloud3d.com`. If you skip this,
   downloads go through signed URLs, which is fine.

---

## 4. Stripe (payments)

1. https://dashboard.stripe.com → start in **Test mode**.
2. **Products** → create 5 products with recurring/one-time prices:

   | Product | Mode | Amount | Env var |
   |---|---|---|---|
   | Single export | one-time | €1.99 | `STRIPE_PRICE_PAYG_SINGLE` |
   | 3-pack | one-time | €4.99 | `STRIPE_PRICE_PAYG_THREE_PACK` |
   | Basic (monthly) | subscription | €9.99/mo | `STRIPE_PRICE_SUB_BASIC` |
   | Pro (monthly) | subscription | €14.99/mo | `STRIPE_PRICE_SUB_PRO` |
   | Max (monthly) | subscription | €19.99/mo | `STRIPE_PRICE_SUB_MAX` |

   Copy each **Price ID** (starts with `price_...`) into `web/.env.local`.
3. **Developers → API keys**: copy `STRIPE_SECRET_KEY` (`sk_test_...`).
4. **Webhooks** → add endpoint:
   - URL (production): `https://pointcloud3d.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.paid`.
   - Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET` (`whsec_...`).
5. For local webhook testing:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   The CLI prints a local `whsec_...` — use that locally.
6. When you go live: flip Stripe to Live mode, repeat the product +
   webhook setup, swap all four `STRIPE_*` vars in Vercel to the live values.

---

## 5. Resend (email — optional for MVP)

1. https://resend.com → create API key → `RESEND_API_KEY=re_...`.
2. Verify `pointcloud3d.com` as a sending domain (Resend gives you the DNS
   records; add them as CNAMEs in Cloudflare DNS).

Skip this for launch if you want — nothing in the code hard-requires it.

---

## 6. Deploy the web app to Vercel

1. Push this repo to GitHub.
2. https://vercel.com/new → import the repo. **Root directory: `web`**.
3. Framework preset: Next.js (auto).
4. Add every variable from your `web/.env.local` to Vercel's Environment
   Variables (Production + Preview). Use your **live** Stripe keys and
   **production** Clerk keys for Production.
5. Deploy.
6. **Domain**: Vercel → Project → Settings → Domains → add
   `pointcloud3d.com` and `www.pointcloud3d.com`. Vercel shows DNS targets.
7. In **Cloudflare DNS** for pointcloud3d.com:
   - `A` record `@` → `76.76.21.21` (Vercel's anycast IP), **Proxied: off**
     (grey cloud) — Vercel handles TLS itself.
   - `CNAME` `www` → `cname.vercel-dns.com`, **Proxied: off**.
   (If Cloudflare's proxy is on, Vercel's cert provisioning fails.)
8. Set `NEXT_PUBLIC_APP_URL=https://pointcloud3d.com` in Vercel.

---

## 7. Mac Mini worker

### 7a. Install

```bash
cd worker
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Fill in `worker/.env` with the same `DATABASE_URL` + `R2_*` values as the web
app, plus:

```
WORKER_ID=mac-mini-1
```

Quick smoke test:

```bash
python test_depth.py
# should write worker/output/depth.jpg in ~200ms after warmup
```

### 7b. Cloudflare Tunnel (so Stripe webhooks / the web app can reach the
worker's dev server, *if* you ever use `WORKER_BASE_URL` for direct calls)

The production design is **DB-polling only** — the web app writes a job row,
the worker picks it up. You do not need the tunnel for MVP. Skip 7b entirely
unless you decide later to expose `worker/server.py`.

If you do want it:

```bash
brew install cloudflared
cloudflared tunnel login          # opens browser, pick pointcloud3d.com
cloudflared tunnel create pointcloud3d-worker
cloudflared tunnel route dns pointcloud3d-worker worker.pointcloud3d.com
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: pointcloud3d-worker
credentials-file: /Users/YOU/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: worker.pointcloud3d.com
    service: http://localhost:8080
  - service: http_status:404
```

Then set `WORKER_BASE_URL=https://worker.pointcloud3d.com` and a shared
secret in both envs — but again, not required for launch.

### 7c. Run the job worker as a launchd service

Create `~/Library/LaunchAgents/com.pointcloud3d.worker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.pointcloud3d.worker</string>
  <key>WorkingDirectory</key><string>/Users/YOU/path/to/pointcloud3D/worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/YOU/path/to/pointcloud3D/worker/.venv/bin/python</string>
    <string>job_worker.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/YOU/Library/Logs/pointcloud3d-worker.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/Library/Logs/pointcloud3d-worker.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.pointcloud3d.worker.plist
tail -f ~/Library/Logs/pointcloud3d-worker.log
```

Stop it: `launchctl unload ...` (same path).

---

## 8. End-to-end smoke test (once everything is wired)

1. Visit `https://pointcloud3d.com` → sign up.
2. `/pricing` → buy the **Single export** PAYG tier with Stripe test card
   `4242 4242 4242 4242`. You should land on `/dashboard?checkout=success`
   and your user row should show `paygCredits = 1` (check in Neon SQL
   editor).
3. `/dashboard/upload` → drop a portrait JPG. You should redirect to
   `/dashboard/jobs/<id>` and see progress tick up as the Mac Mini worker
   picks up the job.
4. When status flips to `done`, the in-browser viewer renders the PLY and
   every format's download button works.
5. Repeat with a subscription tier → confirm `exportsUsedThisPeriod`
   increments on each export.

---

## 9. Things to do *before* you take real money

- Replace [web/src/app/terms/page.tsx](web/src/app/terms/page.tsx) and
  [web/src/app/privacy/page.tsx](web/src/app/privacy/page.tsx) with real
  legal text (templates from Termly / iubenda are fine).
- Flip Stripe to Live mode and swap keys in Vercel.
- Confirm Clerk production keys are set in Vercel (not test keys).
- Set up a Cloudflare rule to cache `/` aggressively and bypass cache on
  `/api/*` and `/dashboard/*`.
- Add a Cloudflare WAF rule limiting `/api/upload-url` and `/api/jobs` to
  something like 60 req/min per IP.

---

## Where each env var gets consumed (quick index)

| Var | Consumer |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Stripe success/cancel URLs, OG metadata |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk middleware + server helpers |
| `DATABASE_URL` | `web/src/lib/db/index.ts` and `worker/db.py` |
| `R2_*` | `web/src/lib/r2.ts` (presigned URLs) and `worker/storage.py` (upload results) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `web/src/app/api/checkout/route.ts`, `web/src/app/api/webhooks/stripe/route.ts` |
| `STRIPE_PRICE_*` | `web/src/app/pricing/page.tsx` (server-side), webhook plan mapping |
| `RESEND_API_KEY` | future: transactional email |
| `WORKER_ID` | `worker/job_worker.py` (shown on the job row while processing) |

That's everything. When you've pasted every key, the site is complete.
