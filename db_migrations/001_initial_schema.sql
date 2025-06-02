-- Schema for ARIX Terminal: USDT Rewards & Multi-Level Referral Staking

DROP TABLE IF EXISTS referral_rewards CASCADE;
DROP TABLE IF EXISTS user_usdt_withdrawals CASCADE;
DROP TABLE IF EXISTS user_stakes CASCADE;
DROP TABLE IF EXISTS staking_plans CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS coinflip_history CASCADE;

CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(68) PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    username VARCHAR(255),
    referrer_wallet_address VARCHAR(68) REFERENCES users(wallet_address) ON DELETE SET NULL, -- L1 referrer
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- For storing claimable USDT balance from rewards and referral bonuses
    claimable_usdt_balance NUMERIC(20, 6) DEFAULT 0.00 NOT NULL
);

CREATE TABLE IF NOT EXISTS staking_plans (
    plan_id SERIAL PRIMARY KEY,
    plan_key VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'STARTER', 'BUILDER'
    title VARCHAR(100) NOT NULL,
    duration_days INTEGER NOT NULL,
    
    -- USDT Reward Configuration (calculated by backend)
    fixed_usdt_apr_percent NUMERIC(5, 2) NOT NULL, -- e.g., 10.00 for 10% APR on staked value for USDT rewards

    -- ARIX Principal Staking Terms (handled by ARIX Staking Smart Contract)
    arix_early_unstake_penalty_percent NUMERIC(5, 2) NOT NULL, -- Penalty on ARIX principal if unstaked early from SC
    min_stake_arix NUMERIC(20, 9) DEFAULT 0,
    max_stake_arix NUMERIC(20, 9),

    -- Referral System Percentages (applied to the value of the new user's investment)
    referral_l1_invest_percent NUMERIC(5, 2) DEFAULT 0, -- e.g., 5% of new user's staked USDT value for L1 referrer
    referral_l2_invest_percent NUMERIC(5, 2) DEFAULT 0, -- e.g., 1% of new user's staked USDT value for L2 referrer

    -- Referral System Percentages (applied to the L1 referrer's direct reward - for Advanced/VIP type logic)
    -- These are percentages of the L1 referrer's *own* direct reward from the new user's stake, paid to L1 and L2 respectively.
    -- This interpretation might need adjustment based on precise client meaning of "X% of referral's reward".
    -- Assuming "referral's reward" means the L1 referrer's direct bonus from the investment.
    referral_l1_reward_percent_of_l1_direct_bonus NUMERIC(5,2) DEFAULT 0, -- For "Advanced/VIP" L1: X% of their own direct bonus from the investment
    referral_l2_reward_percent_of_l1_direct_bonus NUMERIC(5,2) DEFAULT 0, -- For "Advanced/VIP" L2: Y% of L1's direct bonus from the investment

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_stakes (
    stake_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES users(wallet_address),
    staking_plan_id INTEGER NOT NULL REFERENCES staking_plans(plan_id),
    
    -- ARIX Principal Details
    arix_amount_staked NUMERIC(20, 9) NOT NULL, 
    reference_usdt_value_at_stake_time NUMERIC(20, 6) NOT NULL, -- USDT value of ARIX at time of staking
    stake_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- When ARIX stake became active/confirmed
    unlock_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- When ARIX principal can be unstaked without penalty
    
    -- ARIX Smart Contract Interaction Details
    onchain_stake_tx_boc TEXT,
    onchain_stake_tx_hash VARCHAR(64) UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_confirmation', 
        -- pending_confirmation (ARIX sent to SC, awaiting backend verification)
        -- active (ARIX stake verified on-chain, earning USDT rewards)
        -- pending_arix_unstake_confirmation (user initiated ARIX unstake via SC, awaiting backend verification)
        -- early_arix_unstaked (ARIX principal returned early with penalty)
        -- completed_arix_unstaked (ARIX principal returned full term)
        -- stake_failed (on-chain ARIX stake verification failed)
        -- unstake_failed (on-chain ARIX unstake verification failed)

    -- USDT Reward Tracking (Managed by Backend)
    usdt_reward_accrued_total NUMERIC(20, 6) DEFAULT 0.00, -- Total USDT rewards accrued over the stake's life
    last_usdt_reward_calc_timestamp TIMESTAMP WITH TIME ZONE, -- Last time monthly USDT reward was calculated for this stake

    -- ARIX Principal Post-Unstake Details
    arix_penalty_applied NUMERIC(20, 9) DEFAULT 0, -- ARIX penalty amount if unstaked early
    arix_final_reward_calculated NUMERIC(20, 9) DEFAULT 0, -- If ARIX SC itself gave any ARIX reward (unlikely with USDT model)
    onchain_unstake_tx_boc TEXT, 
    onchain_unstake_tx_hash VARCHAR(64) UNIQUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referral_rewards (
    reward_id SERIAL PRIMARY KEY,
    stake_id UUID REFERENCES user_stakes(stake_id) ON DELETE SET NULL, -- The stake that triggered this referral reward
    referrer_wallet_address VARCHAR(68) NOT NULL REFERENCES users(wallet_address),
    referred_wallet_address VARCHAR(68) NOT NULL REFERENCES users(wallet_address), -- The user who made the investment/earned reward
    level INTEGER NOT NULL, -- 1 for L1, 2 for L2
    reward_type VARCHAR(50) NOT NULL, -- e.g., 'investment_percentage', 'reward_percentage'
    reward_amount_usdt NUMERIC(20, 6) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_payout', -- pending_payout, paid, failed
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_usdt_withdrawals (
    withdrawal_id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES users(wallet_address),
    amount_usdt NUMERIC(20, 6) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    onchain_tx_hash VARCHAR(64) UNIQUE, -- Hash of the USDT transfer from backend wallet to user
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_stakes_wallet_address ON user_stakes(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_stakes_status ON user_stakes(status);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_wallet_address);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);
CREATE INDEX IF NOT EXISTS idx_user_usdt_withdrawals_user ON user_usdt_withdrawals(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_usdt_withdrawals_status ON user_usdt_withdrawals(status);

-- Example Staking Plan Data (Align with client image for referral rewards)
-- Assuming 'Starter', 'Builder', 'Advanced', 'VIP' are plan_keys
-- USDT APRs are illustrative.
INSERT INTO staking_plans (
    plan_key, title, duration_days, 
    fixed_usdt_apr_percent, arix_early_unstake_penalty_percent, min_stake_arix,
    referral_l1_invest_percent, referral_l2_invest_percent,
    referral_l1_reward_percent_of_l1_direct_bonus, referral_l2_reward_percent_of_l1_direct_bonus, 
    is_active
) VALUES
('STARTER', 'Starter Plan', 30, 5.00, 10.00, 100,   5.00, 1.00,  0.00, 0.00, TRUE),
('BUILDER', 'Builder Plan', 60, 7.00, 8.00, 500,    7.00, 2.00,  0.00, 0.00, TRUE),
('ADVANCED', 'Advanced Plan', 90, 10.00, 6.00, 1000,  10.00, 0.00,  0.00, 3.00, TRUE), -- L2 gets % of L1's direct investment bonus
('VIP', 'VIP Plan', 120, 12.00, 5.00, 5000,        12.00, 0.00,  0.00, 5.00, TRUE)  -- L2 gets % of L1's direct investment bonus
ON CONFLICT (plan_key) DO UPDATE SET
    title = EXCLUDED.title,
    duration_days = EXCLUDED.duration_days,
    fixed_usdt_apr_percent = EXCLUDED.fixed_usdt_apr_percent,
    arix_early_unstake_penalty_percent = EXCLUDED.arix_early_unstake_penalty_percent,
    min_stake_arix = EXCLUDED.min_stake_arix,
    referral_l1_invest_percent = EXCLUDED.referral_l1_invest_percent,
    referral_l2_invest_percent = EXCLUDED.referral_l2_invest_percent,
    referral_l1_reward_percent_of_l1_direct_bonus = EXCLUDED.referral_l1_reward_percent_of_l1_direct_bonus,
    referral_l2_reward_percent_of_l1_direct_bonus = EXCLUDED.referral_l2_reward_percent_of_l1_direct_bonus,
    is_active = EXCLUDED.is_active;

-- Note on referral_l1_reward_percent_of_l1_direct_bonus & referral_l2_reward_percent_of_l1_direct_bonus:
-- The client image says "X% of referral's reward" for Advanced/VIP L2.
-- This schema interprets "referral's reward" as the L1 referrer's direct bonus from the new user's investment.
-- If it means L2 gets a % of L1's *total accumulated earnings* or *monthly USDT reward from that stake*, the logic in earnService and potentially this schema would need adjustment.
-- For "Advanced L1: 10% of investment", this is covered by referral_l1_invest_percent.
-- The "X% of referral's reward" for Advanced/VIP L1 is not explicitly in the client image, so set to 0. If L1 also gets a % of their own direct bonus, this column can be used.
