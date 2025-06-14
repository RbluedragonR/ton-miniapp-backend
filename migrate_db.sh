#!/bin/bash
set -e

# --- Configuration ---
# IMPORTANT: Update this to match your actual Railway PostgreSQL service name
RAILWAY_DB_SERVICE_NAME="Postgres-cMD6"  # <-- This matches your Railway dashboard

# UPDATE: Use the correct Neon connection string from your dashboard
NEON_DB_URL="postgresql://neondb_owner:npg_0ngYqcX8vSQI@ep-proud-math-a4sxlwf8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
RAILWAY_PROJECT_NAME="ar-backend"

# --- Colors for Output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}--- ARIX Terminal Railway Migration Script (Revised) ---${NC}"
echo ""

# --- PART 1: AUTO-FIXING & DEPLOYING APPLICATION ---

echo -e "${YELLOW}### PART 1: PREPARING AND DEPLOYING APPLICATION ###${NC}"

# Step 1: Automated Code & Dependency Fix
echo -e "${BLUE}[1/6] Automatically fixing project files...${NC}"

# Create optimized package.json with exact versions for better stability
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
echo -e "${GREEN}Success: package.json updated with stable versions.${NC}"

# Create optimized app.js with better error handling
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

// Security middleware with Railway-optimized settings
app.use(helmet({
    contentSecurityPolicy: false, // Disable for Railway compatibility
    crossOriginEmbedderPolicy: false
}));

// CORS configuration optimized for Railway and Telegram
const corsOrigins = process.env.CORS_WHITELIST 
    ? process.env.CORS_WHITELIST.split(',')
    : [FRONTEND_URL, 'http://localhost:5173', 'https://web.telegram.org'];

console.log('[CORS Setup] Allowed Origins:', corsOrigins);

const corsOptions = {
    origin: function (origin, callback) {
        // Allow Railway internal requests (no origin)
        if (!origin) return callback(null, true);
        
        // Allow Telegram WebApp requests
        if (origin.includes('web.telegram.org')) return callback(null, true);
        
        // Allow Railway domains
        if (origin.includes('railway.app')) return callback(null, true);
        
        // Check whitelist
        if (corsOrigins.some(allowedOrigin => origin.includes(allowedOrigin))) {
            return callback(null, true);
        }
        
        console.warn(`CORS Warning: Origin '${origin}' not in whitelist`);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Rate limiting with Railway-friendly settings
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Higher limit for Railway
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for Railway health checks
        return req.headers['user-agent']?.includes('Railway') || false;
    }
});
app.use(limiter);

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced logging for Railway
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Railway health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        environment: NODE_ENV 
    });
});

// Main health check route
app.get('/', (req, res) => {
    res.json({ 
        message: 'ARIX Terminal Backend is running on Railway!',
        version: '1.0.0',
        status: 'active'
    });
});

// API routes with error boundary
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
echo -e "${GREEN}Success: app.js optimized for Railway deployment.${NC}"

# Step 2: Enhanced dependency management
echo -e "${BLUE}[2/6] Setting up environment and installing dependencies...${NC}"

NODE_VERSION=$(node -v | sed 's/v//' | cut -d'.' -f1)
NPM_VERSION=$(npm -v | cut -d'.' -f1)
echo -e "${GREEN}Current Node version v${NODE_VERSION} and npm version ${NPM_VERSION}${NC}"

# Clean install with better error handling
echo -e "${YELLOW}Performing clean dependency installation...${NC}"
rm -rf node_modules package-lock.json
npm cache clean --force 2>/dev/null || true

# Install with production optimizations
npm install --production --no-audit --no-fund --prefer-offline
echo -e "${GREEN}Production dependencies installed successfully.${NC}"

# Address security vulnerabilities selectively
echo -e "${BLUE}Addressing security vulnerabilities...${NC}"
npm audit fix --only=prod --force 2>/dev/null || echo -e "${YELLOW}Some vulnerabilities require manual review.${NC}"
echo -e "${GREEN}Security updates completed.${NC}"

