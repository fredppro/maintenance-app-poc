DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MaintenanceTask"
    WHERE "endTime" IS NOT NULL AND "endTime" <= "startTime"
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce maintenance task intervals: invalid startTime/endTime rows already exist';
  END IF;
END $$;

ALTER TABLE "MaintenanceTask"
  ADD CONSTRAINT "MaintenanceTask_endTime_after_startTime_check"
  CHECK ("endTime" IS NULL OR "endTime" > "startTime");
