# Migrations ledger

Running counter for database migrations. The `.sql` files in this folder are run
manually against Neon and are committed to git alongside this ledger. This ledger
is the single source of truth for the next migration number.

`database/schema.sql` remains the canonical from-scratch schema and is **not**
derived from these files: it is maintained by hand in parallel and must be updated
to match whatever a migration changes. A migration describes the step; `schema.sql`
describes the destination. Both are kept true.

Until 2026-09-22 migrations were treated as throwaway artefacts, applied by hand
and deleted. Entries 001-005 below predate the ledger and were committed under the
old convention, so their file names do not follow the numbering scheme.

## Convention

- File name: `NNN-kebab-description.sql`, zero-padded 3-digit number.
- Next number = `Last applied` below, plus one. **Re-read this ledger immediately
  before creating the file**: several sessions work this repo at once, and two that
  read the same number will both write it. That collision is the failure mode this
  ledger exists to prevent. `src/__tests__/services/migrations-ledger.test.ts` fails
  on it, on a file with no row, on a row with no file, and on a `Last applied` that
  does not match the highest row — but it runs after the fact, so re-reading first
  is still the habit that avoids the wasted work.
- Add the row when you **write** the migration, not when it is applied, and commit
  the row together with the `.sql`.
- The Description column records **why**, not what. "Add column X" is already
  visible in the diff; what is lost forever is the measurement that motivated the
  change, what was deliberately not done, and whether the migration must be applied
  before the code that depends on it is deployed.
- SQL must be idempotent (`IF NOT EXISTS`, `DO` blocks, guards) so a re-run against
  a populated database is safe.
- Update `database/schema.sql` in the same commit.
- Luis applies migrations himself. Nothing here is ever run against a database
  automatically.
- One-off data repairs are **not** migrations and do not belong in this folder. See
  the note on 004.

## Last applied: 006

| #   | Description | Applied |
|-----|-------------|---------|
| 001 | **Transaction status.** `add_transaction_status.sql`. Adds `Transactions.Status VARCHAR(15) NOT NULL DEFAULT 'paid'` plus `IX_Transactions_Status`, and recreates every summary view to filter `Status = 'paid'`. The default is what makes it non-breaking: existing rows become `paid`, so no backfill and no window where totals read wrong. The point of the column is that `pending` and `cancelled` must disappear from every aggregate — summary views and fiscal reports alike — rather than being flagged in the UI and still counted. Any new view that reads `Transactions` has to carry the same `WHERE` filter or it silently reintroduces the bug. | applied |
| 002 | **Bank fee subcategory.** `add_bank_fee_subcategory.sql`. Seeds a "Comisiones bancarias" subcategory under "Trabajo". Required before the invoice *mark as paid* flow can book an optional bank-transfer fee: without the subcategory the fee has nowhere to land and the flow fails at the point of creating the expense. Seed data, not DDL, but it is a precondition for deployed code, so it ships as a migration rather than as a manual step someone has to remember. | applied |
| 003 | **Per-client default bank fee.** `add_company_default_bank_fee.sql`. Adds `Companies.DefaultBankFeeCents`. Nullable on purpose: absent means "this client has never charged one", which is different from a client whose fee is genuinely zero, and the *mark as paid* form pre-fills only in the first case. Stored in cents like every other monetary value in the schema. | applied |
| 004 | **Stale sync job repair.** `add_cancelled_sync_status.sql`. Not a migration — a one-off `UPDATE` closing a single `CryptoSyncJobs` row (`JobID = 5`) left `running` by a dev restart, marking it `cancelled`. It is recorded here because the file sits in this folder and an unexplained file is worse than a documented mistake. Nothing like it should go here again: a data repair is not reproducible, is not idempotent in any useful sense, and means nothing on a fresh database. | applied |
| 005 | **Crypto module, phase 2.** `add_crypto_module_phase2.sql`. Creates `CryptoSyncJobs` (+ `IX_CryptoSyncJobs_UserStatus`, `IX_CryptoSyncJobs_UserExchange`) and `BinanceRawEvents` (+ `IX_BinanceRawEvents_UserOccurred`, `IX_BinanceRawEvents_TypeOccurred`) for raw event ingestion and sync job tracking. Forward-only and explicitly non-destructive: it drops and recreates nothing, so it is safe against a populated database. Raw events are kept verbatim rather than normalised on the way in, so a change to the FIFO or Modelo 100 logic can be replayed against the original exchange payload instead of requiring a re-download. **Superseded in part:** the multi-exchange work renames `BinanceRawEvents` to `CryptoRawEvents` with a `Source` column. When that lands it needs its own migration — do not edit this file. | applied |
| 006 | **Exit altitude to feet.** `006-convert-exit-altitude-to-feet.sql`. `ExitAltitudeFt` is named for feet and rendered as feet, but 1.144 of the 1.174 jumps held metres: the form asked for "Altitud de salida (m)" until 2026-09-22, so every altitude entered before then was off by a factor of 3.28 on screen. The two populations do not overlap — metres max at 5.174, feet start at 12.645, nothing in between — so a threshold of 8.000 splits them without ambiguity. Idempotency is guarded on the **mean**, not on a value range: the lowest metre value (a 1.574 m hop-n-pop) converts to 5.164 ft and would be caught again by any range guard. **991 of the converted rows held exactly 4000**, a constant from the original bulk import rather than a measurement; they become 13123 and will read as precise when only ~138 of the converted values were ever individually recorded. Converting them was a deliberate choice so the column carries one unit throughout. Paired with the UI change that shows both units, since the logbook was read in metres for years. | **pending** |

> Entries 001-005 predate this ledger. Their file names keep the old
> `add_*.sql` form; renaming them would rewrite committed history for no
> benefit, since all five are already applied and their DDL is reflected in
> `database/schema.sql`. Every migration from 006 onward uses `NNN-kebab.sql`.