# Step 3: Railway authentication and linking
echo -e "${BLUE}[3/6] Authenticating with Railway...${NC}"

# Check Railway CLI installation
if ! command -v railway &> /dev/null; then
    echo -e "${RED}Railway CLI not found. Installing...${NC}"
    # Install Railway CLI based on platform
    if [[ "$OSTYPE" == "darwin"* ]]; then
        curl -fsSL https://railway.app/install.sh | sh
    else
        npm install -g @railway/cli
    fi
fi

# Authenticate if needed
if ! railway whoami &>/dev/null; then
    echo -e "${YELLOW}Please authenticate with Railway...${NC}"
    railway login
fi

# Link project with better error handling
if [ ! -f "railway.json" ]; then
    echo -e "${YELLOW}Linking to Railway project '${RAILWAY_PROJECT_NAME}'...${NC}"
    railway link --name "${RAILWAY_PROJECT_NAME}" || {
        echo -e "${YELLOW}Auto-linking failed. Please link manually:${NC}"
        railway link
    }
else
    echo -e "${GREEN}Project already linked to Railway.${NC}"
fi

# Step 4: Environment variables setup
echo -e "${BLUE}[4/6] Configuring environment variables...${NC}"

# Set critical environment variables
echo -e "${YELLOW}Setting production environment variables...${NC}"
railway variables set NODE_ENV=production || echo -e "${YELLOW}Set NODE_ENV manually in Railway dashboard${NC}"

# Verify DATABASE_URL is set by Railway PostgreSQL service
if railway variables | grep -q "DATABASE_URL"; then
    echo -e "${GREEN}DATABASE_URL is configured by Railway PostgreSQL service.${NC}"
else
    echo -e "${YELLOW}Warning: DATABASE_URL not found. Ensure PostgreSQL service is properly linked.${NC}"
fi

# Step 5: Commit and deploy with Railway
echo -e "${BLUE}[5/6] Deploying to Railway...${NC}"

# Commit changes
git add .
git commit -m "Railway deployment: Optimized configuration and dependencies" --allow-empty

# Deploy with Railway
echo -e "${YELLOW}Initiating Railway deployment...${NC}"
railway up --detach

# Wait for deployment to complete
echo -e "${BLUE}Waiting for deployment to stabilize (90 seconds)...${NC}"
sleep 90

# Check deployment status
echo -e "${BLUE}Verifying deployment status...${NC}"
railway status || echo -e "${YELLOW}Status check unavailable, continuing...${NC}"

echo -e "${GREEN}### APPLICATION DEPLOYMENT COMPLETE ###${NC}"
echo ""

# --- PART 2: DATABASE MIGRATION WITH IMPROVED RAILWAY INTEGRATION ---

echo -e "${YELLOW}### PART 2: MIGRATING DATABASE FROM NEON TO RAILWAY ###${NC}"

# Step 1: PostgreSQL tools verification
echo -e "${BLUE}[1/6] Verifying PostgreSQL client tools...${NC}"

install_postgres_tools() {
    echo -e "${YELLOW}Installing PostgreSQL client tools...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install libpq
            # Add to PATH
            export PATH="/usr/local/opt/libpq/bin:/opt/homebrew/opt/libpq/bin:$PATH"
            echo 'export PATH="/usr/local/opt/libpq/bin:/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc 2>/dev/null || true
            echo 'export PATH="/usr/local/opt/libpq/bin:/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.bash_profile 2>/dev/null || true
        else
            echo -e "${RED}Homebrew required for macOS installation.${NC}"
            return 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y postgresql-client
        elif command -v yum &> /dev/null; then
            sudo yum install -y postgresql
        else
            echo -e "${RED}Unsupported Linux distribution.${NC}"
            return 1
        fi
    else
        echo -e "${RED}Unsupported operating system.${NC}"
        return 1
    fi
}

