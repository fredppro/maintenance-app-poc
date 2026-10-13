-- The audit trail is append-only for the application's runtime role. Corrections and
-- retention clean-up are operator actions run with the owner connection.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maintenance_app_runtime') THEN
    REVOKE UPDATE, DELETE ON TABLE "organization_audit_event" FROM maintenance_app_runtime;
  END IF;
END
$$;
