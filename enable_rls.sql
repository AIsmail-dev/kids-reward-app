-- =========================================================
-- enable_rls.sql
-- Real per-user RLS rollout. Apply to LOCAL first, then PROD
-- via Supabase Cloud SQL Editor.
-- Requires api/login.js's custom JWT (sub=user id, role=authenticated,
-- app_role=kid|parent) to be in place first, otherwise every
-- authenticated request will simply have no matching rows.
-- =========================================================

-- 1. Turn RLS on for all 6 flagged tables
ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_occurrences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions  ENABLE ROW LEVEL SECURITY;

-- 2. Defense-in-depth: anon should never touch these tables at all.
--    RLS alone already blocks it (no policy targets anon), but the
--    original schema setup granted anon full table privileges, so
--    revoke them explicitly too.
REVOKE ALL ON public.users, public.tasks, public.task_occurrences,
  public.wallet_transactions, public.withdrawals, public.push_subscriptions
FROM anon;

-- =========================================================
-- users
-- =========================================================
-- Column-level protection for `pin`: narrow authenticated's SELECT
-- grant so `select('*')` fails loudly instead of ever being able to
-- return the pin column to the browser.
REVOKE SELECT ON public.users FROM authenticated;
GRANT SELECT (id, name, role, created_at) ON public.users TO authenticated;

CREATE POLICY "users_select_parent_all_or_self" ON public.users
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'app_role') = 'parent'
    OR id = auth.uid()
  );

-- =========================================================
-- tasks
-- =========================================================
CREATE POLICY "tasks_parent_all" ON public.tasks
  FOR ALL TO authenticated
  USING ( (auth.jwt() ->> 'app_role') = 'parent' )
  WITH CHECK ( (auth.jwt() ->> 'app_role') = 'parent' );

-- Kid needs SELECT on their own assigned tasks so the PostgREST
-- embedded join (KidDashboard.jsx: task_occurrences -> tasks:task_id)
-- keeps working.
CREATE POLICY "tasks_kid_select_own" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    assigned_kid = auth.uid()
    AND (auth.jwt() ->> 'app_role') = 'kid'
  );

-- =========================================================
-- task_occurrences
-- =========================================================
CREATE POLICY "occ_parent_all" ON public.task_occurrences
  FOR ALL TO authenticated
  USING ( (auth.jwt() ->> 'app_role') = 'parent' )
  WITH CHECK ( (auth.jwt() ->> 'app_role') = 'parent' );

CREATE POLICY "occ_kid_select_own" ON public.task_occurrences
  FOR SELECT TO authenticated
  USING (
    kid_id = auth.uid()
    AND (auth.jwt() ->> 'app_role') = 'kid'
  );

-- Real fix for KidDashboard's "I Did It!" update, which today has
-- zero ownership check client-side. USING checks the row's current
-- state; WITH CHECK checks the proposed new state. Only allows a kid
-- to flip their OWN occurrence from pending -> waiting_parent.
CREATE POLICY "occ_kid_mark_waiting_parent" ON public.task_occurrences
  FOR UPDATE TO authenticated
  USING (
    kid_id = auth.uid()
    AND (auth.jwt() ->> 'app_role') = 'kid'
    AND status = 'pending'
  )
  WITH CHECK (
    kid_id = auth.uid()
    AND status = 'waiting_parent'
  );

-- =========================================================
-- wallet_transactions
-- =========================================================
CREATE POLICY "wallet_parent_all" ON public.wallet_transactions
  FOR ALL TO authenticated
  USING ( (auth.jwt() ->> 'app_role') = 'parent' )
  WITH CHECK ( (auth.jwt() ->> 'app_role') = 'parent' );

CREATE POLICY "wallet_kid_select_own" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (
    kid_id = auth.uid()
    AND (auth.jwt() ->> 'app_role') = 'kid'
  );

-- =========================================================
-- withdrawals
-- =========================================================
CREATE POLICY "withdrawals_parent_all" ON public.withdrawals
  FOR ALL TO authenticated
  USING ( (auth.jwt() ->> 'app_role') = 'parent' )
  WITH CHECK ( (auth.jwt() ->> 'app_role') = 'parent' );

CREATE POLICY "withdrawals_kid_insert_own" ON public.withdrawals
  FOR INSERT TO authenticated
  WITH CHECK (
    kid_id = auth.uid()
    AND (auth.jwt() ->> 'app_role') = 'kid'
  );

CREATE POLICY "withdrawals_kid_select_own" ON public.withdrawals
  FOR SELECT TO authenticated
  USING (
    kid_id = auth.uid()
    AND (auth.jwt() ->> 'app_role') = 'kid'
  );

-- =========================================================
-- push_subscriptions
-- =========================================================
-- Both roles strictly self-scoped; pushManager.js always operates on
-- the caller's own id. Cross-user reads (api/notify.js,
-- api/trigger_prayer_reminders.js) run under service_role, which
-- bypasses RLS entirely.
CREATE POLICY "push_subs_self_select" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING ( user_id = auth.uid() );

CREATE POLICY "push_subs_self_insert" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK ( user_id = auth.uid() );

-- =========================================================
-- Emergency rollback (run manually if something breaks):
--
-- ALTER TABLE public.users               DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tasks               DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.task_occurrences    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.wallet_transactions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.withdrawals         DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.push_subscriptions  DISABLE ROW LEVEL SECURITY;
-- =========================================================
