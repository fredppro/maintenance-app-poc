CREATE TABLE "tenant_export_temp_reservation" (
  "id" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "organizationId" TEXT NOT NULL,
  "exportId" TEXT NOT NULL,
  "reservedBytes" BIGINT NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_export_temp_reservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_export_temp_reservation_slot_key" UNIQUE ("slot"),
  CONSTRAINT "tenant_export_temp_reservation_exportId_key" UNIQUE ("exportId"),
  CONSTRAINT "tenant_export_temp_reservation_slot_check" CHECK ("slot" BETWEEN 1 AND 4),
  CONSTRAINT "tenant_export_temp_reservation_bytes_check" CHECK ("reservedBytes" = 125829120)
);

CREATE INDEX "tenant_export_temp_reservation_heartbeatAt_idx"
  ON "tenant_export_temp_reservation"("heartbeatAt");

REVOKE ALL ON TABLE "tenant_export_temp_reservation" FROM PUBLIC;

CREATE FUNCTION public.reserve_tenant_export_temp(
  p_organization_id TEXT,
  p_export_id TEXT,
  p_lease_id TEXT
)
RETURNS TABLE(reservation_id TEXT, reserved_bytes BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slot INTEGER;
  v_stale RECORD;
BEGIN
  IF p_organization_id IS DISTINCT FROM current_setting('app.org_id', true) THEN
    RAISE EXCEPTION 'Tenant context does not match export reservation';
  END IF;

  PERFORM pg_advisory_xact_lock(861204, 1);

  FOR v_stale IN
    DELETE FROM public."tenant_export_temp_reservation"
    WHERE "heartbeatAt" <= clock_timestamp() - INTERVAL '4 minutes'
    RETURNING "organizationId", "exportId", "id"
  LOOP
    UPDATE public."tenant_export"
    SET "status" = 'FAILED'::"ExportStatus",
        "error" = 'WORKER_LEASE_EXPIRED',
        "completedAt" = clock_timestamp(),
        "leaseId" = NULL,
        "heartbeatAt" = NULL
    WHERE "organizationId" = v_stale."organizationId"
      AND v_stale."organizationId" = p_organization_id
      AND "id" = v_stale."exportId"
      AND "status" = 'RUNNING'::"ExportStatus"
      AND "leaseId" = v_stale."id";
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public."tenant_export_temp_reservation"
    WHERE "organizationId" = p_organization_id
      AND "exportId" = p_export_id
  ) THEN
    RETURN;
  END IF;

  SELECT slot_candidates.slot
  INTO v_slot
  FROM generate_series(1, 4) AS slot_candidates(slot)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public."tenant_export_temp_reservation" AS reservation
    WHERE reservation."slot" = slot_candidates.slot
  )
  ORDER BY slot_candidates.slot
  LIMIT 1;

  IF v_slot IS NULL THEN
    RETURN;
  END IF;

  UPDATE public."tenant_export"
  SET "status" = 'RUNNING'::"ExportStatus",
      "leaseId" = p_lease_id,
      "heartbeatAt" = clock_timestamp(),
      "error" = NULL
  WHERE "organizationId" = p_organization_id
    AND "id" = p_export_id
    AND "status" = 'PENDING'::"ExportStatus";

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public."tenant_export_temp_reservation" (
    "id",
    "slot",
    "organizationId",
    "exportId",
    "reservedBytes"
  )
  VALUES (
    p_lease_id,
    v_slot,
    p_organization_id,
    p_export_id,
    125829120
  );
  RETURN QUERY SELECT p_lease_id, 125829120::BIGINT;
END;
$$;

CREATE FUNCTION public.heartbeat_tenant_export_temp(
  p_organization_id TEXT,
  p_export_id TEXT,
  p_lease_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_organization_id IS DISTINCT FROM current_setting('app.org_id', true) THEN
    RAISE EXCEPTION 'Tenant context does not match export reservation';
  END IF;

  UPDATE public."tenant_export_temp_reservation"
  SET "heartbeatAt" = clock_timestamp()
  WHERE "id" = p_lease_id
    AND "organizationId" = p_organization_id
    AND "exportId" = p_export_id
    AND "heartbeatAt" > clock_timestamp() - INTERVAL '2 minutes';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public."tenant_export"
  SET "heartbeatAt" = clock_timestamp()
  WHERE "id" = p_export_id
    AND "organizationId" = p_organization_id
    AND "status" = 'RUNNING'::"ExportStatus"
    AND "leaseId" = p_lease_id;

  IF NOT FOUND THEN
    DELETE FROM public."tenant_export_temp_reservation"
    WHERE "id" = p_lease_id
      AND "organizationId" = p_organization_id
      AND "exportId" = p_export_id;
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE FUNCTION public.release_tenant_export_temp(
  p_organization_id TEXT,
  p_export_id TEXT,
  p_lease_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_organization_id IS DISTINCT FROM current_setting('app.org_id', true) THEN
    RAISE EXCEPTION 'Tenant context does not match export reservation';
  END IF;

  DELETE FROM public."tenant_export_temp_reservation"
  WHERE "id" = p_lease_id
    AND "organizationId" = p_organization_id
    AND "exportId" = p_export_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.is_tenant_export_temp_active(
  p_organization_id TEXT,
  p_lease_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_organization_id IS DISTINCT FROM current_setting('app.org_id', true) THEN
    RAISE EXCEPTION 'Tenant context does not match export reservation';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public."tenant_export_temp_reservation"
    WHERE "organizationId" = p_organization_id
      AND "id" = p_lease_id
      AND "heartbeatAt" > clock_timestamp() - INTERVAL '2 minutes'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_tenant_export_temp(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_tenant_export_temp(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_tenant_export_temp(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_tenant_export_temp_active(TEXT, TEXT) FROM PUBLIC;
