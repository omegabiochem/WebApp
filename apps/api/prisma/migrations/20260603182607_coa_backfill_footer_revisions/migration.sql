-- This is an empty migration.-- This is an empty migration.

UPDATE "COADetails" AS d
SET
  "footerRevNo" = CASE
    WHEN r."createdAt" >= TIMESTAMP '2026-01-01 00:00:00'
     AND r."createdAt" <  TIMESTAMP '2026-03-10 00:00:00'
      THEN 'Rev-00'

    WHEN r."createdAt" >= TIMESTAMP '2026-03-10 00:00:00'
     AND r."createdAt" <  TIMESTAMP '2026-04-08 00:00:00'
      THEN 'Rev-01'

    ELSE 'Rev-02'
  END,
  "footerDateEffective" = CASE
    WHEN r."createdAt" >= TIMESTAMP '2026-01-01 00:00:00'
     AND r."createdAt" <  TIMESTAMP '2026-03-10 00:00:00'
      THEN TIMESTAMP '2026-01-01 12:00:00'

    WHEN r."createdAt" >= TIMESTAMP '2026-03-10 00:00:00'
     AND r."createdAt" <  TIMESTAMP '2026-04-08 00:00:00'
      THEN TIMESTAMP '2026-03-10 12:00:00'

    ELSE TIMESTAMP '2026-04-08 12:00:00'
  END
FROM "ChemistryReport" AS r
WHERE d."chemistryId" = r."id"
  AND r."formType" = 'COA'
  AND d."footerRevNo" IS NULL;