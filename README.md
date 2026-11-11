# Competitor pricing tracker

A signed-in founder pastes competitor pricing-page URLs. Once a day, the app fetches each page, compares the normalized text to the last snapshot, and sends a short email when a price, plan name, limit, or feature changes. Each page has a history of checks.

This is the approved 2026-11-11 MVP. It does not render JavaScript, parse prices into fields, or send anything when a check finds no change or a fetch error.

## How a check works

1. The server fetches the HTML. There is no headless browser.
2. Visible text is kept. `script`, `style`, `nav`, and `footer` are dropped, as are elements whose class or id contains `cookie`, `banner`, `announcement`, or `promo`.
3. Dates, times, and year strings are stripped, and whitespace is collapsed.
4. The result is line-diffed against the last snapshot. A change counts only when that diff is non-empty.
5. A changed page sends one Resend email with the URL, removed lines, added lines, and a link to that page's history. No change and fetch errors do not send email.

Adding an https URL fetches it immediately and stores that normalized text as the baseline snapshot (sha256). `http` URLs are rejected. Each user can track at most 10 pages. Fetch failures are stored as `fetch_error`, not as changes.

## Environment variables

Set these in `.env` locally and in the Vercel project for production. Never commit real values. `.env.example` lists the same names.

| Variable | Required in production | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. Magic-link auth. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key. Used only to send and exchange magic links. |
| `DATABASE_URL` | yes | Postgres connection. Use the Supabase **direct** connection or the **session** pooler (port 5432), not the transaction pooler (port 6543). The role must bypass row-level security for the daily cron; the Supabase `postgres` user does. User requests `SET LOCAL ROLE authenticated` and set `request.jwt.claim.sub`, so RLS still applies. |
| `NEXT_PUBLIC_APP_URL` | yes | Public origin with no trailing slash, used in email history links. Example: `https://your-app.vercel.app`. |
| `CRON_SECRET` | yes | Shared secret. Vercel Cron calls `GET /api/cron/check` with `Authorization: Bearer $CRON_SECRET`. Requests without it return 401. |
| `RESEND_API_KEY` | yes | Resend API key for change emails. |
| `RESEND_FROM_EMAIL` | yes | From address, for example `Pricing Tracker <onboarding@resend.dev>`. |
| `VERCEL_URL` | automatic | Set by Vercel. Used as the history-link origin only when `NEXT_PUBLIC_APP_URL` is empty. |
| `VERCEL` | automatic | Set by Vercel. When it is `1`, local demo auth is disabled. |
| `LOCAL_AUTH` | local only | Set to `1` to sign in against local Postgres without a Supabase project. Never set this on Vercel. |
| `LOCAL_AUTH_SECRET` | local only | HMAC secret for the local session cookie. `openssl rand -hex 32`. |
| `ALLOW_FIXTURES` | no | `1` serves the committed `fx-noise` and `fx-change` HTML at `https://fixtures.pricing-tracker.local/...` even on Vercel. Default is on outside Vercel and off on Vercel. |

## Local demo (no cloud accounts)

Docker is not required. This path uses local Postgres with the same tables, `auth.uid()`, and row-level security policies as the Supabase migration. Magic-link emails are not sent: the login page shows the link, which is the stand-in for Supabase's local inbox.

```bash
# Postgres 16. Create a superuser role and a database named pricing_tracker.
sudo apt-get install -y postgresql
# then, as a superuser:
#   CREATE USER pricing WITH PASSWORD 'pricing' SUPERUSER LOGIN;
#   CREATE DATABASE pricing_tracker OWNER pricing;

cp .env.example .env
# Fill DATABASE_URL, CRON_SECRET, LOCAL_AUTH=1, and LOCAL_AUTH_SECRET.
# Leave the Supabase and Resend variables empty.

npm install
npm run db:setup    # applies supabase/local/bootstrap.sql, then the migration
npm run dev
```

