-- Updated Schema for ARIX Terminal Backend (ARIX-Only Staking with Fixed APR)

DROP TABLE IF EXISTS user_stakes CASCADE;
DROP TABLE IF EXISTS staking_plans CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(68) PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    username VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staking_plans (
    plan_id SERIAL PRIMARY KEY,
    plan_key VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(100) NOT NULL,
    duration_days INTEGER NOT NULL,
    fixed_apr_percent NUMERIC(5, 2) NOT NULL, -- Renamed from base_apr, removed bonus_apr
    early_unstake_penalty_percent NUMERIC(5, 2) NOT NULL,
    min_stake_arix NUMERIC(20, 9) DEFAULT 0,
    max_stake_arix NUMERIC(20, 9),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_stakes (
    stake_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES users(wallet_address),
    staking_plan_id INTEGER NOT NULL REFERENCES staking_plans(plan_id),
    arix_amount_staked NUMERIC(20, 9) NOT NULL, 
    reference_usdt_value_at_stake_time NUMERIC(20, 6),
    stake_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    unlock_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    onchain_stake_tx_boc TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active', 
    arix_reward_calculated NUMERIC(20, 9),
    arix_reward_paid NUMERIC(20, 9) DEFAULT 0,
    onchain_unstake_tx_boc TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_stakes_wallet_address ON user_stakes(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_stakes_status ON user_stakes(status);

-- Example Staking Plan Data (Updated with Fixed APR structure)
INSERT INTO staking_plans (plan_key, title, duration_days, fixed_apr_percent, early_unstake_penalty_percent, min_stake_arix) VALUES
('PLAN_30D', '30 Day Stake', 30, 1.00, 7.00, 100),
('PLAN_60D', '60 Day Stake', 60, 2.00, 8.00, 200),
('PLAN_120D', '120 Day Stake', 120, 3.00, 9.00, 500),
('PLAN_240D', '240 Day Stake', 240, 4.00, 10.00, 1000)
ON CONFLICT (plan_key) DO UPDATE SET
    title = EXCLUDED.title,
    duration_days = EXCLUDED.duration_days,
    fixed_apr_percent = EXCLUDED.fixed_apr_percent,
    early_unstake_penalty_percent = EXCLUDED.early_unstake_penalty_percent,
    min_stake_arix = EXCLUDED.min_stake_arix,
    is_active = EXCLUDED.is_active;
