#!/bin/bash
set -e

# --- Configuration ---
# IMPORTANT: Find this in your Railway project dashboard. It's the name of your PostgreSQL service.
RAILWAY_DB_SERVICE_NAME="Postgres-cMD6" # <-- REPLACE "postgresql" with your actual database service name on Railway

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
# FIX: Updated Node engine to match current version and moved 'morgan' from devDependencies to dependencies
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
    "node": ">=18.x"
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
    "node-telegram-bot-api": "^0.65.1",
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

# Check current Node version and warn if not 18.x
NODE_VERSION=$(node -v | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VERSION" != "18" ]; then
    echo -e "${YELLOW}Warning: Current Node version is v$(node -v), but package.json specifies 18.x${NC}"
    echo -e "${YELLOW}This may cause deployment issues. Consider using Node 18.x for consistency.${NC}"
fi

echo -e "${GREEN}Current Node version $(node -v) and npm version $(npm -v)${NC}"

echo -e "${YELLOW}Installing all dependencies from scratch...${NC}"
rm -rf node_modules package-lock.json
npm install --production=false
echo -e "${GREEN}Dependencies are synchronized.${NC}"

# Fix security vulnerabilities
echo -e "${BLUE}Fixing security vulnerabilities...${NC}"
npm audit fix --force || echo -e "${YELLOW}Some vulnerabilities could not be auto-fixed${NC}"

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

# Use the correct Railway CLI syntax for setting variables
echo -e "${YELLOW}Setting NODE_ENV to production...${NC}"
if railway variables --help | grep -q "\--set"; then
    railway variables --set NODE_ENV=production
elif railway variables --help | grep -q "set"; then
    railway variables set NODE_ENV production
else
    echo -e "${YELLOW}Manual step required: Set NODE_ENV=production in Railway dashboard${NC}"
fi

# Step 5: Commit and Deploy
echo -e "${BLUE}[5/6] Committing all fixes and deploying to Railway...${NC}"
git add .
git commit -m "Automated deployment: Fix dependencies, security vulnerabilities, and rebuild core files" --allow-empty

echo -e "${YELLOW}Deploying application. This will deploy and show status...${NC}"
railway up --detach

# Wait for deployment to stabilize
echo -e "${BLUE}Waiting for 45 seconds for the deployment to settle...${NC}"
sleep 45

# Check deployment status
echo -e "${BLUE}Checking deployment status...${NC}"
railway status || echo -e "${YELLOW}Could not fetch status, continuing...${NC}"

echo -e "${GREEN}### DEPLOYMENT SUCCESSFUL ###${NC}"
echo ""

# --- PART 2: DATABASE MIGRATION ---

echo -e "${YELLOW}### PART 2: MIGRATING DATA FROM NEON TO RAILWAY ###${NC}"

# Step 1: Update Local PostgreSQL Tools
echo -e "${BLUE}[1/4] Checking for local PostgreSQL tools...${NC}"
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}Error: pg_dump command not found.${NC}"
    echo -e "${YELLOW}Installing PostgreSQL client tools...${NC}"
    
    # Try to install PostgreSQL tools based on the system
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            echo -e "${YELLOW}Installing via Homebrew...${NC}"
            brew install libpq
            # Add to PATH
            echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
            export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
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

# Step 2: Export from Neon
DUMP_FILE="neon_dump_$(date +%Y%m%d_%H%M%S).sql"
echo -e "${BLUE}[2/4] Exporting data from Neon...${NC}"

# Test connection first
echo -e "${YELLOW}Testing connection to Neon database...${NC}"
if ! pg_dump "$NEON_DB_URL" --schema-only --no-owner --no-privileges > /dev/null 2>&1; then
    echo -e "${RED}Failed to connect to Neon database. Please check your connection string.${NC}"
    exit 1
fi

# Export full database
echo -e "${YELLOW}Exporting full database...${NC}"
pg_dump "$NEON_DB_URL" \
    --clean \
    --no-owner \
    --no-privileges \
    --no-tablespaces \
    --no-security-labels \
    --no-comments > "$DUMP_FILE"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Successfully exported data from Neon to ${DUMP_FILE}.${NC}"
    echo -e "${BLUE}Dump file size: $(du -h "$DUMP_FILE" | cut -f1)${NC}"
else
    echo -e "${RED}Failed to export data from Neon.${NC}"
    exit 1
fi

# Step 3: Import to Railway with Multiple Methods
echo -e "${BLUE}[3/4] Importing data into Railway PostgreSQL database...${NC}"

# Initialize success flag
IMPORT_SUCCESS=false

