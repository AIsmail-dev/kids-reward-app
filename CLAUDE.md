# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A PWA for managing kids' chores/tasks and reward payouts, with a parent admin console. React + Vite frontend, Supabase (Postgres) as the backend/DB, deployed on Vercel with Vercel serverless functions under `api/`.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — production build
- `npm run preview` — preview the production build locally
- No test suite and no lint script are configured in `package.json`.

There is no `vite.config.js` at the project root — it lives at `public/vite.config.js` and configures `@vitejs/plugin-react` and `vite-plugin-pwa` (PWA manifest, service worker autoupdate). Keep that in mind if Vite behavior seems unconfigured — check `public/vite.config.js`, not the root.

## Architecture

**Frontend** (`src/`): plain React Router app, no state management library. `src/App.jsx` defines all routes. Auth is PIN-based (see below) with the logged-in user cached in `localStorage.user`; there's no route-guard/context layer, so pages read `localStorage` directly.

- `src/pages/` — kid/parent-facing screens: `Splash`, `Login`, `KidDashboard`, `ParentDashboard`, `ParentTaskManager`.
- `src/admin/` — parent admin console under `/admin`, nested under `AdminLayout` (collapsible sliding sidebar): `AdminTasks` (index), `AdminSettings`, `AdminOccurrences`, `AdminKids`.
- `src/supabaseClient.js` — single shared Supabase client, created from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- `src/pushManager.js` — registers `public/push-sw.js` as the push service worker, subscribes via the Web Push API, and persists the subscription to the `push_subscriptions` table.

**Backend** (`api/`, Vercel serverless functions, one file = one endpoint):
- `cron-tasks.js` — daily cron (see `vercel.json`, runs 21:00 UTC) that expands active `tasks` rows into `task_occurrences` for the current day, computed in Riyadh time (UTC+3, hardcoded offset).
- `notify.js` — sends Web Push notifications to users filtered by role/kid id, using subscriptions stored in `push_subscriptions`.
- `trigger_prayer_reminders.js` — fetches Riyadh prayer times from the Aladhan API and fires prayer-related push reminders/sounds.
- `totp.js` — TOTP generate/verify for parent 2FA (`otpauth`).
- `webauthn.js` — WebAuthn registration/authentication backed by `@simplewebauthn/server`, using base64⇄buffer helpers for credential IDs.
- `test.js` — scratch endpoint for probing the `@simplewebauthn/server` export shape.

Every `api/*.js` file builds its own `createClient(...)` (no shared server-side Supabase helper) and falls back to hardcoded Supabase URL/anon-key literals when the env vars aren't set. `notify.js` and `trigger_prayer_reminders.js` also have the VAPID keypair hardcoded inline rather than read from env.

**Data model** (see `init_new_database.sql` for the base schema, plus incremental `add_*.sql` / `create_*.sql` migration files applied by hand — there's no migration tool):
- `users` — `role` is `'kid' | 'parent'`; login is by `name` + 4-digit `pin` (plaintext, matched directly in the query — see `src/pages/Login.jsx`).
- `tasks` — recurrence rules (`recurrence`, `week_day`, `month_day`) that `api/cron-tasks.js` expands daily.
- `task_occurrences` — one row per task per day; `status` moves through `pending → waiting_parent → approved/completed`.
- `wallet_transactions` — `reward`/`withdraw` ledger entries per kid.
- `withdrawals` — kid withdrawal requests with `pending/approved/rejected` status, reviewed via the admin console.
- `push_subscriptions` — one row per `(user_id, subscription)`, used by `notify.js`.

**Loose one-off scripts**: `temp_scripts/` and several root-level `.js`/`.cjs`/`.sql` files (`backfill_names.js`, `check_sql.js`, `fix_duplicate_crons.sql`, `sync_prod_to_dev.js`, etc.) are ad hoc maintenance/debug scripts run manually against Supabase — they aren't part of the app build or wired into any npm script.

## Notes for changes here

- Timezone-sensitive logic (task generation, prayer reminders) assumes Riyadh time via a hardcoded UTC+3 offset or `Asia/Riyadh` — match that convention rather than introducing `Date` logic that assumes UTC or local server time.
- `.gitignore`'s env-file exclusion pattern is broken (a corrupted `.env*` entry), so `.env` and `.env.development` are currently tracked in git. Be careful before adding real secrets to those files as-is.