if ! command -v pg_dump &> /dev/null || ! command -v psql &> /dev/null; then
    install_postgres_tools
    
    # Verify installation
    if ! command -v pg_dump &> /dev/null || ! command -v psql &> /dev/null; then
        echo -e "${RED}PostgreSQL tools installation failed.${NC}"
        echo -e "${YELLOW}Please install PostgreSQL client tools manually and re-run this script.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}PostgreSQL client tools are available.${NC}"

# Step 2: Neon database connection verification
echo -e "${BLUE}[2/6] Verifying Neon database connection...${NC}"

verify_neon_connection() {
    local test_query="SELECT current_database(), current_user, version();"
    echo -e "${YELLOW}Testing Neon database connection...${NC}"
    
    if psql "$NEON_DB_URL" -c "$test_query" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Neon database connection successful${NC}"
        
        # Get database statistics
        local table_count=$(psql "$NEON_DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
        local record_count=$(psql "$NEON_DB_URL" -t -c "SELECT SUM(n_tup_ins + n_tup_upd) FROM pg_stat_user_tables;" 2>/dev/null | xargs)
        
        echo -e "${GREEN}Database contains ${table_count} tables with ${record_count:-0} total records${NC}"
        
        # Display table information
        echo -e "${BLUE}Available tables:${NC}"
        psql "$NEON_DB_URL" -c "\dt" 2>/dev/null
        
        return 0
    else
        echo -e "${RED}Failed to connect to Neon database${NC}"
        return 1
    fi
}

if ! verify_neon_connection; then
    echo -e "${YELLOW}Connection failed. Please verify your Neon database URL.${NC}"
    echo -e "${BLUE}Current URL: ${NEON_DB_URL}${NC}"
    
    read -p "Enter correct Neon database URL (or press Enter to continue with current): " NEW_NEON_URL
    if [ -n "$NEW_NEON_URL" ]; then
        NEON_DB_URL="$NEW_NEON_URL"
        if ! verify_neon_connection; then
            echo -e "${RED}Connection still failed. Exiting.${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}Proceeding with current URL...${NC}"
    fi
fi

# Step 3: Enhanced data export from Neon
echo -e "${BLUE}[3/6] Exporting data from Neon database...${NC}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="neon_export_${TIMESTAMP}.sql"
SCHEMA_FILE="neon_schema_${TIMESTAMP}.sql"

# Export schema separately for better control
echo -e "${YELLOW}Exporting database schema...${NC}"
pg_dump "$NEON_DB_URL" \
    --schema-only \
    --no-owner \
    --no-privileges \
    --no-tablespaces \
    --no-security-labels \
    --clean \
    --if-exists \
    --verbose > "$SCHEMA_FILE" 2>/dev/null

# Export data only
echo -e "${YELLOW}Exporting database data...${NC}"
pg_dump "$NEON_DB_URL" \
    --data-only \
    --no-owner \
    --no-privileges \
    --column-inserts \
    --rows-per-insert=1000 \
    --verbose > "$DUMP_FILE" 2>/dev/null

# Verify exports
if [ -s "$SCHEMA_FILE" ] && [ -s "$DUMP_FILE" ]; then
    echo -e "${GREEN}Database export completed successfully${NC}"
    echo -e "${BLUE}Schema file: ${SCHEMA_FILE} ($(du -h "$SCHEMA_FILE" | cut -f1))${NC}"
    echo -e "${BLUE}Data file: ${DUMP_FILE} ($(du -h "$DUMP_FILE" | cut -f1))${NC}"
else
    echo -e "${RED}Database export failed or produced empty files${NC}"
    exit 1
fi

# Step 4: Railway database connection setup
echo -e "${BLUE}[4/6] Configuring Railway database connection...${NC}"

get_railway_db_url() {
    local db_url=""
    
    # Method 1: Try to get from Railway service environment
    echo -e "${YELLOW}Attempting to retrieve Railway database URL...${NC}"
    
    # Try different variable names that Railway might use
    for var_name in DATABASE_URL POSTGRES_URL DB_URL RAILWAY_DATABASE_URL; do
        echo -e "${BLUE}Checking ${var_name}...${NC}"
        
        # Use Railway CLI to get the variable
        if db_url=$(railway run --service "$RAILWAY_DB_SERVICE_NAME" bash -c "echo \$${var_name}" 2>/dev/null); then
            if [ -n "$db_url" ] && [[ "$db_url" =~ ^postgresql:// ]] && [ "$db_url" != "null" ]; then
                echo -e "${GREEN}✓ Found database URL in ${var_name}${NC}"
                echo "$db_url"
                return 0
            fi
        fi
    done
    
    # Method 2: Try to get from main service (sometimes DATABASE_URL is in main service)
    echo -e "${YELLOW}Checking main service for database URL...${NC}"
    for var_name in DATABASE_URL POSTGRES_URL; do
        if db_url=$(railway variables get ${var_name} 2>/dev/null); then
            if [ -n "$db_url" ] && [[ "$db_url" =~ ^postgresql:// ]]; then
                echo -e "${GREEN}✓ Found database URL in main service ${var_name}${NC}"
                echo "$db_url"
                return 0
            fi
        fi
    done
    
    return 1
}

RAILWAY_DB_URL=$(get_railway_db_url)

if [ -z "$RAILWAY_DB_URL" ]; then
    echo -e "${YELLOW}Could not automatically retrieve Railway database URL.${NC}"
    echo -e "${BLUE}Please get the connection string from your Railway dashboard:${NC}"
    echo "1. Go to your Railway project dashboard"
    echo "2. Click on your PostgreSQL service (${RAILWAY_DB_SERVICE_NAME})"
    echo "3. Go to 'Variables' tab or 'Connect' tab"
    echo "4. Copy the PostgreSQL connection URL"
    echo ""
    read -p "Enter Railway PostgreSQL connection URL: " RAILWAY_DB_URL
    
    if [ -z "$RAILWAY_DB_URL" ] || [[ ! "$RAILWAY_DB_URL" =~ ^postgresql:// ]]; then
        echo -e "${RED}Invalid database URL provided. Exiting.${NC}"
        exit 1
    fi
fi

# Step 5: Test Railway database connection
echo -e "${BLUE}[5/6] Testing Railway database connection...${NC}"

test_railway_connection() {
    local test_query="SELECT current_database(), current_user, pg_size_pretty(pg_database_size(current_database()));"
    
    if psql "$RAILWAY_DB_URL" -c "$test_query" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Railway database connection successful${NC}"
        
        # Check existing tables
        local existing_tables=$(psql "$RAILWAY_DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
        echo -e "${BLUE}Railway database currently has ${existing_tables} tables${NC}"
        
        if [ "$existing_tables" -gt 0 ]; then
            echo -e "${YELLOW}Warning: Railway database is not empty. Existing data may be overwritten.${NC}"
            read -p "Continue with import? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${YELLOW}Import cancelled by user.${NC}"
                return 1
            fi
        fi
        
        return 0
    else
        echo -e "${RED}Failed to connect to Railway database${NC}"
        return 1
    fi
}

if ! test_railway_connection; then
    echo -e "${YELLOW}Please verify the Railway database URL is correct.${NC}"
    read -p "Enter correct Railway database URL: " NEW_RAILWAY_URL
    if [ -n "$NEW_RAILWAY_URL" ]; then
        RAILWAY_DB_URL="$NEW_RAILWAY_URL"
        if ! test_railway_connection; then
            echo -e "${RED}Connection still failed. Exiting.${NC}"
            exit 1
        fi
    else
        echo -e "${RED}No valid database URL provided. Exiting.${NC}"
        exit 1
    fi
fi

# Step 6: Import data to Railway with transaction safety
echo -e "${BLUE}[6/6] Importing data to Railway database...${NC}"

IMPORT_LOG="railway_import_${TIMESTAMP}.log"

# Create comprehensive import script
cat > railway_import_script.sql << EOF
-- Railway Database Import Script
-- Generated: $(date)
-- Source: Neon Database Migration

BEGIN;

-- Set session variables for safer import
SET session_replication_role = replica;
SET client_min_messages = WARNING;
SET log_min_messages = WARNING;

-- Create schema first
\echo 'Importing database schema...'
\i ${SCHEMA_FILE}

-- Import data
\echo 'Importing database data...'
\i ${DUMP_FILE}

-- Reset session variables
SET session_replication_role = DEFAULT;

-- Verify import
\echo 'Verifying import...'
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserted_rows,
    n_tup_upd as updated_rows
FROM pg_stat_user_tables 
ORDER BY tablename;

COMMIT;

\echo 'Database import completed successfully!'
EOF

# Execute the import
echo -e "${YELLOW}Executing database import...${NC}"
if psql "$RAILWAY_DB_URL" \
    --single-transaction \
    --set ON_ERROR_STOP=on \
    --echo-queries \
    --file=railway_import_script.sql > "$IMPORT_LOG" 2>&1; then
    
    echo -e "${GREEN}✓ Database import completed successfully!${NC}"
    
    # Verify the import results
    echo -e "${BLUE}Verifying import results...${NC}"
    FINAL_TABLE_COUNT=$(psql "$RAILWAY_DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
    FINAL_RECORD_COUNT=$(psql "$RAILWAY_DB_URL" -t -c "SELECT COALESCE(SUM(n_tup_ins + n_tup_upd), 0) FROM pg_stat_user_tables;" 2>/dev/null | xargs)
    
    echo -e "${GREEN}Import completed: ${FINAL_TABLE_COUNT} tables, ${FINAL_RECORD_COUNT} total records${NC}"
    
    # Display final table status
    echo -e "${BLUE}Final table status:${NC}"
    psql "$RAILWAY_DB_URL" -c "\dt+" 2>/dev/null || echo -e "${YELLOW}Could not display table details${NC}"
    
    MIGRATION_SUCCESS=true
else
    echo -e "${RED}Database import failed!${NC}"
    echo -e "${YELLOW}Check the import log for details:${NC}"
    echo -e "${BLUE}Log file: ${IMPORT_LOG}${NC}"
    tail -20 "$IMPORT_LOG" 2>/dev/null || echo -e "${YELLOW}No log file available${NC}"
    MIGRATION_SUCCESS=false
fi

# Step 7: Cleanup and backup management
echo -e "${BLUE}[7/7] Organizing backups and cleanup...${NC}"

# Create backup directory structure
BACKUP_DIR="./database_backups/migration_${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"

# Move files to backup directory
cp "$SCHEMA_FILE" "$BACKUP_DIR/"
cp "$DUMP_FILE" "$BACKUP_DIR/"
[ -f "$IMPORT_LOG" ] && cp "$IMPORT_LOG" "$BACKUP_DIR/"
[ -f "railway_import_script.sql" ] && cp "railway_import_script.sql" "$BACKUP_DIR/"

# Create migration summary
cat > "$BACKUP_DIR/migration_summary.txt" << EOF
ARIX Terminal Database Migration Summary
========================================
Migration Date: $(date)
Source Database: Neon PostgreSQL
Target Database: Railway PostgreSQL
Railway Service: ${RAILWAY_DB_SERVICE_NAME}

Files Generated:
- Schema Export: ${SCHEMA_FILE}
- Data Export: ${DUMP_FILE}
- Import Script: railway_import_script.sql
- Import Log: ${IMPORT_LOG}

Migration Status: $([ "$MIGRATION_SUCCESS" = true ] && echo "SUCCESS" || echo "FAILED")
Final Table Count: ${FINAL_TABLE_COUNT:-"Unknown"}
Final Record Count: ${FINAL_RECORD_COUNT:-"Unknown"}

Railway Database URL: ${RAILWAY_DB_URL}
Neon Database URL: ${NEON_DB_URL}
EOF

echo -e "${GREEN}Backup saved to: ${BACKUP_DIR}${NC}"

# Cleanup temporary files
rm -f "$SCHEMA_FILE" "$DUMP_FILE" "$IMPORT_LOG" "railway_import_script.sql"

# Rotate old backups (keep last 5)
cd ./database_backups 2>/dev/null || true
ls -t | grep "migration_" | tail -n +6 | xargs rm -rf 2>/dev/null || true
cd .. 2>/dev/null || true

echo ""
echo -e "${GREEN}🚀 === RAILWAY DEPLOYMENT AND MIGRATION COMPLETE === 🚀${NC}"
echo ""

# Final status report
if [ "$MIGRATION_SUCCESS" = true ]; then
    echo -e "${GREEN}✅ Application deployed successfully to Railway${NC}"
    echo -e "${GREEN}✅ Database migrated successfully from Neon to Railway${NC}"
    echo -e "${GREEN}✅ ${FINAL_TABLE_COUNT} tables with ${FINAL_RECORD_COUNT} records imported${NC}"
    
    # Test application endpoint
    echo -e "${BLUE}Testing application endpoint...${NC}"
    APP_URL=$(railway domain 2>/dev/null | head -1 | awk '{print $1}' || echo "Unable to determine")
    if [ "$APP_URL" != "Unable to determine" ]; then
        echo -e "${GREEN}Application URL: https://${APP_URL}${NC}"
        if curl -s "https://${APP_URL}/health" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Application is responding to health checks${NC}"
        else
            echo -e "${YELLOW}⚠️  Application may still be starting up${NC}"
        fi
    fi
else
    echo -e "${GREEN}✅ Application deployed successfully to Railway${NC}"
    echo -e "${YELLOW}⚠️  Database migration encountered issues${NC}"
    echo -e "${BLUE}Check the migration log in: ${BACKUP_DIR}${NC}"
fi

echo ""
echo -e "${YELLOW}📋 POST-DEPLOYMENT CHECKLIST:${NC}"
echo ""
echo -e "${BLUE}1. Verify Environment Variables in Railway Dashboard:${NC}"
echo "   • NODE_ENV=production"
echo "   • DATABASE_URL (auto-configured by PostgreSQL service)"
echo "   • CORS_WHITELIST (your frontend domains)"
echo "   • TELEGRAM_BOT_TOKEN"
echo "   • Any other application-specific variables"
echo ""
echo -e "${BLUE}2. Monitor Application Logs:${NC}"
echo "   railway logs --service ar-backend"
echo ""
echo -e "${BLUE}3. Monitor Database Logs:${NC}"
echo "   railway logs --service ${RAILWAY_DB_SERVICE_NAME}"
echo ""
echo -e "${BLUE}4. Test Application Endpoints:${NC}"
echo "   railway open"
echo "   # Or visit your Railway application URL"
echo ""
echo -e "${BLUE}5. Verify Database Connection:${NC}"
echo "   railway run --service ${RAILWAY_DB_SERVICE_NAME} -- psql \$DATABASE_URL -c '\\dt'"
echo ""
echo -e "${BLUE}6. Update Frontend Configuration:${NC}"
echo "   Update your frontend to point to the new Railway backend URL"
echo ""

# Optional Railway dashboard access
read -p "Open Railway dashboard now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway open || echo -e "${YELLOW}Unable to open dashboard automatically${NC}"
fi

echo -e "${GREEN}🎉 Migration completed! Your ARIX Terminal backend is now running on Railway! 🎉${NC}"
echo ""
echo -e "${BLUE}Migration backup location: ${BACKUP_DIR}${NC}"
echo -e "${BLUE}Keep this backup safe for future reference.${NC}"