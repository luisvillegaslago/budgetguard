-- Migration: convert historical exit altitudes from metres to feet
--
-- "SkydiveJumps"."ExitAltitudeFt" is named for feet and JumpLogTable renders it as feet,
-- but 1.144 of the 1.174 recorded jumps hold METRES. The jump form asked for "Altitud de
-- salida (m)" until 2026-09-22, so every altitude entered before then is metres sitting in
-- a column named Ft, displayed with a feet suffix and no conversion: a factor of 3.28.
--
-- The two populations are cleanly separated in the data, with no overlap at all:
--
--   metres group : 1.144 rows, max 5.174
--   (dead zone)  :     0 rows between 5.200 and 12.600
--   feet group   :    30 rows, min 12.645
--
-- so 8.000 sits in the middle of a 7.471-wide gap and splits them without ambiguity.
--
-- CAVEAT WORTH KNOWING BEFORE TRUSTING THE RESULT: 991 of the converted rows held exactly
-- 4000, a constant filled in by the original bulk import rather than a measured altitude.
-- They become 13123 and will look precise. They are not. Only ~138 of the converted values
-- were ever individually recorded. Luis chose to convert them all so the column carries one
-- unit throughout; this note is here so nobody later reads 13123 as an observation.
--
-- The lowest converted value is a Canopy Hop-n-Pop at Skydive Dubai, 1.574 m -> 5.164 ft.
-- That one is genuine, not an error: a hop-n-pop opens immediately at low altitude.
--
-- Usage:
--   psql "$DATABASE_URL" -f database/migrations/006-convert-exit-altitude-to-feet.sql

DO $$
DECLARE
  mean_altitude NUMERIC;
  converted     INT;
BEGIN
  SELECT AVG("ExitAltitudeFt") INTO mean_altitude
  FROM "SkydiveJumps" WHERE "ExitAltitudeFt" IS NOT NULL;

  -- Idempotency guard. A value-range guard CANNOT work here: the lowest metre value
  -- (1.574 m) converts to 5.164 ft, which is still below any threshold that separates the
  -- two groups, so a re-run would convert it a second time. The mean is unambiguous —
  -- 4.254 before, above 12.000 after — and a single jump cannot move it across that line.
  IF mean_altitude IS NULL OR mean_altitude >= 8000 THEN
    RAISE NOTICE 'Exit altitudes already in feet (mean %); nothing to do.', ROUND(mean_altitude);
    RETURN;
  END IF;

  UPDATE "SkydiveJumps"
     SET "ExitAltitudeFt" = ROUND("ExitAltitudeFt" / 0.3048),
         "UpdatedAt"      = CURRENT_TIMESTAMP
   WHERE "ExitAltitudeFt" IS NOT NULL
     AND "ExitAltitudeFt" < 8000;

  GET DIAGNOSTICS converted = ROW_COUNT;
  RAISE NOTICE 'Converted % jump altitudes from metres to feet.', converted;
END $$;