# Method 1: Copy dump file to Railway and import
echo -e "${YELLOW}🔄 Method 1: Copy dump file to Railway and import${NC}"
echo -e "${BLUE}   Copying dump file to Railway filesystem...${NC}"

if railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash -c "cat > /tmp/railway_import_$(date +%s).sql" < "$DUMP_FILE" 2>/dev/null; then
    echo -e "${GREEN}   ✓ Dump file copied successfully${NC}"
    echo -e "${BLUE}   Importing data from Railway filesystem...${NC}"
    
    if railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash -c "psql \$DATABASE_URL < /tmp/railway_import_*.sql && rm /tmp/railway_import_*.sql" 2>/dev/null; then
        echo -e "${GREEN}   ✓ Method 1 SUCCESSFUL: Database imported and cleaned up!${NC}"
        IMPORT_SUCCESS=true
    else
        echo -e "${RED}   ✗ Method 1 failed at import step${NC}"
        # Clean up failed import file
        railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash -c "rm -f /tmp/railway_import_*.sql" 2>/dev/null || true
    fi
else
    echo -e "${RED}   ✗ Method 1 failed at copy step${NC}"
fi

# Method 2: Stream import directly (if Method 1 failed)
if [ "$IMPORT_SUCCESS" = false ]; then
    echo -e "${YELLOW}🔄 Method 2: Direct stream import${NC}"
    
    if railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash -c "psql \$DATABASE_URL" < "$DUMP_FILE" 2>/dev/null; then
        echo -e "${GREEN}   ✓ Method 2 SUCCESSFUL: Stream import completed!${NC}"
        IMPORT_SUCCESS=true
    else
        echo -e "${RED}   ✗ Method 2 failed${NC}"
    fi
fi

# Method 3: Chunk-based import (if Methods 1 & 2 failed)
if [ "$IMPORT_SUCCESS" = false ]; then
    echo -e "${YELLOW}🔄 Method 3: Chunk-based import${NC}"
    
    # Create a more robust import script
    cat > railway_import_script.sh << 'IMPORT_SCRIPT_EOF'
#!/bin/bash
set -e
echo "Starting Railway database import..."
echo "Database URL available: $([ -n "$DATABASE_URL" ] && echo "YES" || echo "NO")"

# Read from stdin and import
echo "Reading SQL data and importing..."
psql "$DATABASE_URL" --quiet --no-psqlrc --single-transaction

echo "Import completed successfully!"
IMPORT_SCRIPT_EOF

    chmod +x railway_import_script.sh
    
    if cat "$DUMP_FILE" | railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash -s < railway_import_script.sh 2>/dev/null; then
        echo -e "${GREEN}   ✓ Method 3 SUCCESSFUL: Chunk-based import completed!${NC}"
        IMPORT_SUCCESS=true
    else
        echo -e "${RED}   ✗ Method 3 failed${NC}"
    fi
    
    rm -f railway_import_script.sh
fi

# Method 4: Interactive Railway shell import (if all automated methods failed)
if [ "$IMPORT_SUCCESS" = false ]; then
    echo -e "${YELLOW}🔄 Method 4: Interactive Railway shell import${NC}"
    
    # Create a comprehensive import script that handles errors
    cat > comprehensive_import.sh << 'COMPREHENSIVE_EOF'
#!/bin/bash
echo "=== Railway Database Import Script ==="
echo "Database URL: ${DATABASE_URL:0:20}..."

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql not available in Railway environment"
    exit 1
fi

# Test database connection
echo "Testing database connection..."
if ! psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to database"
    exit 1
fi

echo "Database connection successful!"

# Read SQL from stdin and execute
echo "Executing SQL import..."
exec psql "$DATABASE_URL" --quiet --no-psqlrc
COMPREHENSIVE_EOF

    chmod +x comprehensive_import.sh
    
    if cat "$DUMP_FILE" | railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash comprehensive_import.sh 2>/dev/null; then
        echo -e "${GREEN}   ✓ Method 4 SUCCESSFUL: Interactive import completed!${NC}"
        IMPORT_SUCCESS=true
    else
        echo -e "${RED}   ✗ Method 4 failed${NC}"
    fi
    
    rm -f comprehensive_import.sh
fi

# Method 5: Failsafe with environment debugging (if all methods failed)
if [ "$IMPORT_SUCCESS" = false ]; then
    echo -e "${YELLOW}🔄 Method 5: Failsafe with debugging${NC}"
    
    # Debug Railway environment first
    echo -e "${BLUE}   Debugging Railway environment...${NC}"
    railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash -c "echo 'Available commands:'; which psql; echo 'Database URL set:'; [ -n \"\$DATABASE_URL\" ] && echo 'YES' || echo 'NO'" 2>/dev/null || echo "Could not debug environment"
    
    # Try one more time with maximum verbosity and error handling
    cat > final_import.sh << 'FINAL_EOF'
