-- This is an empty migration.

UPDATE "MicroMixDetails" AS d
SET
  "footerRevNo" = CASE
    WHEN r."createdAt" >= TIMESTAMPTZ '2026-01-01 00:00:00 America/New_York'
     AND r."createdAt" <  TIMESTAMPTZ '2026-03-10 00:00:00 America/New_York'
      THEN 'Rev-00'

    WHEN r."createdAt" >= TIMESTAMPTZ '2026-03-10 00:00:00 America/New_York'
     AND r."createdAt" <  TIMESTAMPTZ '2026-06-03 15:30:00 America/New_York'
      THEN 'Rev-01'

    ELSE 'Rev-02'
  END,
  "footerDateEffective" = CASE
    WHEN r."createdAt" >= TIMESTAMPTZ '2026-01-01 00:00:00 America/New_York'
     AND r."createdAt" <  TIMESTAMPTZ '2026-03-10 00:00:00 America/New_York'
      THEN TIMESTAMPTZ '2026-01-01 12:00:00 America/New_York'

    WHEN r."createdAt" >= TIMESTAMPTZ '2026-03-10 00:00:00 America/New_York'
     AND r."createdAt" <  TIMESTAMPTZ '2026-06-03 15:30:00 America/New_York'
      THEN TIMESTAMPTZ '2026-03-10 12:00:00 America/New_York'

    ELSE TIMESTAMPTZ '2026-06-03 15:30:00 America/New_York'
  END
FROM "Report" AS r
WHERE d."reportId" = r."id"
  AND r."formType" = 'MICRO_MIX';