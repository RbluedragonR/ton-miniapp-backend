-- Start Transaction
BEGIN;

-- Import Schema
\echo '--- Importing schema ---'
\i neon_schema_20250614_141100.sql

-- Disable Triggers to allow out-of-order data insertion
\echo '--- Disabling triggers for data import ---'
SET session_replication_role = 'replica';

-- Import Data
\echo '--- Importing data ---'
\i neon_export_20250614_141100.sql

-- Re-enable Triggers
\echo '--- Re-enabling triggers ---'
SET session_replication_role = 'origin';

-- End Transaction
COMMIT;
