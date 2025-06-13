#!/bin/bash
set -e

echo -e "\033[34m--- ARIX Terminal Railway.app Deployment --- \033[0m"
echo -e "\033[33mThis script will deploy your stateful Node.js backend with a PostgreSQL database.\033[0m"

# Step 1: Check dependencies
echo -e "\033[34m[Step 1/6] Checking for dependencies...\033[0m"
if ! command -v brew &> /dev/null; then
    echo -e "\033[31mHomebrew not found. Installing...\033[0m"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    (echo; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"') >> /Users/$(whoami)/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
else
    echo -e "\033[32mHomebrew is already installed.\033[0m"
fi

if ! brew list railway &> /dev/null; then
    echo -e "\033[31mRailway CLI not found. Installing via Homebrew...\033[0m"
    brew install railway
else
    echo -e "\033[32mRailway CLI is already installed.\033[0m"
fi

# Step 2: Railway Login
echo -e "\033[34m[Step 2/6] Starting Railway Setup...\033[0m"
echo -e "\033[33mThe script will now provide a link for you to log in to Railway manually.\033[0m"
railway login --browserless

# Step 3: Link Project
echo -e "\033[34m[Step 3/6] Linking Project...\033[0m"
if [ -f "railway.json" ]; then
    echo -e "\033[32mProject already linked to Railway.\033[0m"
else
    echo -e "\033[33mFollow the prompts to link to your existing 'ar-backend' project.\033[0m"
    railway link
fi

# Step 4: Deploy
echo -e "\033[34m[Step 4/6] Deploying Application Code...\033[0m"
railway up

# Step 5: Database Setup
echo -e "\033[34m[Step 5/6] Provisioning Database...\033[0m"
echo -e "\033[32mPlease check your Railway dashboard to ensure the PostgreSQL database was created.\033[0m"
railway open

# Step 6: Set Environment Variables
echo -e "\033[34m[Step 6/6] Setting Final Environment Variables...\033[0m"
railway variables set NODE_ENV=production

echo ""
echo -e "\033[32m--- DEPLOYMENT COMPLETE ---\033[0m"
echo ""
echo -e "\033[33mYour app is live! Railway has automatically linked your new database.\033[0m"
echo -e "\033[33mIMPORTANT: You must still add your secrets (CORS_WHITELIST, etc.)\033[0m"
echo -e "\033[33min the Railway Dashboard under your project's 'Variables' tab.\033[0m"
railway open --service

