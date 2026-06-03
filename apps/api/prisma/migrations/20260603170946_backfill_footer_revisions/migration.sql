-- This is an empty migration.

UPDATE "MicroMixDetails" AS d
SET
  "footerRevNo" = CASE
    WHEN r."createdAt" >= TIMESTAMP '2026-01-01 00:00:00'
     AND r."createdAt" <  TIMESTAMP '2026-03-10 00:00:00'
      THEN 'Rev-00'

    WHEN r."createdAt" >= TIMESTAMP '2026-03-10 00:00:00'
     AND r."createdAt" <  TIMESTAMP '2026-06-03 00:00:00'
      THEN 'Rev-01'

    ELSE 'Rev-02'
  END,
  "footerDateEffective" = CASE
    WHEN r."createdAt" >= TIMESTAMP '2026-01-01 00:00:00'
     AND r."createdAt" <  TIMESTAMP '2026-03-10 00:00:00'
      THEN TIMESTAMP '2026-01-01 12:00:00'

    WHEN r."createdAt" >= TIMESTAMP '2026-03-10 00:00:00'
     AND r."createdAt" <  TIMESTAMP '2026-06-03 00:00:00'
      THEN TIMESTAMP '2026-03-10 12:00:00'

    ELSE TIMESTAMP '2026-06-03 12:00:00'
  END
FROM "Report" AS r
WHERE d."reportId" = r."id"
  AND r."formType" = 'MICRO_MIX'
  AND d."footerRevNo" IS NULL;