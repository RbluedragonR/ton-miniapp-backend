-- Railway Database Import Script
-- Generated: Sat Jun 14 13:42:13 EAT 2025
-- Source: Neon Database Migration

BEGIN;

-- Set session variables for safer import
SET session_replication_role = replica;
SET client_min_messages = WARNING;
SET log_min_messages = WARNING;

-- Create schema first
\echo 'Importing database schema...'
\i neon_schema_20250614_133950.sql

-- Import data
\echo 'Importing database data...'
\i neon_export_20250614_133950.sql

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
