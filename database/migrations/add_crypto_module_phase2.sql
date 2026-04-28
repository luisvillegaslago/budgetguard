-- Migration: Crypto module — Phase 2 (raw event ingestion + sync jobs)
--
-- Forward-only. Idempotent (uses IF NOT EXISTS / DO blocks). Does NOT drop or
-- recreate any pre-existing object — safe to run on a populated production DB.
--
-- Applies the same DDL as the corresponding section of database/schema.sql.
--
-- Run with:  psql "$DATABASE_URL" -f database/migrations/add_crypto_module_phase2.sql

-- 1. CryptoSyncJobs ----------------------------------------------------------
-- Sync job lifecycle: one row per backfill or incremental run.
-- Status transitions: pending -> running -> (completed | failed).
-- Progress is a JSONB map: { endpoint: { fetched, totalWindows, lastWindowEnd } }
-- so the UI can render a progress bar without polling the row count.
CREATE TABLE IF NOT EXISTS "CryptoSyncJobs" (
    "JobID" SERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
    "Exchange" VARCHAR(20) NOT NULL,
    "Mode" VARCHAR(15) NOT NULL CHECK ("Mode" IN ('full', 'incremental')),
    "Status" VARCHAR(15) NOT NULL DEFAULT 'pending'
        CHECK ("Status" IN ('pending', 'running', 'completed', 'failed')),
    "ScopeFrom" TIMESTAMPTZ NOT NULL,
    "ScopeTo" TIMESTAMPTZ NOT NULL,
    "Progress" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "ErrorCode" VARCHAR(60),
    "ErrorMessage" TEXT,
    "EventsIngested" INT NOT NULL DEFAULT 0,
    "StartedAt" TIMESTAMPTZ,
    "FinishedAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IX_CryptoSyncJobs_UserStatus"
    ON "CryptoSyncJobs"("UserID", "Status", "CreatedAt" DESC);

CREATE INDEX IF NOT EXISTS "IX_CryptoSyncJobs_UserExchange"
    ON "CryptoSyncJobs"("UserID", "Exchange", "FinishedAt" DESC);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'TR_CryptoSyncJobs_UpdatedAt') THEN
        CREATE TRIGGER "TR_CryptoSyncJobs_UpdatedAt"
            BEFORE UPDATE ON "CryptoSyncJobs"
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 2. BinanceRawEvents --------------------------------------------------------
-- Raw events ingested from Binance, one row per upstream event. Idempotent
-- by (UserID, EventType, ExternalID) — re-running a sync window inserts
-- 0 duplicates. RawPayload is the verbatim JSON from the API for AEAT
-- reproducibility and to allow re-normalisation when Phase 3+ logic changes.
CREATE TABLE IF NOT EXISTS "BinanceRawEvents" (
    "EventID" BIGSERIAL PRIMARY KEY,
    "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
    "EventType" VARCHAR(30) NOT NULL,
    "ExternalID" VARCHAR(120) NOT NULL,
    "OccurredAt" TIMESTAMPTZ NOT NULL,
    "RawPayload" JSONB NOT NULL,
    "IngestedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "JobID" INT REFERENCES "CryptoSyncJobs"("JobID") ON DELETE SET NULL,
    CONSTRAINT "UQ_BinanceRawEvents_UserTypeExternal" UNIQUE ("UserID", "EventType", "ExternalID")
);

CREATE INDEX IF NOT EXISTS "IX_BinanceRawEvents_UserOccurred"
    ON "BinanceRawEvents"("UserID", "OccurredAt" DESC);

CREATE INDEX IF NOT EXISTS "IX_BinanceRawEvents_TypeOccurred"
    ON "BinanceRawEvents"("EventType", "OccurredAt" DESC);

-- 3. Done --------------------------------------------------------------------
-- Verify with:
--   SELECT table_name FROM information_schema.tables
--    WHERE table_name IN ('CryptoSyncJobs', 'BinanceRawEvents');
