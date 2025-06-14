#!/bin/bash
set -e

# --- Configuration ---
RAILWAY_PROJECT_NAME="ar-backend"
RAILWAY_PROJECT_ID="42bb1cdd-7437-4092-82e1-93d44b5a1498"
RAILWAY_DB_SERVICE_NAME="Postgres-cMD6"

NEON_DB_URL="postgresql://neondb_owner:npg_0ngYqcX8vSQI@ep-proud-math-a4sxlwf8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
RAILWAY_DB_URL="postgresql://postgres:sqtTKgGjtyjNRQZerlBLLHyRtkwxyXHV@hopper.proxy.rlwy.net:17374/railway"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}--- ARIX Terminal Fully Automated Deployment Script (v16 - Final Schema Fix) ---${NC}"
echo ""

# --- PART 1: SETUP AND DEPLOYMENT ---

# Step 1: Tool Verification
echo -e "${BLUE}[1/7] Verifying required tools...${NC}"
for tool in railway psql pg_dump; do
    if ! command -v $tool &> /dev/null; then
        echo -e "${RED}FATAL: Required tool '$tool' not installed.${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ All required tools are available.${NC}"

# Step 2: Railway Login & Linking
echo -e "${BLUE}[2/7] Authenticating and linking with Railway...${NC}"
if ! railway whoami &>/dev/null; then railway login; fi
if [ ! -f "railway.json" ]; then
    if ! railway link "$RAILWAY_PROJECT_ID" 2>/dev/null; then
        echo -e "${YELLOW}Direct link failed. Falling back to interactive linking...${NC}"
        railway link
    fi
fi
echo -e "${GREEN}✓ Project linked.${NC}"

# Step 3: Create Correct Schema File with Drop statements
echo -e "${BLUE}[3/7] Creating corrected local schema file with cleanup commands...${NC}"
SCHEMA_FILE="001_corrected_schema.sql"
cat > "$SCHEMA_FILE" << 'EOF'
--
-- PostgreSQL database schema
--
-- FIX: Drop existing tables to ensure a clean slate.
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS referral_rewards CASCADE;
DROP TABLE IF EXISTS user_usdt_withdrawals CASCADE;
DROP TABLE IF EXISTS user_arix_withdrawals CASCADE;
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
    claimable_arix_rewards NUMERIC(20, 9) NOT NULL DEFAULT 0.00,
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
    arix_early_unstake_penalty_percent NUMERIC(5, 2) NOT NULL,
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
    arix_amount_staked NUMERIC(20, 9) NOT NULL,
    reference_usdt_value_at_stake_time NUMERIC(20, 6) NOT NULL,
    stake_timestamp TIMESTAMPTZ NOT NULL,
    unlock_timestamp TIMESTAMPTZ NOT NULL,
    onchain_stake_tx_boc TEXT,
    onchain_stake_tx_hash VARCHAR(64) UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_confirmation',
    usdt_reward_accrued_total NUMERIC(20, 6) DEFAULT 0.00,
    last_usdt_reward_calc_timestamp TIMESTAMPTZ,
    arix_penalty_applied NUMERIC(20, 9) DEFAULT 0.00,
    arix_final_reward_calculated NUMERIC(20, 9) DEFAULT 0.00,
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
    bet_amount_arix NUMERIC(20, 9) NOT NULL,
    choice VARCHAR(10) NOT NULL,
    server_coin_side VARCHAR(10) NOT NULL,
    outcome VARCHAR(10) NOT NULL,
    amount_delta_arix NUMERIC(20, 9) NOT NULL,
    played_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_coinflip_history_user ON coinflip_history(user_wallet_address);