Open `http://localhost:3000`, enter any email, and click **Open magic link**. Add an `https://` URL. **Check now** runs a comparison immediately. History is at `/pages/<id>/history`.

`npm run db:setup` refuses to run unless the database name is `pricing_tracker` or ends in `_test`. Do not point it at a Supabase database. Apply the migration there by hand (next section).

Fixture pages used by tests live in `fixtures/fx-noise/` and `fixtures/fx-change/`. Outside Vercel, a URL such as `https://fixtures.pricing-tracker.local/fx-change/before.html` is read from those files instead of the network. A local-only request header `x-fixture-variant: after` compares that page against the sibling file. The header is ignored when `LOCAL_AUTH` is off.

## Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → Providers → Email**: enable email sign-in. Magic link is the method this app uses (`signInWithOtp`).
3. **Authentication → URL configuration**:
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: `https://<your-vercel-domain>/auth/callback`
4. Open the SQL editor and run the full file [`supabase/migrations/20261111120000_init.sql`](supabase/migrations/20261111120000_init.sql). Do not run `supabase/local/bootstrap.sql` on Supabase.
5. **Project Settings → API**: copy the project URL and the anon key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
6. **Project Settings → Database**: copy the direct connection string (host `db.<ref>.supabase.co`, port **5432**) into `DATABASE_URL`. Include `?sslmode=require` if it is not already there. Use the database password from that page. Do not use port 6543.

The migration creates `pages`, `snapshots`, and `checks`, enables row-level security, and grants `authenticated` access only to the caller's own rows (`auth.uid() = user_id`).

## Vercel

1. Import this repository. Framework preset: Next.js.
2. Set every production variable from the table above. Generate `CRON_SECRET` with `openssl rand -hex 32` and set the same value in the Vercel project. Do not set `LOCAL_AUTH` or `LOCAL_AUTH_SECRET`.
3. Deploy.
4. [`vercel.json`](vercel.json) registers a daily cron: `GET /api/cron/check` at 08:00 UTC. On the Hobby plan, cron runs at most once a day, which is the cadence this MVP is built for. Vercel attaches `Authorization: Bearer $CRON_SECRET` when that variable exists.
5. After the first production deploy, record the deployment URL and the git SHA Vercel shows for it. That pair is the AC-8 proof.

## Resend

1. Create an API key at [resend.com](https://resend.com) and set `RESEND_API_KEY`.
2. Until a sending domain is verified, Resend only delivers to the email address that owns the Resend account. Set `RESEND_FROM_EMAIL` to `Pricing Tracker <onboarding@resend.dev>` (or another address Resend accepts for an unverified domain).
3. Sign in to the tracker with **that same email address**. Change alerts go to the signed-in user's email. A "no change" check and a fetch error do not send mail.
4. A changed email contains the page URL, the removed lines, the added lines, and a link to `/pages/<id>/history`.

## Tests

```bash
# Uses DATABASE_URL if set to a database whose name ends in _test,
# otherwise postgres://pricing:pricing@127.0.0.1:5432/pricing_tracker_test
npm test
npm run lint
npm run typecheck
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, and tests against Postgres 16. Coverage includes normalization, the line diff, the `fx-noise` and `fx-change` fixtures, cron authorization, the https and 10-URL limits, and row-level security isolation between two users.

`npm run prove` talks to a running local server and writes API JSON under `/opt/cursor/artifacts/ac-proof` (override with `PROVE_OUT_DIR`). It needs `LOCAL_AUTH=1` and `CRON_SECRET` in `.env`.

## What is left for a real deploy

No Vercel, Supabase, or Resend account is wired up in this repository. Production sign-in, a delivered email, and the production URL are blocked on these accounts:

- A Supabase project, plus its URL, anon key, and direct database connection string. Run the migration above.
- A Resend API key and from-address. The inbox that receives the AC-6 email must be the Resend account owner until a domain is verified, and that same address must be the magic-link sign-in.
- A Vercel project with the env vars set, so the daily cron and the production deployment exist.
