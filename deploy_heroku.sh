#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}--- ARIX Terminal Railway.app Automated Deployment ---${NC}"
echo -e "${YELLOW}This script will fully automate your Node.js backend deployment with PostgreSQL.${NC}"

# Step 1: Check dependencies
echo -e "${BLUE}[Step 1/8] Checking for dependencies...${NC}"
if ! command -v brew &> /dev/null; then
    echo -e "${RED}Homebrew not found. Installing...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    (echo; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"') >> /Users/$(whoami)/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
else
    echo -e "${GREEN}Homebrew is already installed.${NC}"
fi

if ! brew list railway &> /dev/null; then
    echo -e "${RED}Railway CLI not found. Installing via Homebrew...${NC}"
    brew install railway
else
    echo -e "${GREEN}Railway CLI is already installed.${NC}"
fi

# Step 2: Create/Fix Dockerfile
echo -e "${BLUE}[Step 2/8] Creating optimized Dockerfile...${NC}"
cat > Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
EOF

# Step 3: Create/Update package.json scripts
echo -e "${BLUE}[Step 3/8] Updating package.json scripts...${NC}"
if [ -f "package.json" ]; then
    # Create a backup
    cp package.json package.json.backup
    
    # Update package.json to include proper scripts
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // Ensure scripts exist
    if (!pkg.scripts) pkg.scripts = {};
    
    // Add/update scripts
    pkg.scripts.start = pkg.scripts.start || 'node server.js';
    pkg.scripts.migrate = pkg.scripts.migrate || 'node-pg-migrate up';
    pkg.scripts['migrate:down'] = pkg.scripts['migrate:down'] || 'node-pg-migrate down';
    pkg.scripts.dev = pkg.scripts.dev || 'nodemon server.js';
    
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
    console.log('Updated package.json scripts');
    "
else
    echo -e "${RED}No package.json found in current directory!${NC}"
    exit 1
fi

# Step 4: Create railway.toml for deployment configuration
echo -e "${BLUE}[Step 4/8] Creating Railway configuration...${NC}"
cat > railway.toml << 'EOF'
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
EOF

# Step 5: Railway Login (automated)
echo -e "${BLUE}[Step 5/8] Logging into Railway...${NC}"
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}Opening Railway login in browser...${NC}"
    railway login
    
    # Wait for login to complete
    echo -e "${YELLOW}Waiting for login to complete...${NC}"
    while ! railway whoami &> /dev/null; do
        sleep 2
    done
    echo -e "${GREEN}Login successful!${NC}"
else
    echo -e "${GREEN}Already logged into Railway.${NC}"
fi

# Step 6: Link to existing ar-backend project
echo -e "${BLUE}[Step 6/8] Linking to existing ar-backend project...${NC}"
if [ -f "railway.json" ] || railway status &>/dev/null 2>&1; then
    echo -e "${GREEN}Project already linked to Railway.${NC}"
else
    echo -e "${YELLOW}Linking to your existing ar-backend project...${NC}"
    echo -e "${YELLOW}When prompted, select your existing 'ar-backend' project.${NC}"
    
    # Use the correct Railway CLI command to link to existing project
    railway link
    
    # Give it a moment to process
    sleep 3
    
    # More robust verification - check if we can get project info
    if railway status &>/dev/null || [ -f "railway.json" ]; then
        echo -e "${GREEN}Successfully linked to ar-backend project!${NC}"
    else
        echo -e "${YELLOW}Link may have succeeded. Continuing with deployment...${NC}"
    fi
fi

# Step 7: Add PostgreSQL database (FIXED - using correct Railway CLI syntax)
echo -e "${BLUE}[Step 7/8] Ensuring PostgreSQL database is available...${NC}"

# Check if DATABASE_URL environment variable exists
if railway variables 2>/dev/null | grep -q "DATABASE_URL"; then
    echo -e "${GREEN}PostgreSQL database already configured.${NC}"
