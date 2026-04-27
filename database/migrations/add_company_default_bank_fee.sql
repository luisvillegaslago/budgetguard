-- Migration: Add DefaultBankFeeCents column to Companies
-- Stores the default bank transfer fee charged when receiving payments from this client.
-- Used to pre-fill the bank fee input when marking an invoice as paid.
-- Idempotent: safe to run multiple times.
--
-- Usage:
--   psql "$DATABASE_URL" -f database/migrations/add_company_default_bank_fee.sql

ALTER TABLE "Companies" ADD COLUMN IF NOT EXISTS "DefaultBankFeeCents" INT NULL;
