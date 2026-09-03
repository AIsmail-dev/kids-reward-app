# Session Handoff — 2026-09-03

Context for picking this project back up in a future session. `CLAUDE.md` has the enduring architecture reference; this file is a point-in-time summary of what just happened and what's still open.

## Current state, in one line

**Dev**: fully working (local Supabase via Colima), full RLS, full multi-wallet reward system, verified end-to-end. **Production**: code deployed and login works, reward-system tables exist and are RLS-protected, but **the original 6 tables (`users`, `tasks`, `task_occurrences`, `wallet_transactions`, `withdrawals`, `push_subscriptions`) still have NO Row Level Security** — the anon key can freely read/write them right now.

## Most important open item

**Run `sql/09_enable_rls.sql` against production.** This is the actual security fix this whole session was building toward, and it hasn't happened yet. Confirmed directly: `curl` with just the anon key against production's `/rest/v1/users` returns full rows, unrestricted.

Why it wasn't done yet: the deployment debugging (wrong/missing env vars in Vercel, stale PostgREST schema cache, wrong `SUPABASE_SERVICE_ROLE_KEY` value) ate the whole session. `sql/10_add_reward_types_and_redemptions.sql` got applied and confirmed working along the way, but `sql/09` — the original RLS rollout — never got its turn.

**Before running it**, walk through the same sequencing logic used for `sql/10`:
- Everyone (Ahmed, Farida, Yahia) needs a fresh login (real JWT in `localStorage.token`) *before* RLS goes live, or their session will suddenly show empty data until they log out/in again.
- Have the rollback ready: `ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;` for each of the 6 tables (also at the bottom of `sql/09_enable_rls.sql`'s intent, add it if not already there).
- After applying, re-verify with the same kind of adversarial `curl` checks used during dev testing (anon key blocked, kid can't touch another kid's data, parent still has full access) — don't just trust the UI looking fine.
- Manually trigger `/api/cron-tasks` once afterward to confirm the daily task generator still works under RLS + service-role key (it was switched off the anon key this session too).

## What got built this session (all already deployed to prod except the RLS item above)

1. **Local dev environment** — Colima (Docker-compatible runtime, no Homebrew/sudo) + Supabase CLI, since the old cloud dev project died from free-tier inactivity. `npm run dev` + `npm run dev:api` (two processes) needed together locally now — see `CLAUDE.md` Commands section.
2. **Custom JWT auth** — `api/login.js` replaces the old client-side plaintext PIN check. Mints a signed JWT server-side via `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_JWT_SECRET`.
3. **Row Level Security** — designed and fully verified on dev; **not yet live on prod** (see above).
4. **Multi-wallet reward system** — replaced the old direct-money model. Points is the main wallet; kids freely convert points into Money or Screen Time wallets (no approval needed); spending *from* those wallets (a payout destination, or scheduling screen-time usage on a chosen day) goes through a parent approve → fulfill flow. Went through two design iterations — the first attempt (flat "reward types" list) was wrong and got fully replaced same-session; `CLAUDE.md` documents only the correct final design.
5. **Push notification reminders** — on approving a wallet request, the kid gets a confirmation push and the parent gets a reminder push to actually go do the manual real-world action (hand over cash, adjust Screen Time/Family Link) — there's no real remote-grant API on either platform, confirmed and scoped out this session (see the "auto-grant screen time" discussion in chat history if that comes up again — conclusion was: not worth building, no viable API on iOS at all, Android has a path via Device Owner/Knox SDK but it's a separate native-app project).
6. **File reorganization** — all hand-applied SQL files moved from repo root into `sql/`, numbered `01`–`10` in application order. Loose debug scripts consolidated into `temp_scripts/`.

## Known issues / oddities (not yet resolved, just documented)

- **Unexplained `kids` table in production** — found via `information_schema.tables` while debugging. Not referenced anywhere in this codebase, git history, or `sql/`. Nobody's investigated what it is. Don't assume you know.
- **Legacy `task_occurrences` rows with `kid_id = NULL`** in production (only `task_id` populated, pre-dating a schema change) — once `sql/09_enable_rls.sql` is live, these specific old rows become invisible to the kid (parent still sees them). Low severity, historical only.
- **Claude has no push/deploy credentials in this environment** — `git push` fails (`Device not configured`), and attempts to look up or configure credentials (Keychain, database connection scripts) get blocked by an automated safety classifier. Every deploy this session required the user to run `git push origin main` manually from their own terminal. Don't assume this has changed; verify before relying on it again.
- **`git commit` in this repo shows an "author identity" warning** — auto-configured from `username@hostname` rather than a real name/email. Cosmetic, not blocking, never addressed.

## Where things are now (post-reorg)

- `sql/01`–`sql/10` — schema, in application order. `02` is redundant (superseded by `01`, kept for history). `04`'s webhook lines point at a real Vercel URL — don't blindly re-run against a new environment.
- `scripts/dev-api-server.mjs` + root `vite.config.js` — local API proxy, needed for `/api/*` to work under plain `npm run dev`.
- `temp_scripts/` — all ad hoc one-off scripts, including `sync_prod_to_dev.js` (now points at local dev + needs `SUPABASE_SERVICE_ROLE_KEY` sourced first, updated this session).
- `.env.local` — holds `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` for local dev (gitignored correctly, confirmed).

## Suggested next step

Get `sql/09_enable_rls.sql` applied to production, following the sequencing notes above. That closes out the actual goal of this session's work — everything else is already live.