else
    echo -e "${YELLOW}Adding PostgreSQL database...${NC}"
    
    # Use the correct Railway CLI command to add PostgreSQL
    if railway add -d postgres 2>/dev/null; then
        echo -e "${GREEN}PostgreSQL database added successfully!${NC}"
        echo -e "${YELLOW}Waiting for database to initialize...${NC}"
        sleep 15
    else
        echo -e "${YELLOW}Failed to add database via CLI. Please add manually via dashboard.${NC}"
        echo -e "${YELLOW}⚠️  MANUAL STEP REQUIRED: Go to Railway dashboard and add PostgreSQL database:${NC}"
        echo -e "${YELLOW}   1. Open Railway dashboard${NC}"
        echo -e "${YELLOW}   2. Select your ar-backend project${NC}"
        echo -e "${YELLOW}   3. Click '+ New Service'${NC}"
        echo -e "${YELLOW}   4. Select 'Add service' -> 'Database' -> 'Add PostgreSQL'${NC}"
    fi
fi

# Wait for database setup
echo -e "${YELLOW}Waiting for database configuration...${NC}"
sleep 5

# Step 8: Set environment variables and deploy
echo -e "${BLUE}[Step 8/8] Setting environment variables and deploying...${NC}"

# Set essential environment variables
echo -e "${YELLOW}Setting environment variables...${NC}"
railway variables --set "NODE_ENV=production"
railway variables --set "PORT=3000"

# Deploy the application
echo -e "${YELLOW}Starting deployment... This may take a few minutes.${NC}"
railway up --detach

# Wait for deployment to complete
echo -e "${YELLOW}Waiting for deployment to complete...${NC}"
sleep 30

# Check deployment status with better error handling
echo -e "${YELLOW}Checking deployment status...${NC}"
if railway status 2>/dev/null; then
    echo -e "${GREEN}Deployment command executed successfully!${NC}"
    
    # Show recent logs
    echo -e "${YELLOW}Recent deployment logs:${NC}"
    railway logs --tail 20 2>/dev/null || echo -e "${YELLOW}Logs not available yet.${NC}"
else
    echo -e "${YELLOW}Checking deployment logs...${NC}"
    railway logs --tail 30 2>/dev/null || echo -e "${YELLOW}Unable to fetch logs at this time.${NC}"
fi

# Final steps and instructions
echo ""
echo -e "${GREEN}--- AUTOMATED DEPLOYMENT COMPLETE ---${NC}"
echo ""
echo -e "${GREEN}✅ Your ar-backend deployment has been initiated!${NC}"
echo ""
echo -e "${YELLOW}📝 IMPORTANT NEXT STEPS:${NC}"
echo -e "${YELLOW}   1. Go to Railway dashboard: https://railway.app/dashboard${NC}"
echo -e "${YELLOW}   2. Select your ar-backend project${NC}"
echo -e "${YELLOW}   3. Add PostgreSQL database if not already added:${NC}"
echo -e "${YELLOW}      - Click '+ New Service' -> 'Database' -> 'PostgreSQL'${NC}"
echo -e "${YELLOW}   4. Add your environment variables in the Railway dashboard:${NC}"
echo -e "${YELLOW}      - CORS_WHITELIST${NC}"
echo -e "${YELLOW}      - JWT_SECRET${NC}"
echo -e "${YELLOW}      - Any other API keys or secrets${NC}"
echo -e "${YELLOW}   5. Connect your PostgreSQL database to your app service${NC}"
echo ""
echo -e "${BLUE}🌐 Opening Railway dashboard...${NC}"

# Automatically open the browser to the project
if command -v open &> /dev/null; then
    # macOS
    open "https://railway.app/dashboard" &
    sleep 2
    railway open 2>/dev/null &
elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open "https://railway.app/dashboard" &
    sleep 2
    railway open 2>/dev/null &
elif command -v cmd &> /dev/null; then
    # Windows
    cmd /c start "https://railway.app/dashboard" &
    sleep 2
    railway open 2>/dev/null &
else
    echo -e "${YELLOW}Please manually open: https://railway.app/dashboard${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment script complete!${NC}"
echo ""
echo -e "${BLUE}📊 Useful commands:${NC}"
echo -e "${BLUE}   View logs: railway logs${NC}"
echo -e "${BLUE}   Redeploy: railway up${NC}"
echo -e "${BLUE}   Open project: railway open${NC}"
echo -e "${BLUE}   Check status: railway status${NC}"
echo -e "${BLUE}   View variables: railway variables${NC}"