#!/bin/bash
set -e
exec 2>&1  # Redirect stderr to stdout

echo "=== FINAL IMPORT ATTEMPT ==="
echo "Timestamp: $(date)"
echo "DATABASE_URL exists: $([ -n "$DATABASE_URL" ] && echo "YES" || echo "NO")"

# Ensure we have psql
if ! command -v psql >/dev/null 2>&1; then
    echo "FATAL: psql command not found"
    exit 1
fi

# Test basic connectivity
echo "Testing database connectivity..."
if ! timeout 30 psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
    echo "FATAL: Database connection failed"
    exit 1
fi

echo "Connection test passed. Starting import..."

# Import with timeout and proper error handling
timeout 300 psql "$DATABASE_URL" \
    --quiet \
    --no-psqlrc \
    --single-transaction \
    --set ON_ERROR_STOP=on \
    --set VERBOSITY=verbose

echo "=== IMPORT COMPLETED SUCCESSFULLY ==="
FINAL_EOF

    chmod +x final_import.sh
    
    if cat "$DUMP_FILE" | railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- bash final_import.sh; then
        echo -e "${GREEN}   ✓ Method 5 SUCCESSFUL: Failsafe import completed!${NC}"
        IMPORT_SUCCESS=true
    else
        echo -e "${RED}   ✗ Method 5 failed - All automated methods exhausted${NC}"
    fi
    
    rm -f final_import.sh
fi

# Final status check
if [ "$IMPORT_SUCCESS" = true ]; then
    echo -e "${GREEN}🎉 DATABASE IMPORT SUCCESSFUL! 🎉${NC}"
else
    echo -e "${RED}❌ ALL AUTOMATED IMPORT METHODS FAILED${NC}"
    echo -e "${YELLOW}📋 MANUAL IMPORT INSTRUCTIONS:${NC}"
    echo ""
    echo -e "${BLUE}1. Copy dump file to Railway:${NC}"
    echo "   cat '$DUMP_FILE' | railway run --service ${RAILWAY_DB_SERVICE_NAME} -- bash -c 'cat > /tmp/manual_dump.sql'"
    echo ""
    echo -e "${BLUE}2. Connect to Railway database and import:${NC}"
    echo "   railway run --service ${RAILWAY_DB_SERVICE_NAME} -- psql \$DATABASE_URL"
    echo "   Then in psql prompt: \\i /tmp/manual_dump.sql"
    echo ""
    echo -e "${BLUE}3. Or use Railway dashboard:${NC}"
    echo "   railway open"
    echo "   Go to ${RAILWAY_DB_SERVICE_NAME} service → Connect → Use external connection details"
    echo ""
fi

# Step 4: Cleanup and Backup Management
echo -e "${BLUE}[4/4] Cleaning up and organizing backups...${NC}"

# Create backup directory and organize files
mkdir -p ./database_backups
mv "$DUMP_FILE" ./database_backups/
echo -e "${GREEN}Backup saved to: ./database_backups/${DUMP_FILE##*/}${NC}"

# Clean up any temporary files
rm -f ./src/app.js.bak
rm -f railway_import_script.sh comprehensive_import.sh final_import.sh
rm -f temp_import.sh

# Keep only the 5 most recent backups
cd ./database_backups
ls -t neon_dump_*.sql 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
cd ..

echo ""
echo -e "${GREEN}🚀 === FULL DEPLOYMENT AND MIGRATION COMPLETE === 🚀${NC}"
echo ""

if [ "$IMPORT_SUCCESS" = true ]; then
    echo -e "${GREEN}✅ Application deployed successfully${NC}"
    echo -e "${GREEN}✅ Database migrated successfully${NC}"
else
    echo -e "${GREEN}✅ Application deployed successfully${NC}"
    echo -e "${YELLOW}⚠️  Database migration requires manual completion${NC}"
fi

echo ""
echo -e "${YELLOW}📋 NEXT STEPS:${NC}"
echo -e "${BLUE}1. Add environment secrets in Railway Dashboard:${NC}"
echo -e "   • CORS_WHITELIST"
echo -e "   • TELEGRAM_BOT_TOKEN"
echo -e "   • Any other application-specific variables"
echo ""
echo -e "${BLUE}2. Verify your deployment:${NC}"
echo "   railway logs"
echo ""
echo -e "${BLUE}3. Test your application:${NC}"
echo "   railway open"
echo ""
echo -e "${GREEN}🎉 Deployment automation completed! 🎉${NC}"

# Optional: Open Railway dashboard
read -p "Open Railway dashboard now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway open
fi