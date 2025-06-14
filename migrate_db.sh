#!/bin/bash
set -e

# --- Configuration ---
NEON_DB_URL="postgresql://neondb_owner:npg_0ngYqcX8vSQI@ep-proud-math-a4sxlwf8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
RAILWAY_PROJECT_NAME="ar-backend"

# --- Colors for Output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}--- ARIX Terminal Final Automated Deployment & Migration ---${NC}"
echo ""

# --- PART 1: AUTO-FIXING & DEPLOYING APPLICATION ---

echo -e "${YELLOW}### PART 1: PREPARING AND DEPLOYING APPLICATION ###${NC}"

# Step 1: Automated Code & Dependency Fix
echo -e "${BLUE}[1/5] Analyzing and automatically fixing project files...${NC}"

# Automatically create a guaranteed-correct package.json file
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
    "node": "18.x"
  },
  "dependencies": {
    "@orbs-network/ton-access": "^2.3.3",
    "@ton/core": "^0.56.3",
    "@ton/crypto": "^3.2.0",
    "@ton/ton": "^13.11.2",
    "axios": "^1.6.8",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "express-rate-limit": "^7.2.0",
    "helmet": "^7.1.0",
    "node-pg-migrate": "^7.4.0",
    "node-telegram-bot-api": "^0.65.1",
    "pg": "^8.11.5",
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "morgan": "^1.10.0",
    "nodemon": "^3.1.0"
  }
}
EOF
echo -e "${GREEN}Success: package.json has been rebuilt correctly.${NC}"

# Automatically fix app.js using a reliable sed command for macOS
sed -i.bak '/startCrashGameEngine/d' ./src/app.js
echo -e "${GREEN}Success: Removed legacy game engine call from app.js.${NC}"

# Step 2: Set Correct Node.js Version & Install Dependencies
echo -e "${BLUE}[2/5] Setting up environment and installing dependencies...${NC}"
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
else
    echo -e "${YELLOW}NVM not found, installing...${NC}"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    source "$NVM_DIR/nvm.sh"
fi
nvm use 18 || nvm install 18
echo -e "${GREEN}Now using Node version $(node -v) and npm version $(npm -v)${NC}"

echo -e "${YELLOW}Installing all dependencies from scratch...${NC}"
rm -rf node_modules package-lock.json
npm install
echo -e "${GREEN}Dependencies are synchronized.${NC}"

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
echo -e "${BLUE}[4/5] Committing all fixes and deploying to Railway...${NC}"
git add .
git commit -m "Automated deployment: Fix code and dependencies" --allow-empty
echo -e "${YELLOW}Deploying application. This will wait for the build to complete and show live logs...${NC}"
railway up

# Step 5: Set Environment Variables
echo -e "${BLUE}[5/5] Setting Production Environment Variables...${NC}"
railway variables set NODE_ENV=production

echo -e "${GREEN}### DEPLOYMENT SUCCESSFUL ###${NC}"
echo ""

# --- PART 2: MIGRATING DATABASE ---

echo -e "${YELLOW}### PART 2: MIGRATING DATA FROM NEON TO RAILWAY ###${NC}"

# Step 1: Update Local PostgreSQL Tools
echo -e "${BLUE}[1/3] Updating local PostgreSQL tools...${NC}"
brew update > /dev/null
brew upgrade libpq > /dev/null
PG_DUMP_PATH=$(brew --prefix libpq)/bin/pg_dump
echo -e "${GREEN}PostgreSQL tools are up to date.${NC}"

# Step 2: Export from Neon
DUMP_FILE="neon_dump.sql"
echo -e "${BLUE}[2/3] Exporting data from Neon...${NC}"
"$PG_DUMP_PATH" "$NEON_DB_URL" --clean --no-owner --no-privileges > "$DUMP_FILE"
echo -e "${GREEN}Successfully exported data from Neon.${NC}"

# Step 3: Import to Railway
echo -e "${BLUE}[3/3] Importing data into Railway PostgreSQL database...${NC}"
railway run --service "${RAILWAY_PROJECT_NAME}" -- psql < "$DUMP_FILE"
echo -e "${GREEN}Successfully imported data into Railway.${NC}"

# --- Cleanup and Final Instructions ---
rm "$DUMP_FILE"
rm -f ./src/app.js.bak
echo ""
echo -e "${GREEN}--- FULL DEPLOYMENT AND MIGRATION COMPLETE ---${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Add your other secrets (CORS_WHITELIST, etc.) in the Railway Dashboard.${NC}"
echo ""
railway open

