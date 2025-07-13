#!/bin/bash

# ===================================================================================
# OXYBLE TERMINAL - RAILWAY DEPLOYMENT SCRIPT (v22 - FINAL)
# ===================================================================================
# This script contains all necessary fixes for deployment. It deletes the Dockerfile,
# creates a correct nixpacks.toml, and uses the correct 'redeploy' command.
# It does NOT modify any application code (e.g., app.js).
# ===================================================================================

# --- Helper Functions ---
green() { echo -e "\033[32m$1\033[0m"; }
yellow() { echo -e "\033[33m$1\033[0m"; }
red() { echo -e "\033[31m$1\033[0m"; }
bold() { echo -e "\033[1m$1\033[0m"; }

# --- Configuration (Hardcoded as requested) ---
DATABASE_URL="postgresql://postgres:sqtTKgGjtyjNRQZerlBLLHyRtkwxyXHV@hopper.proxy.rlwy.net:17374/railway"
MIGRATION_FILE="db_migrations/002_add_swap_and_plinko.sql"
BACKEND_SERVICE_NAME="ar-backend"
DB_SERVICE_NAME="Postgres-cMD6"
PROJECT_PATH="/Users/israelbill/Development/ar_terminal/AR_Proj/New Folder With Items/ar_backend"

# --- Step 0: Navigate to Project Directory ---
bold "Step 0: Navigating to project directory..."
cd "$PROJECT_PATH" || { red "ERROR: Could not find project directory at '$PROJECT_PATH'."; exit 1; }
green "✔ Successfully in project directory: $(pwd)"
echo

# --- Step 1: Automatically Fix Build Configuration ---
bold "Step 1: Applying automated fixes to build configuration..."

# Delete the Dockerfile to force Railway to use the correct Nixpacks builder.
if [ -f "Dockerfile" ]; then
    rm -f "Dockerfile"
    green "✔ DELETED rogue Dockerfile."
fi

# Overwrite nixpacks.toml to disable the failing release command.
NIXPACKS_TOML_FILE="nixpacks.toml"
echo '# This file tells Nixpacks to skip the default release command.
[phases.release]
cmds = ["echo '\''Skipping default Nixpacks release command.'\''"]

# This tells Nixpacks what to do to start the app.
[start]
cmd = "npm start"
' > "$NIXPACKS_TOML_FILE"
green "✔ Corrected $NIXPACKS_TOML_FILE with valid syntax."
echo

# --- Step 2: Login and Link Project ---
bold "Step 2: Logging into and linking Railway..."
if ! railway whoami &>/dev/null; then railway login; fi
if [ ! -f "railway.json" ]; then railway link; fi
green "✔ Login and project link confirmed."
echo

# --- Step 3: Deploy Backend Code ---
bold "Step 3: Deploying backend code to Railway..."
railway up --service "$BACKEND_SERVICE_NAME"
if [ $? -ne 0 ]; then
    red "ERROR: The backend deployment failed." && exit 1
fi
green "✔ Backend deployment successful."
echo

# --- Step 4: Redeploy and Stabilize the Database ---
bold "Step 4: Redeploying the database service..."
# Use the correct 'redeploy' command.
railway redeploy --service "$DB_SERVICE_NAME"
if [ $? -ne 0 ]; then
    red "ERROR: The database redeploy command failed." && exit 1
fi
green "✔ Redeploy command sent. Waiting for the database to come online..."
sleep 20

MAX_RETRIES=15
RETRY_COUNT=0
until pg_isready -d "$DATABASE_URL" -q
do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -gt $MAX_RETRIES ]; then
        red "ERROR: Database is still not responding." && exit 1
    fi
    red "Attempt $RETRY_COUNT/$MAX_RETRIES: Database not ready. Waiting 20 seconds..."
    sleep 20
done
green "✔ Database is online and ready for connections."
echo

# --- Step 5: Run Manual Database Migration ---
bold "Step 5: Updating the database schema..."
psql "$DATABASE_URL" -q -f "$MIGRATION_FILE"
if [ $? -eq 0 ]; then
    green "✔ Database migration completed successfully."
else
    red "ERROR: Database migration failed." && exit 1
fi
echo

# --- Completion ---
bold "================================================="
green "  ✅ SUCCESS: Deployment and Recovery Complete ✅"
bold "================================================="
yellow "All services should now be online and fully functional."
echo
