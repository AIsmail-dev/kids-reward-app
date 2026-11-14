-- Points are the only balance. Kids no longer convert points into Money / Screen Time wallets: a
-- request costs points directly (at the wallet_rates rate) and the points are deducted when a parent
-- approves it. The `wallet` column on wallet_transactions stays for history; new rows are all 'points'.

-- 1. Each request's cost in points, fixed when it's made. Set by the database, never by the client,
--    so a kid can't send a cheaper price with their insert.
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS points_cost NUMERIC;

CREATE OR REPLACE FUNCTION set_wallet_request_points_cost() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    SELECT NEW.amount * points_per_unit INTO NEW.points_cost FROM wallet_rates WHERE wallet = NEW.wallet;
    IF NEW.points_cost IS NULL THEN
        RAISE EXCEPTION 'No rate set for wallet %', NEW.wallet;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wallet_requests_points_cost ON wallet_requests;
CREATE TRIGGER wallet_requests_points_cost BEFORE INSERT ON wallet_requests
    FOR EACH ROW EXECUTE FUNCTION set_wallet_request_points_cost();

UPDATE wallet_requests r SET points_cost = r.amount * w.points_per_unit
FROM wallet_rates w
WHERE w.wallet = r.wallet AND r.points_cost IS NULL;

-- 2. Move any leftover Money / Screen Time wallet balance back into points, at the current rate.
--    Both halves read the same snapshot, and a re-run finds nothing left to move.
INSERT INTO wallet_transactions (kid_id, wallet, amount, type)
SELECT kid_id, wallet, -SUM(amount), 'convert'
FROM wallet_transactions
WHERE wallet IN ('money', 'screen_time')
GROUP BY kid_id, wallet
HAVING SUM(amount) <> 0
UNION ALL
SELECT t.kid_id, 'points', SUM(t.amount) * r.points_per_unit, 'convert'
FROM wallet_transactions t
JOIN wallet_rates r ON r.wallet = t.wallet
WHERE t.wallet IN ('money', 'screen_time')
GROUP BY t.kid_id, t.wallet, r.points_per_unit
HAVING SUM(t.amount) <> 0;
