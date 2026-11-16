-- 15: Learning Hub credits (Yahya Learning Hub → Kids Rewards).
-- Additive and non-breaking: three nullable columns + one partial unique index.
-- Existing rows, policies, triggers and queries are unaffected (all new columns are NULL for them).
--
-- source        who created the row ('learning-hub'); NULL for everything Kids Rewards itself writes
-- external_ref  the caller's idempotency key; UNIQUE per source, so the same learning event
--               can never be credited twice, even if the request is retried
-- note          short human reason shown in the parent's history ("Quiz passed: …")
--
-- Credits use type 'reward' (positive); reversals use type 'withdraw' with a negative amount,
-- the same convention the parent's manual "take points" already uses. Rows are only ever
-- inserted by api/learning-credit.js with the service role (bypasses RLS; no new policies needed).

ALTER TABLE public.wallet_transactions
    ADD COLUMN IF NOT EXISTS source text,
    ADD COLUMN IF NOT EXISTS external_ref text,
    ADD COLUMN IF NOT EXISTS note text;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_source_external_ref_key
    ON public.wallet_transactions (source, external_ref)
    WHERE external_ref IS NOT NULL;

-- Rollback (only if no learning-hub rows need keeping):
--   DROP INDEX IF EXISTS public.wallet_transactions_source_external_ref_key;
--   ALTER TABLE public.wallet_transactions DROP COLUMN IF EXISTS note, DROP COLUMN IF EXISTS external_ref, DROP COLUMN IF EXISTS source;
