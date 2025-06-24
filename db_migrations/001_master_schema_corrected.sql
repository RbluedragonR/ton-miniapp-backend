-- =============================================================================
-- ARIX TERMINAL - MASTER DATABASE SCHEMA (CORRECTED & COMPLETE)
-- Version 1.3 - Integrated performance fixes for Crash Game
--
-- This script creates the entire database schema from scratch and is fully
-- aligned with the application logic in the src/ folder.
-- =============================================================================

BEGIN;

-- Drop existing objects to ensure a clean slate
DROP TABLE IF EXISTS 
    public.announcements,
    public.referral_rewards,
    public.user_usdt_withdrawals,
    public.user_arix_withdrawals,
    public.user_task_completions,
    public.tasks,
    public.coinflip_history,
    public.crash_bets,
    public.crash_rounds,
    public.plinko_games,
    public.swaps,
    public.transactions,
    public.user_stakes,
    public.staking_plans,
    public.users
CASCADE;

DROP FUNCTION IF EXISTS public.generate_referral_code();
DROP FUNCTION IF EXISTS public.set_referral_code();


-- Function to generate a random referral code
CREATE FUNCTION public.generate_referral_code()
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
CREATE FUNCTION public.set_referral_code()
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


-- Table for Users
CREATE TABLE public.users (
    wallet_address VARCHAR(68) PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    username VARCHAR(255),
    referral_code VARCHAR(10) UNIQUE,
    referrer_wallet_address VARCHAR(68) REFERENCES public.users(wallet_address) ON DELETE SET NULL,
    claimable_usdt_balance NUMERIC(20, 6) NOT NULL DEFAULT 0.00,
    claimable_arix_rewards NUMERIC(20, 9) NOT NULL DEFAULT 0.00,
    -- Internal balances for swap/games feature
    balance NUMERIC(20, 9) NOT NULL DEFAULT 0.00, -- Represents ARIX balance
    usdt_balance NUMERIC(20, 6) NOT NULL DEFAULT 0.00,
    ton_balance NUMERIC(20, 9) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_referrer ON public.users(referrer_wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);

CREATE TRIGGER users_before_insert_set_referral_code
BEFORE INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION set_referral_code();


-- Tables for Staking/Earn Feature
CREATE TABLE public.staking_plans (
    plan_id SERIAL PRIMARY KEY,
    plan_key VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(100) NOT NULL,
    duration_days INTEGER NOT NULL,
    fixed_usdt_apr_percent NUMERIC(5, 2) NOT NULL,
    arix_early_unstake_penalty_percent NUMERIC(5, 2) NOT NULL,
    min_stake_usdt NUMERIC(10, 2) DEFAULT 0,
    max_stake_usdt NUMERIC(10, 2),
    referral_l1_invest_percent NUMERIC(5, 2) DEFAULT 0,
    referral_l2_invest_percent NUMERIC(5, 2) DEFAULT 0,
    referral_l2_commission_on_l1_bonus_percent NUMERIC(5, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.user_stakes (
    stake_id UUID PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES public.users(wallet_address),
    staking_plan_id INTEGER NOT NULL REFERENCES public.staking_plans(plan_id),
    arix_amount_staked NUMERIC(20, 9) NOT NULL,
    reference_usdt_value_at_stake_time NUMERIC(20, 6) NOT NULL,
    usdt_reward_accrued_total NUMERIC(20, 6) DEFAULT 0,
    arix_penalty_applied NUMERIC(20, 9) DEFAULT 0,
    arix_final_reward_calculated NUMERIC(20, 9) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_confirmation',
    stake_timestamp TIMESTAMPTZ NOT NULL,
    unlock_timestamp TIMESTAMPTZ NOT NULL,
    last_usdt_reward_calc_timestamp TIMESTAMPTZ,
    onchain_stake_tx_hash VARCHAR(64) UNIQUE,
    onchain_stake_tx_boc TEXT,
    onchain_unstake_tx_hash VARCHAR(64) UNIQUE,
    onchain_unstake_tx_boc TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_stakes_wallet_address ON public.user_stakes(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_stakes_status ON public.user_stakes(status);


-- Tables for Referrals (REQUIRED BY referralService)
CREATE TABLE public.referral_rewards (
    reward_id SERIAL PRIMARY KEY,
    stake_id UUID REFERENCES public.user_stakes(stake_id) ON DELETE SET NULL,
    referrer_wallet_address VARCHAR(68) NOT NULL REFERENCES public.users(wallet_address),
    referred_wallet_address VARCHAR(68) NOT NULL REFERENCES public.users(wallet_address),
    level INTEGER NOT NULL,
    reward_type VARCHAR(50) NOT NULL,
    reward_amount_usdt NUMERIC(20, 6) NOT NULL,
    status VARCHAR(20) DEFAULT 'credited' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON public.referral_rewards(referrer_wallet_address);


-- Tables for Games
CREATE TABLE public.coinflip_history (
    game_id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES public.users(wallet_address),
    bet_amount_arix NUMERIC(20, 9),
    choice VARCHAR(10),
    server_coin_side VARCHAR(10),
    outcome VARCHAR(10),
    amount_delta_arix NUMERIC(20, 9),
    played_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coinflip_history_wallet_address ON public.coinflip_history(user_wallet_address);

CREATE TABLE public.crash_rounds (
    id SERIAL PRIMARY KEY,
    crash_multiplier NUMERIC(10, 2) NOT NULL, -- Matched to game logic
    server_seed VARCHAR(255),
    public_hash VARCHAR(255),
    hashed_server_seed VARCHAR(255) NOT NULL, -- The engine REQUIRES this to be NOT NULL.
    status VARCHAR(20) DEFAULT 'waiting' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- ### PERFORMANCE FIX: Added index for fetching game history efficiently ###
CREATE INDEX IF NOT EXISTS idx_crash_rounds_status_id ON public.crash_rounds(status, id DESC);


CREATE TABLE public.crash_bets (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES public.crash_rounds(id) ON DELETE CASCADE,
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES public.users(wallet_address),
    bet_amount_arix NUMERIC(20, 9),
    status VARCHAR(20),
    cash_out_multiplier NUMERIC(10, 2),
    payout_arix NUMERIC(20, 9),
    placed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crash_bets_wallet_address ON public.crash_bets(user_wallet_address);
-- Performance improvement for looking up bets for a game round
CREATE INDEX IF NOT EXISTS idx_crash_bets_game_id ON public.crash_bets(game_id);


CREATE TABLE public.plinko_games (
    id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL,
    bet_amount NUMERIC(16, 4) NOT NULL,
    risk VARCHAR(10) NOT NULL,
    "rows" INTEGER NOT NULL,
    multiplier NUMERIC(10, 4) NOT NULL,
    payout NUMERIC(16, 4) NOT NULL,
    path JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plinko_games_user_wallet_address ON public.plinko_games(user_wallet_address);


-- Tables for Tasks (REQUIRED BY taskService)
CREATE TABLE public.tasks (
    task_id SERIAL PRIMARY KEY,
    task_key VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    reward_arix_amount NUMERIC(20, 9) DEFAULT 0,
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

CREATE TABLE public.user_task_completions (
    completion_id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES public.users(wallet_address),
    task_id INT NOT NULL REFERENCES public.tasks(task_id),
    status VARCHAR(30) NOT NULL DEFAULT 'pending_verification',
    submission_data JSONB,
    completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMPTZ,
    reward_credited_at TIMESTAMPTZ,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_task_completions_user_task ON public.user_task_completions(user_wallet_address, task_id);


-- Tables for Withdrawals (REQUIRED by earnService)
CREATE TABLE public.user_arix_withdrawals (
    withdrawal_id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES public.users(wallet_address),
    amount_arix NUMERIC(20, 9) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending_payout' NOT NULL,
    onchain_tx_hash VARCHAR(64) UNIQUE,
    requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ
);

CREATE TABLE public.user_usdt_withdrawals (
    withdrawal_id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES public.users(wallet_address),
    amount_usdt NUMERIC(20, 6) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    onchain_tx_hash VARCHAR(64) UNIQUE,
    notes TEXT,
    requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ
);

-- Table for Announcements (REQUIRED by pushService)
CREATE TABLE public.announcements (
    announcement_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    image_url TEXT,
    action_url TEXT,
    action_text VARCHAR(100),
    is_pinned BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    published_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_announcements_active_pinned ON public.announcements(is_active, is_pinned DESC, published_at DESC);


-- Tables for Swap and Ledger (REQUIRED by swapService and userService)
CREATE TABLE public.swaps (
    id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL,
    from_currency VARCHAR(10) NOT NULL,
    to_currency VARCHAR(10) NOT NULL,
    from_amount NUMERIC(20, 9) NOT NULL,
    to_amount NUMERIC(20, 9) NOT NULL,
    rate NUMERIC(20, 9) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.transactions (
    id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(68) NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount NUMERIC(20, 9) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_wallet_address ON public.transactions(user_wallet_address);


COMMIT;