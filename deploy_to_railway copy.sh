#!/bin/bash

# ===================================================================================
# ARIX - FULL DEPLOYMENT & DB RESET SCRIPT
# ===================================================================================
# Version 2.5 - Fully Automated (Non-Interactive)
# This script handles the entire deployment process without user interaction.
# It will WIPE THE DATABASE and redeploy the code. Use with caution.
#
# REQUIREMENTS:
#   - Railway CLI: `brew install railway`
#   - PostgreSQL Client (psql): `brew install libpq`
# ===================================================================================

# --- Helper Functions ---
green() { echo -e "\033[32m$1\033[0m"; }
yellow() { echo -e "\033[33m$1\033[0m"; }
red() { echo -e "\033[31m$1\033[0m"; }
bold() { echo -e "\033[1m$1\033[0m"; }

# --- Configuration ---
PROJECT_PATH="/Users/israelbill/Development/ar_terminal/AR_Proj/New Folder With Items/ar_backend"
BACKEND_SERVICE_NAME="ar-backend"
SCHEMA_FILE_PATH="db_migrations/001_master_schema_corrected.sql"
RAILWAY_PROJECT_ID="42bb1cdd-7437-4092-82e1-93d44b5a1498" # User's Project ID

# --- Hardcoded Database Configuration ---
DB_HOST="ballast.proxy.rlwy.net"
DB_PORT="36098"
DB_USER="postgres"
DB_NAME="railway"
DB_PASSWORD="GFIrxKYvKtMnoFCrrTPHEuMnAiKcgwIc"

# --- Pre-flight Check ---
if ! command -v psql &> /dev/null; then
    red "ERROR: 'psql' command not found. Please run: brew install libpq"
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

# --- Step 2: Database Schema Management ---
bold "Step 2: Managing Database Schema..."
yellow "🚨 WARNING: Automatically wiping and recreating public schema..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null
if [ $? -ne 0 ]; then
    red "ERROR: Failed to wipe the database schema."
    exit 1
fi
green "✔ Database schema successfully wiped."

yellow "Applying schema from '$SCHEMA_FILE_PATH'..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$SCHEMA_FILE_PATH" > /dev/null
if [ $? -ne 0 ]; then
    red "ERROR: Failed to apply the new database schema."
    exit 1
fi
green "✔ Database schema successfully applied."
echo

# --- Step 3: Upload and Deploy Backend Code ---
bold "Step 3: Uploading local code and deploying '$BACKEND_SERVICE_NAME'..."
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
yellow "Your database is reset and your latest code is live."
echo
