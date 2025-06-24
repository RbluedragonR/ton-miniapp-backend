-- SQL script to add tables and columns for Swap and Plinko features.
-- This will be run automatically by the deploy_to_railway.sh script.

BEGIN;

-- Add new balance columns to the 'users' table for the internal game/swap ledger.
-- We use a safe method to add columns only if they don't already exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='balance') THEN
        ALTER TABLE users ADD COLUMN balance NUMERIC(18, 9) NOT NULL DEFAULT 0;
        RAISE NOTICE 'Column "balance" added to "users" table.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='ton_balance') THEN
        ALTER TABLE users ADD COLUMN ton_balance NUMERIC(18, 9) NOT NULL DEFAULT 0;
        RAISE NOTICE 'Column "ton_balance" added to "users" table.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='usdt_balance') THEN
        ALTER TABLE users ADD COLUMN usdt_balance NUMERIC(18, 6) NOT NULL DEFAULT 0;
        RAISE NOTICE 'Column "usdt_balance" added to "users" table.';
    END IF;
END$$;


-- Create the 'plinko_games' table to store results of the Plinko game.
-- The user is identified by their wallet address, consistent with your architecture.
CREATE TABLE IF NOT EXISTS plinko_games (
    id SERIAL PRIMARY KEY,
    user_wallet_address TEXT NOT NULL,
    bet_amount NUMERIC(16, 4) NOT NULL,
    risk TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    multiplier NUMERIC(10, 4) NOT NULL,
    payout NUMERIC(16, 4) NOT NULL,
    path JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create the 'swaps' table to log all token swaps.
CREATE TABLE IF NOT EXISTS swaps (
    id SERIAL PRIMARY KEY,
    user_wallet_address TEXT NOT NULL,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    from_amount NUMERIC(18, 9) NOT NULL,
    to_amount NUMERIC(18, 9) NOT NULL,
    rate NUMERIC(18, 9) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create the 'transactions' table if it doesn't exist, to log all balance changes.
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_wallet_address TEXT NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC(18, 9) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Add indexes for faster lookups on commonly queried columns.
CREATE INDEX IF NOT EXISTS idx_plinko_games_user_wallet_address ON plinko_games(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_swaps_user_wallet_address ON swaps(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_user_wallet_address ON transactions(user_wallet_address);

COMMIT;

