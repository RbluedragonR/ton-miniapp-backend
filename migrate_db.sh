#!/bin/bash
set -e

# --- Configuration ---
NEON_DB_URL="postgresql://neondb_owner:npg_0ngYqcX8vSQI@ep-proud-math-a4sxlwf8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
RAILWAY_PROJECT_NAME="ar-backend" # The name of your project on Railway

# --- Colors for Output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}--- ARIX Terminal Full Deployment & Migration Script ---${NC}"
echo ""

# --- PART 1: DEPLOYMENT ---

echo -e "${YELLOW}### PART 1: DEPLOYING APPLICATION TO RAILWAY ###${NC}"

# Step 1: Check Dependencies
echo -e "${BLUE}[Step 1/4] Checking for required tools...${NC}"
if ! command -v brew &> /dev/null; then
    echo -e "${RED}Homebrew not found. Please install it first from https://brew.sh/${NC}"
    exit 1
fi
if ! command -v railway &> /dev/null; then
    echo -e "${RED}Railway CLI not found. Installing via Homebrew...${NC}"
    brew install railway
fi
echo -e "${GREEN}All required tools are installed.${NC}"

# Step 2: Login and Link Project
echo -e "${BLUE}[Step 2/4] Logging in and linking to Railway project...${NC}"
if ! railway whoami &> /dev/null; then
    railway login
fi

if ! [ -f "railway.json" ]; then
    echo -e "${YELLOW}Linking to your existing '${RAILWAY_PROJECT_NAME}' project...${NC}"
    railway link
else
    echo -e "${GREEN}Project is already linked.${NC}"
fi

# Step 3: Commit latest changes
echo -e "${BLUE}[Step 3/4] Committing latest changes...${NC}"
git add .
git commit -m "Automated deployment prep" --allow-empty

# Step 4: Deploy and Wait
echo -e "${BLUE}[Step 4/4] Deploying application. This will take a few minutes...${NC}"
echo -e "${YELLOW}The script will now wait for the deployment to complete and show live logs.${NC}"
railway up

echo -e "${GREEN}### DEPLOYMENT SUCCESSFUL ###${NC}"
echo ""

# --- PART 2: DATABASE MIGRATION ---

echo -e "${YELLOW}### PART 2: MIGRATING DATA FROM NEON TO RAILWAY ###${NC}"

# Step 1: Update Local PostgreSQL Tools
echo -e "${BLUE}[Step 1/3] Updating local PostgreSQL tools for compatibility...${NC}"
brew update > /dev/null
brew upgrade libpq
PG_DUMP_PATH=$(brew --prefix libpq)/bin/pg_dump
echo -e "${GREEN}PostgreSQL tools are up to date. Using pg_dump from ${PG_DUMP_PATH}${NC}"

# Step 2: Export from Neon
DUMP_FILE="neon_dump.sql"
echo -e "${BLUE}[Step 2/3] Exporting data from Neon...${NC}"
"$PG_DUMP_PATH" "$NEON_DB_URL" --clean --no-owner --no-privileges > "$DUMP_FILE"
echo -e "${GREEN}Successfully exported data from Neon.${NC}"

# Step 3: Import to Railway
echo -e "${BLUE}[Step 3/3] Importing data into Railway PostgreSQL database...${NC}"
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

