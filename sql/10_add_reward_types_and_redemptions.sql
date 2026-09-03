-- Multi-wallet points system. Points is the main/default wallet (all
-- chore completions credit it, unchanged). Kids can freely convert
-- points into two other persistent, per-kid wallets — Money and Screen
-- Time — at a parent-configured rate, with NO approval needed for that
-- conversion step (it's just reallocating already-earned points).
-- Spending FROM the Money or Screen Time wallet — a payout to a real
-- destination, or scheduling actual screen-time usage on a given day —
-- is what needs parent approval, then a separate "fulfilled" step once
-- the parent has actually done it in the real world.

-- 1. wallet_transactions: add a wallet discriminator. All existing rows
--    (task rewards, manual admin entries) are Points-wallet activity.
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS wallet TEXT NOT NULL DEFAULT 'points'
    CHECK (wallet IN ('points', 'money', 'screen_time'));
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
    CHECK (type IN ('reward', 'withdraw', 'convert'));

-- 2. wallet_rates: parent-configured points-per-unit for the two
--    convertible wallets.
CREATE TABLE wallet_rates (
    wallet TEXT PRIMARY KEY CHECK (wallet IN ('money', 'screen_time')),
    unit_label TEXT NOT NULL,
    points_per_unit NUMERIC NOT NULL CHECK (points_per_unit > 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO wallet_rates (wallet, unit_label, points_per_unit) VALUES
    ('money', 'ر.س', 1),
    ('screen_time', 'minute', 1);

-- 3. money_destinations: parent-configurable list of where Money-wallet
--    payouts can go (cash, bank account, school canteen, ...).
CREATE TABLE money_destinations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO money_destinations (name) VALUES ('Cash'), ('Bank Account'), ('School Canteen Wallet');

-- 4. wallet_requests: a kid's request to spend FROM their Money or
--    Screen Time wallet balance (not from Points directly).
CREATE TABLE wallet_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kid_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet TEXT NOT NULL CHECK (wallet IN ('money', 'screen_time')),
    amount NUMERIC NOT NULL,
    destination_id UUID REFERENCES money_destinations(id),
    scheduled_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'rejected')),
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    fulfilled_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE wallet_transactions ADD COLUMN request_id UUID REFERENCES wallet_requests(id);

-- 5. RLS
ALTER TABLE wallet_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wallet_rates, money_destinations, wallet_requests FROM anon;

CREATE POLICY "wallet_rates_parent_all" ON wallet_rates
    FOR ALL TO authenticated
    USING ( (auth.jwt() ->> 'app_role') = 'parent' )
    WITH CHECK ( (auth.jwt() ->> 'app_role') = 'parent' );
CREATE POLICY "wallet_rates_kid_select" ON wallet_rates
    FOR SELECT TO authenticated
    USING ( (auth.jwt() ->> 'app_role') = 'kid' );

CREATE POLICY "money_destinations_parent_all" ON money_destinations
    FOR ALL TO authenticated
    USING ( (auth.jwt() ->> 'app_role') = 'parent' )
    WITH CHECK ( (auth.jwt() ->> 'app_role') = 'parent' );
CREATE POLICY "money_destinations_kid_select_active" ON money_destinations
    FOR SELECT TO authenticated
    USING ( active = true AND (auth.jwt() ->> 'app_role') = 'kid' );

CREATE POLICY "wallet_requests_parent_all" ON wallet_requests
    FOR ALL TO authenticated
    USING ( (auth.jwt() ->> 'app_role') = 'parent' )
    WITH CHECK ( (auth.jwt() ->> 'app_role') = 'parent' );
CREATE POLICY "wallet_requests_kid_insert_own" ON wallet_requests
    FOR INSERT TO authenticated
    WITH CHECK ( kid_id = auth.uid() AND (auth.jwt() ->> 'app_role') = 'kid' );
CREATE POLICY "wallet_requests_kid_select_own" ON wallet_requests
    FOR SELECT TO authenticated
    USING ( kid_id = auth.uid() AND (auth.jwt() ->> 'app_role') = 'kid' );

-- Kids also need to INSERT into wallet_transactions for the points->wallet
-- conversion step (both legs, in one atomic multi-row insert) — the
-- existing kid policy on wallet_transactions only allows SELECT of their
-- own rows, so add a scoped INSERT policy for exactly this case.
CREATE POLICY "wallet_tx_kid_insert_own_convert" ON wallet_transactions
    FOR INSERT TO authenticated
    WITH CHECK (
        kid_id = auth.uid()
        AND (auth.jwt() ->> 'app_role') = 'kid'
        AND type = 'convert'
    );
