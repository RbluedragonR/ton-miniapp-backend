#!/bin/bash
set -e

# --- Configuration ---
NEON_DB_URL="postgresql://neondb_owner:npg_0ngYqcX8vSQI@ep-proud-math-a4sxlwf8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
RAILWAY_PROJECT_NAME="ar-backend"
MISSING_PACKAGE="@orbs-network/ton-access"

# --- Colors for Output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}--- ARIX Terminal Full Deployment & Migration Script ---${NC}"
echo ""

# --- PART 1: FIX & DEPLOY ---

echo -e "${YELLOW}### PART 1: PREPARING AND DEPLOYING APPLICATION ###${NC}"

# Step 1: Check System Dependencies
echo -e "${BLUE}[1/5] Checking for required tools...${NC}"
if ! command -v brew &> /dev/null; then
    echo -e "${RED}Homebrew not found. Installing...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
if ! command -v railway &> /dev/null; then
    echo -e "${RED}Railway CLI not found. Installing...${NC}"
    brew install railway
fi
echo -e "${GREEN}System tools are ready.${NC}"

# Step 2: Fix Project Dependencies
echo -e "${BLUE}[2/5] Analyzing and fixing project dependencies...${NC}"
if ! grep -q "$MISSING_PACKAGE" package.json; then
    echo -e "${YELLOW}Missing critical dependency '$MISSING_PACKAGE'. Installing now...${NC}"
    npm install --save "$MISSING_PACKAGE"
    echo -e "${GREEN}Dependency added.${NC}"
fi
echo -e "${YELLOW}Syncing package-lock.json to ensure a clean build...${NC}"
rm -f package-lock.json
npm install
echo -e "${GREEN}Project dependencies are now correct.${NC}"

# Step 3: Login and Link Project
echo -e "${BLUE}[3/5] Logging in and linking to Railway project...${NC}"
if ! railway whoami &>/dev/null; then
    railway login
fi
if ! [ -f "railway.json" ]; then
    echo -e "${YELLOW}Linking to your existing '${RAILWAY_PROJECT_NAME}' project...${NC}"
    railway link
else
    echo -e "${GREEN}Project is already linked.${NC}"
fi

# Step 4: Commit and Deploy
echo -e "${BLUE}[4/5] Committing fixes and deploying to Railway...${NC}"
git add .
git commit -m "Automated build fix and deployment" --allow-empty
echo -e "${YELLOW}Deploying application. This will take a few minutes. Waiting for completion...${NC}"
railway up

echo -e "${BLUE}[5/5] Setting Production Environment Variables...${NC}"
railway variables set NODE_ENV=production

echo -e "${GREEN}### DEPLOYMENT SUCCESSFUL ###${NC}"
echo ""

# --- PART 2: DATABASE MIGRATION ---

echo -e "${YELLOW}### PART 2: MIGRATING DATA FROM NEON TO RAILWAY ###${NC}"

# Step 1: Update Local PostgreSQL Tools
echo -e "${BLUE}[1/3] Updating local PostgreSQL tools for compatibility...${NC}"
brew update > /dev/null
brew upgrade libpq
PG_DUMP_PATH=$(brew --prefix libpq)/bin/pg_dump
echo -e "${GREEN}PostgreSQL tools are up to date.${NC}"

# Step 2: Export from Neon
DUMP_FILE="neon_dump.sql"
echo -e "${BLUE}[2/3] Exporting data from Neon...${NC}"
"$PG_DUMP_PATH" "$NEON_DB_URL" --clean --no-owner --no-privileges > "$DUMP_FILE"
echo -e "${GREEN}Successfully exported data from Neon.${NC}"

# Step 3: Import to Railway
echo -e "${BLUE}[3/3] Importing data into Railway PostgreSQL database...${NC}"
railway connect --service "Postgres" -- psql < "$DUMP_FILE"
echo -e "${GREEN}Successfully imported data into Railway.${NC}"

# --- Cleanup and Final Instructions ---
rm "$DUMP_FILE"
echo ""
echo -e "${GREEN}--- FULL DEPLOYMENT AND MIGRATION COMPLETE ---${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: You must still add your secret environment variables (like CORS_WHITELIST)${NC}"
echo -e "${YELLOW}in the Railway Dashboard under your project's 'Variables' tab.${NC}"
echo ""
railway open
