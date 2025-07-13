#!/bin/bash
set -e

# --- Configuration ---
RAILWAY_PROJECT_ID="42bb1cdd-7437-4092-82e1-93d44b5a1498"
# This variable might not be used directly in this script but is good to keep for reference.
RAILWAY_DB_URL="postgresql://postgres:sqtTKgGjtyjNRQZerlBLLHyRtkwxyXHV@hopper.proxy.rlwy.net:17374/railway" 

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}--- OXYBLE Terminal Backend Deployment Script ---${NC}"
echo ""

# --- PART 1: DEPLOY LATEST BACKEND CODE ---

# Step 1: Tool Verification
echo -e "${BLUE}[1/4] Verifying required tools...${NC}"
if ! command -v railway &> /dev/null; then
    echo -e "${RED}FATAL: 'railway' CLI tool not installed. Please install it first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Railway CLI is available.${NC}"

# Step 2: Railway Login & Linking
echo -e "${BLUE}[2/4] Authenticating and linking with Railway...${NC}"
if ! railway whoami &>/dev/null; then railway login; fi
if [ ! -f "railway.json" ]; then
    echo "Linking project to local directory..."
    if ! railway link "$RAILWAY_PROJECT_ID" 2>/dev/null; then
        echo -e "${YELLOW}Direct link failed. Falling back to interactive linking...${NC}"
        railway link
    fi
fi
echo -e "${GREEN}✓ Project linked.${NC}"

# Step 3: Create environment script to pass variables
echo -e "${BLUE}[3/4] Creating environment variable file for deployment...${NC}"
# This file is used to securely pass environment variables during the deployment process.
# Railway's 'railway up' command can reference this, ensuring your secrets aren't in version control.
ENV_SCRIPT_FILE="env.sh"
cat > "$ENV_SCRIPT_FILE" << EOF
# --- Export variables for the 'railway up' command ---
export DATABASE_URL='${RAILWAY_DB_URL}'
export POSTGRES_URL='${RAILWAY_DB_URL}'
export OXYBLE_TOKEN_MASTER_ADDRESS='EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd'
export BACKEND_USDT_WALLET_ADDRESS='UQC7X42jH4O87Jpeo7kseX5HEXwEXKEm2S-FifEsjV2hgGpQ'
export BACKEND_USDT_WALLET_MNEMONIC='soldier wife alpha airport between train enhance bench citizen rubber arrange gospel bright chase gesture lecture river affair denial coast ill miracle jacket genre'
export FRONTEND_URL='https://tma-frontend-gray.vercel.app'
export STAKING_CONTRACT_ADDRESS='YOUR_TESTNET_STAKING_CONTRACT_ADDRESS_ONCE_DEPLOYED'
export TELEGRAM_BOT_TOKEN='7733811914:AAEgyald8xwMTCRsHQxdR-bu6bvvgHCUSYY'
export TON_NETWORK='testnet'
export USDT_REWARD_JETTON_MASTER_ADDRESS='EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
export USDT_TREASURY_WALLET_MNEMONIC='EQC0s4J8p69_mR1oP_6L13_S3j4w_4p5Xy_2j_Z'
export NODE_ENV='production'
EOF
echo -e "${GREEN}✓ Environment file created.${NC}"

# Step 4: Deploy the application code to Railway
echo -e "${BLUE}[4/4] Deploying application to Railway...${NC}"

# Source the environment variables so they are available to the `railway` command
source "./${ENV_SCRIPT_FILE}"

# The `railway up` command uploads your current code, builds it using your Dockerfile,
# and starts the new container with the sourced environment variables.
# The --detach flag returns control to the terminal immediately.
railway up --detach

echo ""
echo -e "${GREEN}🚀 === BACKEND DEPLOYMENT INITIATED === 🚀${NC}"
echo ""
echo -e "${YELLOW}Your backend is now building and deploying on Railway.${NC}"
echo -e "Monitor deployment status with: ${BLUE}railway logs${NC}"
echo -e "Or view the deployment activity at: ${BLUE}https://railway.app/project/${RAILWAY_PROJECT_ID}/deployments${NC}"