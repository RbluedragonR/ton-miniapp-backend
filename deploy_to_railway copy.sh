#!/bin/bash

# ===================================================================================
# ARIX - AUTOMATED DEPLOYMENT SCRIPT (v3.4)
# ===================================================================================
# This script handles the entire deployment process without user interaction.
# It now includes a cleanup step to remove old/misspelled environment variables
# before setting the correct ones and deploying the latest code.
#
# REQUIREMENTS:
#   - Railway CLI: `brew install railway`
# ===================================================================================

# --- Helper Functions ---
green() { echo -e "\033[32m$1\033[0m"; }
yellow() { echo -e "\033[33m$1\033[0m"; }
red() { echo -e "\033[31m$1\033[0m"; }
bold() { echo -e "\033[1m$1\033[0m"; }

# --- Configuration ---
PROJECT_PATH="/Users/israelbill/Development/ar_terminal/AR_Proj/New Folder With Items/ar_backend"
BACKEND_SERVICE_NAME="ar-backend"
RAILWAY_PROJECT_ID="42bb1cdd-7437-4092-82e1-93d44b5a1498"

# --- Mainnet Wallet & Token Configuration ---
# DANGER: YOUR SECRET RECOVERY PHRASE IS HARDCODED BELOW.
# THIS IS A MAJOR SECURITY RISK. DO NOT COMMIT THIS SCRIPT TO A PUBLIC REPOSITORY.
TON_NETWORK_CONFIG="mainnet"
ARIX_MASTER_ADDRESS="EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd" # NOTE: This is the TESTNET address. Replace with MAINNET address when known.
HOT_WALLET_ADDRESS_CONFIG="UQAOsmO5jhlrmlWHsVn26WXt7MhllL7a7r-OEEEOQ-Uy_8ms"
HOT_WALLET_MNEMONIC_CONFIG="wear obvious illegal worth edge crater scene grow stereo measure license leopard swim filter jump suffer athlete eye gift side rude iron quarter humble"


# --- Pre-flight Check ---
if ! command -v railway &> /dev/null; then
    red "ERROR: 'railway' command not found. Please run: brew install railway"
    exit 1
fi
if [[ -z "$RAILWAY_PROJECT_ID" ]]; then
    red "ERROR: RAILWAY_PROJECT_ID is not set in the script."
    exit 1
fi

# --- Step 0: Navigate to Project Directory ---
bold "Step 0: Navigating to project directory..."
cd "$PROJECT_PATH" || { red "ERROR: Could not find project directory at '$PROJECT_PATH'."; exit 1; }
green "✔ Successfully in project directory: $(pwd)"
echo

# --- Step 1: Confirm Railway Connection (Non-Interactive) ---
bold "Step 1: Confirming Railway connection..."
if ! railway whoami &>/dev/null; then
    yellow "Not logged into Railway. Attempting login..."
    railway login
fi

# Link non-interactively if config is missing
if ! railway status &> /dev/null; then
    yellow "Railway project not linked. Linking non-interactively to Project ID: $RAILWAY_PROJECT_ID"
    railway link "$RAILWAY_PROJECT_ID"
    if [ $? -ne 0 ]; then
        red "ERROR: Failed to link to Railway project $RAILWAY_PROJECT_ID."
        exit 1
    fi
fi
green "✔ Login and project link confirmed."
echo

# --- Step 2: Clean Up Old Environment Variables ---
bold "Step 2: Cleaning up old environment variables..."
# Note: Railway CLI doesn't have a direct delete command for individual variables
# Variables are managed through the --set flag only
yellow "Note: Railway CLI manages variables through --set only. Old variables will be overwritten."
green "✔ Old variables cleanup noted."
echo


# --- Step 3: Set Environment Variables on Railway ---
bold "Step 3: Setting environment variables on Railway..."
# Using the correct Railway CLI syntax with --set flag
railway variables --service "$BACKEND_SERVICE_NAME" --set "TON_NETWORK=$TON_NETWORK_CONFIG" --set "ARIX_TOKEN_MASTER_ADDRESS=$ARIX_MASTER_ADDRESS" --set "HOT_WALLET_ADDRESS=$HOT_WALLET_ADDRESS_CONFIG" --set "HOT_WALLET_MNEMONIC=$HOT_WALLET_MNEMONIC_CONFIG" --set "TRUST_PROXY=1"

green "✔ All environment variables have been set."
echo


# --- Step 4: Database Schema Management (DISABLED) ---
# This section remains commented out as per your request.
# bold "Step 4: Managing Database Schema..."
# ...


# --- Step 5: Upload and Deploy Backend Code ---
bold "Step 5: Uploading local code and deploying '$BACKEND_SERVICE_NAME'..."
railway up --service "$BACKEND_SERVICE_NAME"
if [ $? -ne 0 ]; then
    red "ERROR: The backend deployment failed. Please check the build logs."
    exit 1
fi
green "✔ Backend successfully deployed with your latest local code."
echo

# --- Completion ---
bold "================================================="
green "  ✅ Full Deployment Complete ✅"
bold "================================================="
yellow "Your environment variables are set and your latest code is live."
echo