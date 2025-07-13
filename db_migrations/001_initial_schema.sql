--
-- PostgreSQL database schema
--
-- FIX: Drop existing tables to ensure a clean slate.
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS referral_rewards CASCADE;
DROP TABLE IF EXISTS user_usdt_withdrawals CASCADE;
DROP TABLE IF EXISTS user_OXYBLE_withdrawals CASCADE;
DROP TABLE IF EXISTS user_task_completions CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS coinflip_history CASCADE;
DROP TABLE IF EXISTS crash_rounds CASCADE;
DROP TABLE IF EXISTS crash_games CASCADE;
DROP TABLE IF EXISTS user_stakes CASCADE;
DROP TABLE IF EXISTS staking_plans CASCADE;
DROP TABLE IF EXISTS users CASCADE;


-- Function to generate a random referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR AS $$
DECLARE
  chars TEXT[] := '{A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,0,1,2,3,4,5,6,7,8,9}';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || chars[1+random()*(array_length(chars, 1)-1)];
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to set a referral code for new users
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    LOOP
      NEW.referral_code := generate_referral_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE referral_code = NEW.referral_code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(68) PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    username VARCHAR(255),
    referral_code VARCHAR(10) UNIQUE,
    referrer_wallet_address VARCHAR(68) REFERENCES users(wallet_address) ON DELETE SET NULL,
    claimable_usdt_balance NUMERIC(20, 6) NOT NULL DEFAULT 0.00,
    claimable_OXYBLE_rewards NUMERIC(20, 9) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- Trigger for new user referral codes
DROP TRIGGER IF EXISTS users_before_insert_set_referral_code ON users;
CREATE TRIGGER users_before_insert_set_referral_code
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION set_referral_code();


-- Staking Plans
CREATE TABLE IF NOT EXISTS staking_plans (
    plan_id SERIAL PRIMARY KEY,
    plan_key VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(100) NOT NULL,
    duration_days INT NOT NULL,
    fixed_usdt_apr_percent NUMERIC(5, 2) NOT NULL,
    OXYBLE_early_unstake_penalty_percent NUMERIC(5, 2) NOT NULL,
    min_stake_usdt NUMERIC(10, 2) DEFAULT 0,
    max_stake_usdt NUMERIC(10, 2),
    referral_l1_invest_percent NUMERIC(5, 2) DEFAULT 0,
    referral_l2_invest_percent NUMERIC(5, 2) DEFAULT 0,
    referral_l2_commission_on_l1_bonus_percent NUMERIC(5, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- User Stakes
CREATE TABLE IF NOT EXISTS user_stakes (
    stake_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES users(wallet_address),
    staking_plan_id INT NOT NULL REFERENCES staking_plans(plan_id),
    OXYBLE_amount_staked NUMERIC(20, 9) NOT NULL,
    reference_usdt_value_at_stake_time NUMERIC(20, 6) NOT NULL,
    stake_timestamp TIMESTAMPTZ NOT NULL,
    unlock_timestamp TIMESTAMPTZ NOT NULL,
    onchain_stake_tx_boc TEXT,
    onchain_stake_tx_hash VARCHAR(64) UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_confirmation',
    usdt_reward_accrued_total NUMERIC(20, 6) DEFAULT 0.00,
    last_usdt_reward_calc_timestamp TIMESTAMPTZ,
    OXYBLE_penalty_applied NUMERIC(20, 9) DEFAULT 0.00,
    OXYBLE_final_reward_calculated NUMERIC(20, 9) DEFAULT 0.00,
    onchain_unstake_tx_boc TEXT,
    onchain_unstake_tx_hash VARCHAR(64) UNIQUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_stakes_wallet_address ON user_stakes(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_stakes_status ON user_stakes(status);


-- *** FIX: Add missing 'hashed_server_seed' column to match application code ***
CREATE TABLE IF NOT EXISTS crash_games (
    id SERIAL PRIMARY KEY,
    crash_multiplier NUMERIC(10, 2) NOT NULL,
    server_seed VARCHAR(255),
    public_hash VARCHAR(255),
    hashed_server_seed VARCHAR(255), -- This was the missing column
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- This table is kept to accept the data from the Neon dump without errors.
CREATE TABLE IF NOT EXISTS crash_rounds (
    id SERIAL PRIMARY KEY,
    crash_multiplier NUMERIC(10, 2) NOT NULL,
    server_seed VARCHAR(255),
    public_hash VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Coinflip History
CREATE TABLE IF NOT EXISTS coinflip_history (
    game_id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES users(wallet_address),
    bet_amount_OXYBLE NUMERIC(20, 9) NOT NULL,
    choice VARCHAR(10) NOT NULL,
    server_coin_side VARCHAR(10) NOT NULL,
    outcome VARCHAR(10) NOT NULL,
    amount_delta_OXYBLE NUMERIC(20, 9) NOT NULL,
    played_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_coinflip_history_user ON coinflip_history(user_wallet_address);


-- Other tables from your schema... (tasks, rewards, etc.)
CREATE TABLE IF NOT EXISTS tasks (
    task_id SERIAL PRIMARY KEY,
    task_key VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    reward_OXYBLE_amount NUMERIC(20, 9) DEFAULT 0,
    task_type VARCHAR(50) DEFAULT 'social',
    validation_type VARCHAR(50) DEFAULT 'manual',
    action_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_repeatable BOOLEAN DEFAULT FALSE,
    max_completions_user INT DEFAULT 1,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_task_completions (
    completion_id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES users(wallet_address),
    task_id INT NOT NULL REFERENCES tasks(task_id),
    status VARCHAR(30) NOT NULL DEFAULT 'pending_verification',
    submission_data JSONB,
    completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMPTZ,
    reward_credited_at TIMESTAMPTZ,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_task_completions_user_task ON user_task_completions(user_wallet_address, task_id);
CREATE INDEX IF NOT EXISTS idx_user_task_completions_status ON user_task_completions(status);

-- Withdrawals tables
CREATE TABLE IF NOT EXISTS user_OXYBLE_withdrawals (
    withdrawal_id SERIAL PRIMARY KEY,
    user_wallet_address character varying(68) NOT NULL,
    amount_OXYBLE numeric(20,9) NOT NULL,
    status character varying(20) DEFAULT 'pending_payout'::character varying NOT NULL,
    onchain_tx_hash character varying(64) UNIQUE,
    requested_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS user_usdt_withdrawals (
    withdrawal_id SERIAL PRIMARY KEY,
    user_wallet_address character varying(68) NOT NULL,
    amount_usdt numeric(20,6) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    onchain_tx_hash character varying(64) UNIQUE,
    notes text,
    requested_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS referral_rewards (
    reward_id SERIAL PRIMARY KEY,
    stake_id uuid,
    referrer_wallet_address character varying(68) NOT NULL,
    referred_wallet_address character varying(68) NOT NULL,
    level integer NOT NULL,
    reward_type character varying(50) NOT NULL,
    reward_amount_usdt numeric(20,6) NOT NULL,
    status character varying(20) DEFAULT 'credited'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
    announcement_id SERIAL PRIMARY KEY,
    title character varying(255) NOT NULL,
    content text NOT NULL,
    type character varying(50) DEFAULT 'info'::character varying,
    image_url text,
    action_url text,
    action_text character varying(100),
    is_pinned boolean DEFAULT false,
    is_active boolean DEFAULT true,
    published_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone
);
