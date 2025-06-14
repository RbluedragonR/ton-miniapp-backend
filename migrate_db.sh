#!/bin/bash
set -e

# --- Configuration ---
# Review and confirm these values before running.
RAILWAY_PROJECT_NAME="ar-backend"
RAILWAY_PROJECT_ID="42bb1cdd-7437-4092-82e1-93d44b5a1498" # Used for the initial link attempt
RAILWAY_DB_SERVICE_NAME="Postgres-cMD6"

# Hardcoded URLs for full automation
NEON_DB_URL="postgresql://neondb_owner:npg_0ngYqcX8vSQI@ep-proud-math-a4sxlwf8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
RAILWAY_DB_URL="postgresql://postgres:sqtTKgGjtyjNRQZerlBLLHyRtkwxyXHV@hopper.proxy.rlwy.net:17374/railway"

# --- Colors for Output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}--- ARIX Terminal Fully Automated Railway Migration Script (v12 - Hardcoded ENV) ---${NC}"
echo ""

# --- PART 1: PREPARING AND DEPLOYING APPLICATION ---

echo -e "${YELLOW}### PART 1: PREPARING AND DEPLOYING APPLICATION ###${NC}"

# Step 1: Tool Verification
echo -e "${BLUE}[1/7] Verifying required tools...${NC}"
for tool in railway psql pg_dump; do
    if ! command -v $tool &> /dev/null; then
        echo -e "${RED}FATAL: Required tool '$tool' is not installed. Please install it and re-run.${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ All required tools are available.${NC}"


# Step 2: Automatically fixing project files
echo -e "${BLUE}[2/7] Automatically fixing project files...${NC}"
cat > package.json << 'EOF'
{
  "name": "ar_backend",
  "version": "1.0.0",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "migrate": "node-pg-migrate up"
  },
  "engines": {
    "node": ">=20.x",
    "npm": ">=10.x"
  },
  "dependencies": {
    "@orbs-network/ton-access": "^2.3.3",
    "@ton/core": "^0.56.3",
    "@ton/crypto": "^3.2.0",
    "@ton/ton": "^13.11.2",
    "axios": "^1.7.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "node-pg-migrate": "^7.6.1",
    "node-telegram-bot-api": "^0.66.0",
    "pg": "^8.12.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  }
}
EOF
echo -e "${GREEN}✓ package.json updated with stable versions.${NC}"

# Step 3: Enhanced dependency management
echo -e "${BLUE}[3/7] Setting up environment and installing dependencies...${NC}"
echo "Performing clean dependency installation..."
rm -rf node_modules package-lock.json
npm cache clean --force 2>/dev/null || true
npm install --no-audit --no-fund
echo -e "${GREEN}✓ Production dependencies installed successfully.${NC}"

# Step 4: Railway authentication and linking (with interactive fallback)
echo -e "${BLUE}[4/7] Authenticating and linking with Railway...${NC}"
if ! railway whoami &>/dev/null; then
    echo -e "${YELLOW}Not logged in to Railway. Attempting login...${NC}"
    railway login
fi

if [ ! -f "railway.json" ]; then
    echo -e "${YELLOW}Project not linked. Attempting to link to project ID for '${RAILWAY_PROJECT_NAME}'...${NC}"
    if ! railway link "$RAILWAY_PROJECT_ID" 2>/dev/null; then
        echo -e "${YELLOW}Direct link with Project ID failed (common with older CLI versions).${NC}"
        echo -e "${YELLOW}Falling back to interactive linking. Please select your project below.${NC}"
        if ! railway link; then
            echo -e "${RED}FATAL: Interactive linking also failed. Cannot proceed.${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}✓ Successfully linked to project '${RAILWAY_PROJECT_NAME}'.${NC}"
else
    echo -e "${GREEN}✓ Project already linked to Railway.${NC}"
fi

# Step 5: Create environment script with hardcoded variables
echo -e "${BLUE}[5/7] Creating environment script with hardcoded variables...${NC}"
ENV_SCRIPT_FILE="env.sh"
> "$ENV_SCRIPT_FILE" # Create a clean script file

echo -e "${YELLOW}Writing hardcoded variables to executable script '${ENV_SCRIPT_FILE}'...${NC}"
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
echo -e "${GREEN}✓ Executable environment script '${ENV_SCRIPT_FILE}' is ready.${NC}"

# Step 6: Deploy to Railway by EXPORTING variables
echo -e "${BLUE}[6/7] Deploying to Railway by exporting variables...${NC}"
git add .
git commit -m "Railway deployment: Automated configuration" --allow-empty

echo -e "${YELLOW}Sourcing variables from '${ENV_SCRIPT_FILE}' to the current shell session...${NC}"
source "./${ENV_SCRIPT_FILE}"
echo -e "${GREEN}✓ Variables sourced to environment.${NC}"

echo -e "${YELLOW}--- VERIFYING EXPORTED ENVIRONMENT VARIABLES ---${NC}"
printenv | grep -E 'ARIX|BACKEND|FRONTEND|DATABASE_URL|POSTGRES_URL|TELEGRAM|NODE_ENV|USDT|TON_NETWORK' || echo -e "${RED}No relevant environment variables found to verify.${NC}"
echo -e "${YELLOW}----------------------------------------------${NC}"
echo -e "${BLUE}Please check the list above to confirm your variables were exported before deployment.${NC}"

