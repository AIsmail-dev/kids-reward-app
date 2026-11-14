-- Family Link bonus time is a clock window: it starts the moment Google applies it and runs out
-- whether the device is used or not. So an approved screen_time request no longer goes to the device
-- on approval (or at midnight for a later day): it waits as `ready` until the kid taps Start in the
-- app on that day (api/familylink.js, action `start`).

ALTER TABLE wallet_requests DROP CONSTRAINT IF EXISTS wallet_requests_familylink_status_check;
UPDATE wallet_requests SET familylink_status = 'ready' WHERE familylink_status = 'scheduled';
ALTER TABLE wallet_requests ADD CONSTRAINT wallet_requests_familylink_status_check
    CHECK (familylink_status IN ('ready', 'granting', 'granted', 'failed'));

-- When the bonus window this request started ends. Set before the bonus is sent, so a retry can see
-- it already applied instead of starting a second window.
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS familylink_ends_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE wallet_requests DROP COLUMN IF EXISTS familylink_target_date;
