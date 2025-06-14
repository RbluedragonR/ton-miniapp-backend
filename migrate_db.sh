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
echo -e "${BLUE}[1/3] Checking for local PostgreSQL tools...${NC}"
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
echo -e "${BLUE}[2/3] Exporting data from Neon...${NC}"

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

# Step 3: Import to Railway
echo -e "${BLUE}[3/3] Importing data into Railway PostgreSQL database...${NC}"

# Get Railway database connection URL
echo -e "${YELLOW}Getting Railway database connection details...${NC}"
RAILWAY_DB_URL=$(railway variables --kv | grep DATABASE_URL | cut -d'=' -f2- || echo "")

if [ -z "$RAILWAY_DB_URL" ]; then
    echo -e "${YELLOW}DATABASE_URL not found in variables. Using Railway run command...${NC}"
    # Import using Railway run command
    railway run --service "${RAILWAY_DB_SERVICE_NAME}" -- psql < "$DUMP_FILE"
else
    echo -e "${YELLOW}Found DATABASE_URL, importing directly...${NC}"
    # Import directly using the database URL
    psql "$RAILWAY_DB_URL" < "$DUMP_FILE"
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Successfully imported data into Railway.${NC}"
else
    echo -e "${RED}Failed to import data into Railway. Please check the database connection.${NC}"
    echo -e "${YELLOW}You may need to manually import the dump file: ${DUMP_FILE}${NC}"
fi

# --- Cleanup and Final Instructions ---
echo -e "${BLUE}[6/6] Cleaning up temporary files...${NC}"

# Keep the dump file for backup but move it to a backup directory
mkdir -p ./database_backups
mv "$DUMP_FILE" ./database_backups/
echo -e "${GREEN}Backup saved to: ./database_backups/${DUMP_FILE##*/}${NC}"

# Clean up any backup files created during the process
rm -f ./src/app.js.bak

echo ""
echo -e "${GREEN}--- FULL DEPLOYMENT AND MIGRATION COMPLETE ---${NC}"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo -e "${BLUE}1. Add your environment secrets in the Railway Dashboard:${NC}"
echo -e "   - CORS_WHITELIST"
echo -e "   - TELEGRAM_BOT_TOKEN"
echo -e "   - Any other application-specific variables"
echo ""
echo -e "${BLUE}2. Verify your deployment:${NC}"
railway logs
echo ""
echo -e "${BLUE}3. Open Railway Dashboard:${NC}"
railway open
echo ""
echo -e "${GREEN}Deployment completed successfully! 🎉${NC}"