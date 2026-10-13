#!/bin/sh
# Creates the restricted runtime role the app connects as, so row-level security is enforced
# locally the same way it is in production. The POSTGRES_USER superuser stays the migration owner.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
CREATE ROLE maintenance_app_runtime LOGIN PASSWORD 'maintenance_app_runtime' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO maintenance_app_runtime;
GRANT USAGE ON SCHEMA public TO maintenance_app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO maintenance_app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO maintenance_app_runtime;
SQL
