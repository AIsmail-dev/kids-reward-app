-- Automatic Google Family Link screen-time grants (api/familylink.js).
-- An approved screen_time request is sent to the kid's device as a Family
-- Link bonus; `fulfilled` is set only once Google confirms it, so approved
-- vs. fulfilled keeps its meaning (see sql/10).

-- 1. familylink_links: which Google child and device each kid's grants go to.
--    Only reachable through the service role: no policies on purpose.
CREATE TABLE IF NOT EXISTS familylink_links (
    kid_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    google_child_id TEXT NOT NULL,
    google_device_id TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE familylink_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON familylink_links FROM anon, authenticated;
GRANT ALL ON familylink_links TO service_role;

-- 2. Grant progress on each request.
--    familylink_status: NULL (never sent) | scheduled | granting | granted | failed
--    familylink_target_minutes/date: the bonus total worked out for a grant. A
--    bonus replaces the time left rather than adding to it, so a same-day retry
--    must resend this same total or it would add the minutes twice.
ALTER TABLE wallet_requests
    ADD COLUMN IF NOT EXISTS familylink_status TEXT
        CHECK (familylink_status IN ('scheduled', 'granting', 'granted', 'failed')),
    ADD COLUMN IF NOT EXISTS familylink_error TEXT,
    ADD COLUMN IF NOT EXISTS familylink_target_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS familylink_target_date DATE;

-- 3. A kid may only ever create a plain pending request. Approved rows now
--    cause real screen time, so a kid must not be able to insert one directly.
DROP POLICY IF EXISTS "wallet_requests_kid_insert_own" ON wallet_requests;
CREATE POLICY "wallet_requests_kid_insert_own" ON wallet_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        kid_id = auth.uid()
        AND (auth.jwt() ->> 'app_role') = 'kid'
        AND status = 'pending'
        AND familylink_status IS NULL
    );
