-- This is an empty migration.

UPDATE "Report"
SET "reportNumber" = regexp_replace("reportNumber", '^M-', 'OM-')
WHERE "reportNumber" LIKE 'M-%';