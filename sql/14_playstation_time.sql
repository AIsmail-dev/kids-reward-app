-- PlayStation time (api/playstation.js + docker/psn/): a kid can spend points on PlayStation
-- minutes, like phone screen time. Approving adds the minutes to the kid's PlayStation limit for
-- today through Sony's PS Family parental controls; they can be played any time until midnight.
-- `fulfilled` is set only once Sony shows the new limit, so approved vs. fulfilled keeps its meaning.

-- 1. A third kind of request, with its own price (points per minute).
ALTER TABLE wallet_rates DROP CONSTRAINT IF EXISTS wallet_rates_wallet_check;
ALTER TABLE wallet_rates ADD CONSTRAINT wallet_rates_wallet_check
    CHECK (wallet IN ('money', 'screen_time', 'playstation_time'));
INSERT INTO wallet_rates (wallet, unit_label, points_per_unit)
    SELECT 'playstation_time', 'minute', COALESCE((SELECT points_per_unit FROM wallet_rates WHERE wallet = 'screen_time'), 0.1)
    WHERE NOT EXISTS (SELECT 1 FROM wallet_rates WHERE wallet = 'playstation_time');

ALTER TABLE wallet_requests DROP CONSTRAINT IF EXISTS wallet_requests_wallet_check;
ALTER TABLE wallet_requests ADD CONSTRAINT wallet_requests_wallet_check
    CHECK (wallet IN ('money', 'screen_time', 'playstation_time'));

-- Sony's limits move in 15-minute steps, and a day has at most 24 hours.
ALTER TABLE wallet_requests DROP CONSTRAINT IF EXISTS wallet_requests_playstation_amount_check;
ALTER TABLE wallet_requests ADD CONSTRAINT wallet_requests_playstation_amount_check
    CHECK (wallet <> 'playstation_time' OR (amount >= 15 AND amount <= 240 AND amount % 15 = 0));

-- 2. playstation_links: which PS Family child account each kid's time goes to.
--    Only reachable through the service role: no policies on purpose.
CREATE TABLE IF NOT EXISTS playstation_links (
    kid_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    psn_member_id TEXT NOT NULL,
    psn_account_id TEXT NOT NULL,
    psn_name TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE playstation_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON playstation_links FROM anon, authenticated;
GRANT ALL ON playstation_links TO service_role;

-- 3. Grant progress on each request.
--    playstation_status: NULL (not sent yet) | granting | granted | failed
--    playstation_target_minutes/date: today's total limit worked out for a grant. Sony's call sets
--    today's limit outright, so a same-day retry must resend this same total or it would add the
--    minutes twice.
ALTER TABLE wallet_requests
    ADD COLUMN IF NOT EXISTS playstation_status TEXT
        CHECK (playstation_status IN ('granting', 'granted', 'failed')),
    ADD COLUMN IF NOT EXISTS playstation_error TEXT,
    ADD COLUMN IF NOT EXISTS playstation_target_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS playstation_target_date DATE;

-- 4. A kid may only ever create a plain pending request (approved rows cause real play time).
DROP POLICY IF EXISTS "wallet_requests_kid_insert_own" ON wallet_requests;
CREATE POLICY "wallet_requests_kid_insert_own" ON wallet_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        kid_id = auth.uid()
        AND (auth.jwt() ->> 'app_role') = 'kid'
        AND status = 'pending'
        AND familylink_status IS NULL
        AND playstation_status IS NULL
        AND playstation_target_minutes IS NULL
        AND playstation_target_date IS NULL
    );
