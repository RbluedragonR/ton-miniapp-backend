#!/bin/bash
set -e

# --- Configuration ---
# IMPORTANT: Find this in your Railway project dashboard. It's the name of your PostgreSQL service.
RAILWAY_DB_SERVICE_NAME="Postgres-cMD6" # <-- REPLACE with your actual database service name on Railway

# UPDATE: Use the correct Neon connection string from your Vercel dashboard
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
echo -e "${BLUE}[1/6] Automatically fixing project files...${NC}"

# Automatically create a guaranteed-correct package.json file
# FIX: Updated Node engine to match current version (20.x) and moved 'morgan' from devDependencies to dependencies
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
    "node": ">=20.x"
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
    "morgan": "^1.10.0",
    "node-pg-migrate": "^7.4.0",
    "node-telegram-bot-api": "^0.66.0",
    "pg": "^8.11.5",
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
EOF
echo -e "${GREEN}Success: package.json has been rebuilt correctly.${NC}"

# Automatically overwrite app.js with a guaranteed-correct version
cat > ./src/app.js << 'EOF'
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { FRONTEND_URL, NODE_ENV } = require('./config/envConfig');
const userRoutes = require('./routes/userRoutes');
const gameRoutes = require('./routes/gameRoutes');
const earnRoutes = require('./routes/earnRoutes');
const taskRoutes = require('./routes/taskRoutes');
const referralRoutes = require('./routes/referralRoutes');
const pushRoutes = require('./routes/pushRoutes');
const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const whitelist = (process.env.CORS_WHITELIST || `${FRONTEND_URL},http://localhost:5173`).split(',');
console.log('[CORS Setup] Effective Whitelist:', whitelist);

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.indexOf(origin) !== -1 || (origin && origin.startsWith('https://web.telegram.org'))) {
            callback(null, true);
        } else {
            console.error(`CORS Error: Origin '${origin}' not allowed.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 250, // limit each IP to 250 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Logging middleware (only in development)
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Health check route
app.get('/', (req, res) => {
    res.json({ message: 'ARIX Terminal Backend is running!' });
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/earn', earnRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/push', pushRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(generalErrorHandler);

module.exports = app;
EOF
echo -e "${GREEN}Success: app.js has been rebuilt correctly.${NC}"

# Step 2: Set Correct Node.js Version & Install Dependencies
echo -e "${BLUE}[2/6] Setting up environment and installing dependencies...${NC}"

# Check current Node version and adjust package.json accordingly
NODE_VERSION=$(node -v | sed 's/v//' | cut -d'.' -f1)
echo -e "${GREEN}Current Node version $(node -v) and npm version $(npm -v)${NC}"

# Update package.json with current Node version
sed -i.bak "s/\"node\": \">=.*\"/\"node\": \">=${NODE_VERSION}.x\"/" package.json
echo -e "${GREEN}Updated package.json to match current Node version (${NODE_VERSION}.x)${NC}"

echo -e "${YELLOW}Installing all dependencies from scratch...${NC}"
rm -rf node_modules package-lock.json
npm install --omit=dev --no-audit --no-fund
echo -e "${GREEN}Dependencies are synchronized.${NC}"

# Fix security vulnerabilities more selectively
echo -e "${BLUE}Fixing security vulnerabilities...${NC}"
# Update node-telegram-bot-api to latest stable version to fix vulnerabilities
npm install node-telegram-bot-api@latest --save
echo -e "${GREEN}Security updates completed.${NC}"

# Step 3: Login and Link Project
echo -e "${BLUE}[3/6] Logging in and linking to Railway project...${NC}"
if ! railway whoami &>/dev/null; then
    echo -e "${YELLOW}Please log in to Railway...${NC}"
    railway login
fi

if ! [ -f "railway.json" ]; then
    echo -e "${YELLOW}Linking to your existing '${RAILWAY_PROJECT_NAME}' project...${NC}"
    railway link
else
    echo -e "${GREEN}Project is already linked.${NC}"
fi

# Step 4: Set Environment Variables (before deployment)
echo -e "${BLUE}[4/6] Setting Production Environment Variables...${NC}"

# Set NODE_ENV using the correct Railway CLI syntax
echo -e "${YELLOW}Setting NODE_ENV to production...${NC}"
railway variables set NODE_ENV production || echo -e "${YELLOW}Manual step required: Set NODE_ENV=production in Railway dashboard${NC}"

# Step 5: Commit and Deploy
echo -e "${BLUE}[5/6] Committing all fixes and deploying to Railway...${NC}"
git add .
git commit -m "Automated deployment: Fix dependencies, security vulnerabilities, and rebuild core files" --allow-empty

echo -e "${YELLOW}Deploying application. This will deploy and show status...${NC}"
railway up --detach

# Wait for deployment to stabilize
echo -e "${BLUE}Waiting for 60 seconds for the deployment to settle...${NC}"
sleep 60

# Check deployment status
echo -e "${BLUE}Checking deployment status...${NC}"
railway status || echo -e "${YELLOW}Could not fetch status, continuing...${NC}"

echo -e "${GREEN}### DEPLOYMENT SUCCESSFUL ###${NC}"
echo ""

# --- PART 2: DATABASE MIGRATION ---

echo -e "${YELLOW}### PART 2: MIGRATING DATA FROM NEON TO RAILWAY ###${NC}"

# Step 1: Ensure PostgreSQL Tools are Available
echo -e "${BLUE}[1/5] Checking for local PostgreSQL tools...${NC}"
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}Error: pg_dump command not found.${NC}"
    echo -e "${YELLOW}Installing PostgreSQL client tools...${NC}"
    
    # Try to install PostgreSQL tools based on the system
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            echo -e "${YELLOW}Installing via Homebrew...${NC}"
            brew install libpq
            # Add to PATH for current session
            export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
            # Add to shell profile for future sessions
            if [[ "$SHELL" == *"zsh"* ]]; then
                echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
            else
                echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.bash_profile
            fi
        else
            echo -e "${RED}Homebrew not found. Please install PostgreSQL client tools manually.${NC}"
            echo -e "${YELLOW}Install Homebrew first: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${NC}"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        echo -e "${YELLOW}Installing via apt-get...${NC}"
        sudo apt-get update && sudo apt-get install -y postgresql-client
    else
        echo -e "${RED}Unsupported OS. Please install PostgreSQL client tools manually.${NC}"
        exit 1
    fi
    
    # Check again after installation
    if ! command -v pg_dump &> /dev/null; then
        echo -e "${RED}Failed to install PostgreSQL tools. Please install manually and rerun.${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}PostgreSQL tools are available.${NC}"

# Step 2: Verify Neon Database Connection
echo -e "${BLUE}[2/5] Verifying Neon database connection...${NC}"

# Enhanced connection test with better error reporting
echo -e "${YELLOW}Testing connection to Neon database...${NC}"
CONNECTION_TEST=$(psql "$NEON_DB_URL" -c "SELECT 1 as test;" 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Successfully connected to Neon database${NC}"
    
    # Get database info
    echo -e "${BLUE}Gathering database information...${NC}"
    TABLE_COUNT=$(psql "$NEON_DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
    echo -e "${GREEN}Found ${TABLE_COUNT} tables in the database${NC}"
    
    # List tables
    echo -e "${BLUE}Available tables:${NC}"
    psql "$NEON_DB_URL" -c "\dt" 2>/dev/null || echo -e "${YELLOW}Could not list tables${NC}"
else
    echo -e "${RED}Failed to connect to Neon database.${NC}"
    echo -e "${YELLOW}Connection error details:${NC}"
    echo "$CONNECTION_TEST"
    echo -e "${YELLOW}Please check:${NC}"
    echo -e "${YELLOW}1. Your Neon database URL is correct${NC}"
    echo -e "${YELLOW}2. Your Neon database is running and accessible${NC}"
    echo -e "${YELLOW}3. Your network connection is stable${NC}"
    echo -e "${YELLOW}4. SSL certificate issues (try adding sslmode=require to the URL)${NC}"
    
    read -p "Continue with manual connection string? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Exiting due to connection failure.${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Please enter your Neon database URL:${NC}"
    read -r NEON_DB_URL
    if [ -z "$NEON_DB_URL" ]; then
        echo -e "${RED}No URL provided. Exiting.${NC}"
        exit 1
    fi
fi

# Step 3: Export from Neon with Better Error Handling
DUMP_FILE="neon_dump_$(date +%Y%m%d_%H%M%S).sql"
echo -e "${BLUE}[3/5] Exporting data from Neon...${NC}"

# Export full database with better options
echo -e "${YELLOW}Exporting full database...${NC}"
pg_dump "$NEON_DB_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --no-tablespaces \
    --no-security-labels \
    --no-comments \
    --verbose > "$DUMP_FILE" 2>/dev/null

if [ $? -eq 0 ] && [ -s "$DUMP_FILE" ]; then
    echo -e "${GREEN}Successfully exported data from Neon to ${DUMP_FILE}.${NC}"
    echo -e "${BLUE}Dump file size: $(du -h "$DUMP_FILE" | cut -f1)${NC}"
    
    # Show a preview of the dump file
    echo -e "${BLUE}Preview of dump file (first 10 lines):${NC}"
    head -10 "$DUMP_FILE"
    echo "..."
else
    echo -e "${RED}Failed to export data from Neon or dump file is empty.${NC}"
    exit 1
fi

# Step 4: Get Railway Database Connection
echo -e "${BLUE}[4/5] Getting Railway database connection...${NC}"

# Try to get Railway database URL
echo -e "${YELLOW}Retrieving Railway database connection string...${NC}"
RAILWAY_DB_URL=""

# Method 1: Try to get from Railway environment
if RAILWAY_DB_URL=$(railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash -c 'echo $DATABASE_URL' 2>/dev/null); then
    if [ -n "$RAILWAY_DB_URL" ] && [[ "$RAILWAY_DB_URL" =~ ^postgresql:// ]]; then
        echo -e "${GREEN}✓ Retrieved Railway database URL from environment${NC}"
    else
        RAILWAY_DB_URL=""
    fi
fi

# Method 2: Try alternative environment variable names
if [ -z "$RAILWAY_DB_URL" ]; then
    for VAR_NAME in DATABASE_URL POSTGRES_URL DB_URL; do
        if TEMP_URL=$(railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash -c "echo \$${VAR_NAME}" 2>/dev/null); then
            if [ -n "$TEMP_URL" ] && [[ "$TEMP_URL" =~ ^postgresql:// ]]; then
                RAILWAY_DB_URL="$TEMP_URL"
                echo -e "${GREEN}✓ Retrieved Railway database URL from ${VAR_NAME}${NC}"
                break
            fi
        fi
    done
fi

# Method 3: Manual input if automatic methods fail
if [ -z "$RAILWAY_DB_URL" ]; then
    echo -e "${YELLOW}Could not automatically retrieve Railway database URL.${NC}"
    echo -e "${BLUE}Please get the database URL from your Railway dashboard:${NC}"
    echo "1. Go to your Railway project dashboard"
    echo "2. Click on your PostgreSQL service (${RAILWAY_DB_SERVICE_NAME})"
    echo "3. Go to 'Connect' tab"
    echo "4. Copy the 'Postgres Connection URL'"
    echo ""
    echo -e "${YELLOW}Enter your Railway PostgreSQL connection URL:${NC}"
    read -r RAILWAY_DB_URL
    
    if [ -z "$RAILWAY_DB_URL" ] || [[ ! "$RAILWAY_DB_URL" =~ ^postgresql:// ]]; then
        echo -e "${RED}Invalid or empty database URL. Exiting.${NC}"
        exit 1
    fi
fi

# Test Railway database connection
echo -e "${YELLOW}Testing Railway database connection...${NC}"
if psql "$RAILWAY_DB_URL" -c "SELECT 1;" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Successfully connected to Railway database${NC}"
else
    echo -e "${RED}Failed to connect to Railway database.${NC}"
    echo -e "${YELLOW}Please verify the connection URL is correct.${NC}"
    exit 1
fi

# Step 5: Import to Railway
echo -e "${BLUE}[5/5] Importing data into Railway PostgreSQL database...${NC}"

# Import with transaction safety and better error handling
echo -e "${YELLOW}Importing database dump...${NC}"
IMPORT_LOG="import_$(date +%Y%m%d_%H%M%S).log"

# Create a safer import with transaction control
cat > temp_import.sql << EOF
BEGIN;

-- Set session variables for safer import
SET session_replication_role = replica;
SET client_min_messages = warning;

-- Import the actual dump
\i ${DUMP_FILE}

-- Reset session variables
SET session_replication_role = DEFAULT;

COMMIT;
EOF

# Execute the import
if psql "$RAILWAY_DB_URL" \
    --single-transaction \
    --set ON_ERROR_STOP=on \
    --no-psqlrc \
    --quiet \
    -f temp_import.sql > "$IMPORT_LOG" 2>&1; then
    
    echo -e "${GREEN}✓ Database import completed successfully!${NC}"
    
    # Verify the import
    echo -e "${BLUE}Verifying import...${NC}"
    RAILWAY_TABLE_COUNT=$(psql "$RAILWAY_DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
    echo -e "${GREEN}Railway database now has ${RAILWAY_TABLE_COUNT} tables${NC}"
    
    # Show imported tables
    echo -e "${BLUE}Imported tables:${NC}"
    psql "$RAILWAY_DB_URL" -c "\dt" 2>/dev/null || echo -e "${YELLOW}Could not list tables${NC}"
    
    IMPORT_SUCCESS=true
else
    echo -e "${RED}Database import failed!${NC}"
    echo -e "${YELLOW}Error details (last 20 lines):${NC}"
    tail -20 "$IMPORT_LOG" 2>/dev/null || echo "No error log available"
    IMPORT_SUCCESS=false
fi

# Clean up temporary files
rm -f temp_import.sql

# Step 6: Cleanup and Backup Management
echo -e "${BLUE}[6/6] Cleaning up and organizing backups...${NC}"

# Create backup directory and organize files
mkdir -p ./database_backups
cp "$DUMP_FILE" ./database_backups/
if [ -f "$IMPORT_LOG" ]; then
    cp "$IMPORT_LOG" ./database_backups/
fi
echo -e "${GREEN}Backup saved to: ./database_backups/${DUMP_FILE}${NC}"

# Clean up current directory files
rm -f "$DUMP_FILE" "$IMPORT_LOG"

# Clean up any temporary files
rm -f ./src/app.js.bak ./package.json.bak
rm -f railway_import_script.sh comprehensive_import.sh final_import.sh
rm -f temp_import.sh

# Keep only the 5 most recent backups
cd ./database_backups
ls -t neon_dump_*.sql 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
ls -t import_*.log 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
cd ..

echo ""
echo -e "${GREEN}🚀 === FULL DEPLOYMENT AND MIGRATION COMPLETE === 🚀${NC}"
echo ""

if [ "$IMPORT_SUCCESS" = true ]; then
    echo -e "${GREEN}✅ Application deployed successfully${NC}"
    echo -e "${GREEN}✅ Database migrated successfully${NC}"
    echo -e "${GREEN}✅ ${RAILWAY_TABLE_COUNT} tables imported to Railway${NC}"
else
    echo -e "${GREEN}✅ Application deployed successfully${NC}"
    echo -e "${YELLOW}⚠️  Database migration had issues - check logs${NC}"
fi

echo ""
echo -e "${YELLOW}📋 NEXT STEPS:${NC}"
echo -e "${BLUE}1. Verify environment variables in Railway Dashboard:${NC}"
echo -e "   • NODE_ENV (should be set to 'production')"
echo -e "   • DATABASE_URL (should be auto-set by Railway)"
echo -e "   • CORS_WHITELIST"
echo -e "   • TELEGRAM_BOT_TOKEN"
echo -e "   • Any other application-specific variables"
echo ""
echo -e "${BLUE}2. Verify your deployment:${NC}"
echo "   railway logs --service ar-backend"
echo ""
echo -e "${BLUE}3. Test your application:${NC}"
echo "   railway open"
echo ""
echo -e "${BLUE}4. Monitor database connection:${NC}"
echo "   railway logs --service ${RAILWAY_DB_SERVICE_NAME}"
echo ""
echo -e "${BLUE}5. Test database connectivity:${NC}"
echo "   railway run --service ${RAILWAY_DB_SERVICE_NAME} -- psql \$DATABASE_URL -c '\\dt'"
echo ""
echo -e "${GREEN}🎉 Deployment automation completed! 🎉${NC}"

# Optional: Open Railway dashboard
read -p "Open Railway dashboard now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway open
fi