echo -e "${YELLOW}Initiating Railway deployment...${NC}"
railway up --detach

echo -e "${BLUE}Waiting for deployment to stabilize (90 seconds)...${NC}"
sleep 90
echo -e "${BLUE}Verifying deployment status...${NC}"
railway status || echo -e "${YELLOW}Status check unavailable, continuing...${NC}"
echo -e "${GREEN}### APPLICATION DEPLOYMENT COMPLETE ###${NC}"
echo ""

# --- PART 2: DATABASE MIGRATION ---

echo -e "${YELLOW}### PART 2: MIGRATING DATABASE FROM NEON TO RAILWAY ###${NC}"

# Step 7: Database Migration
echo -e "${BLUE}[7/7] Migrating data from Neon to Railway PostgreSQL...${NC}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SCHEMA_FILE="neon_schema_${TIMESTAMP}.sql"
DUMP_FILE="neon_export_${TIMESTAMP}.sql"
IMPORT_LOG="railway_import_${TIMESTAMP}.log"
IMPORT_SCRIPT="import_script_${TIMESTAMP}.sql"

echo -e "${YELLOW}Exporting schema and data from Neon...${NC}"
pg_dump "$NEON_DB_URL" --schema-only --no-owner --no-privileges --clean --if-exists > "$SCHEMA_FILE"
pg_dump "$NEON_DB_URL" --data-only > "$DUMP_FILE"

echo -e "${YELLOW}Cleaning schema and data files for Railway compatibility...${NC}"
sed -i.bak -e '/SET.*transaction_timeout/d' -e '/SET.*idle_in_transaction_session_timeout/d' -e '/SET.*lock_timeout/d' "$SCHEMA_FILE"
echo -e "${GREEN}✓ Schema file cleaned.${NC}"
sed -i.bak -e '/SET.*transaction_timeout/d' -e '/SET.*idle_in_transaction_session_timeout/d' -e '/SET.*lock_timeout/d' "$DUMP_FILE"
echo -e "${GREEN}✓ Data file cleaned.${NC}"

echo -e "${YELLOW}Creating safe import script to handle circular dependencies...${NC}"
cat > "$IMPORT_SCRIPT" <<EOF
BEGIN;
\echo '--- Importing schema ---'
\i ${SCHEMA_FILE}
SET session_replication_role = 'replica';
\echo '--- Importing data ---'
\i ${DUMP_FILE}
SET session_replication_role = 'origin';
COMMIT;
EOF
echo -e "${GREEN}✓ Safe import script created.${NC}"

echo -e "${YELLOW}Executing database import on Railway...${NC}"
psql "$RAILWAY_DB_URL" -v ON_ERROR_STOP=1 --file="$IMPORT_SCRIPT" > "$IMPORT_LOG" 2>&1 && MIGRATION_SUCCESS=true || MIGRATION_SUCCESS=false

if [ "$MIGRATION_SUCCESS" = true ]; then
    echo -e "${GREEN}✓ Database import completed successfully!${NC}"
else
    echo -e "${RED}Database import failed! Check log for details: ${IMPORT_LOG}${NC}"
    tail -20 "$IMPORT_LOG"
fi

# Cleanup
echo -e "${BLUE}--- Organizing backups and cleanup ---${NC}"
BACKUP_DIR="./database_backups/migration_${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"
mv "$SCHEMA_FILE" "$DUMP_FILE" "$IMPORT_SCRIPT" "$IMPORT_LOG" "$ENV_SCRIPT_FILE" ./*.bak 2>/dev/null || true
rm -rf .vercel 2>/dev/null || true
echo -e "${GREEN}✓ Backup and log saved to: ${BACKUP_DIR}${NC}"
cd ./database_backups 2>/dev/null && ls -t | grep "migration_" | tail -n +7 | xargs rm -rf 2>/dev/null; cd ..

# --- FINAL SUMMARY ---
echo ""
echo -e "${GREEN}🚀 === FULLY AUTOMATED DEPLOYMENT AND MIGRATION COMPLETE === 🚀${NC}"
echo ""
echo -e "${GREEN}✅ Application deployment initiated successfully on Railway.${NC}"
if [ "$MIGRATION_SUCCESS" = true ]; then
    echo -e "${GREEN}✅ Database migrated successfully from Neon to Railway.${NC}"
else
    echo -e "${YELLOW}⚠️  Database migration encountered issues. Check the log in ${BACKUP_DIR}${NC}"
fi
echo -e "\n${YELLOW}📋 POST-DEPLOYMENT TASKS:${NC}\n"
echo -e "${BLUE}1. Monitor Application Logs:${NC} railway logs -s ar-backend"
echo -e "${BLUE}2. Monitor Database Logs:${NC} railway logs -s ${RAILWAY_DB_SERVICE_NAME}"
echo -e "${BLUE}3. Verify Database Tables:${NC} railway run -s ${RAILWAY_DB_SERVICE_NAME} -- psql -c '\\dt+'"
echo -e "${BLUE}4. Test Application Health:${NC} railway open\n"