-- Other tables from your schema... (tasks, rewards, etc.)
CREATE TABLE IF NOT EXISTS tasks (
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
CREATE TABLE IF NOT EXISTS user_arix_withdrawals (
    withdrawal_id SERIAL PRIMARY KEY,
    user_wallet_address character varying(68) NOT NULL,
    amount_arix numeric(20,9) NOT NULL,
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
EOF
echo -e "${GREEN}✓ Corrected schema file created.${NC}"

# Step 4: Create environment script with hardcoded variables
echo -e "${BLUE}[4/7] Creating environment script...${NC}"
ENV_SCRIPT_FILE="env.sh"
cat > "$ENV_SCRIPT_FILE" << EOF
export ARIX_TOKEN_MASTER_ADDRESS='EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd'
export BACKEND_USDT_WALLET_ADDRESS='UQC7X42jH4O87Jpeo7kseX5HEXwEXKEm2S-FifEsjV2hgGpQ'
export BACKEND_USDT_WALLET_MNEMONIC='soldier wife alpha airport between train enhance bench citizen rubber arrange gospel bright chase gesture lecture river affair denial coast ill miracle jacket genre'
export FRONTEND_URL='https://tma-frontend-gray.vercel.app'
export STAKING_CONTRACT_ADDRESS='YOUR_TESTNET_STAKING_CONTRACT_ADDRESS_ONCE_DEPLOYED'
export TELEGRAM_BOT_TOKEN='7733811914:AAEgyald8xwMTCRsHQxdR-bu6bvvgHCUSYY'
export TON_NETWORK='testnet'
export USDT_REWARD_JETTON_MASTER_ADDRESS='EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
export USDT_TREASURY_WALLET_MNEMONIC='EQC0s4J8p69_mR1oP_6L13_S3j4w_4p5Xy_2j_Z'
export DATABASE_URL='${RAILWAY_DB_URL}'
export POSTGRES_URL='${RAILWAY_DB_URL}'
export NODE_ENV='production'
EOF
echo -e "${GREEN}✓ Environment script created.${NC}"

# Step 5: Deploy Application
echo -e "${BLUE}[5/7] Deploying application to Railway...${NC}"
source "./${ENV_SCRIPT_FILE}"
echo -e "${YELLOW}--- VERIFYING EXPORTED ENVIRONMENT VARIABLES ---${NC}"
printenv | grep -E 'ARIX|BACKEND|FRONTEND|DATABASE_URL|POSTGRES_URL|TELEGRAM|NODE_ENV|USDT|TON_NETWORK'
echo -e "${YELLOW}----------------------------------------------${NC}"
railway up --detach
echo -e "${GREEN}✓ Deployment initiated.${NC}"

# Step 6: Apply Schema and Migrate Data
echo -e "${BLUE}[6/7] Applying schema and migrating data...${NC}"
echo "Waiting for deployment to stabilize (60 seconds)..."
sleep 60

echo "Applying new schema (with cleanup) to Railway database..."
psql "$RAILWAY_DB_URL" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"

echo "Exporting data from Neon..."
DUMP_FILE="neon_data_export.sql"
pg_dump "$NEON_DB_URL" --data-only > "$DUMP_FILE"

echo "Cleaning data dump file..."
sed -i.bak -e '/SET.*transaction_timeout/d' -e '/SET.*idle_in_transaction_session_timeout/d' -e '/SET.*lock_timeout/d' "$DUMP_FILE"
sed -i.bak -e '/SELECT.*setval/d' "$DUMP_FILE"

echo "Importing data to Railway..."
psql "$RAILWAY_DB_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

echo -e "${GREEN}✓ Database migration complete.${NC}"

# Step 7: Final Redeploy and Cleanup
echo -e "${BLUE}[7/7] Finalizing deployment...${NC}"
railway redeploy
echo ""
echo -e "${GREEN}🚀 === FULLY AUTOMATED DEPLOYMENT AND MIGRATION COMPLETE === 🚀${NC}"
echo ""
echo -e "${YELLOW}📋 POST-DEPLOYMENT TASKS:${NC}"
echo -e "1. Monitor Application Logs: ${BLUE}railway logs -s ar-backend${NC}"
echo -e "2. Test Application Health: ${BLUE}railway open${NC}"
