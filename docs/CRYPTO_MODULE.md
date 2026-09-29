# Crypto Module

Exchange ingestion, normalisation and FIFO cost-basis accounting for the Spanish Modelo 100.

The module answers one question: **what does the taxpayer owe on crypto this year, and can it be
justified line by line if AEAT asks?** Everything else — the charts, the movement tables, the
position panel — is built on the same data because it was already there.

---

## The pipeline

Data moves in one direction through five stages. Each stage is idempotent and can be re-run
without corrupting the next.

```
   Exchange API              CSV upload
   (Binance only)      (Binance/Kraken/Coinbase)
          │                       │
          └───────────┬───────────┘
                      ▼
            ┌───────────────────┐   verbatim upstream JSON, never edited
            │  CryptoRawEvents  │   idempotent by (UserID, EventType, ExternalID)
            └───────────────────┘
                      │  NormalizationService  +  PriceService (EUR resolution)
                      ▼
            ┌───────────────────┐   one raw event → 0, 1 or N legs
            │   TaxableEvents   │   idempotent by (RawEventID, Kind, Asset)
            └───────────────────┘
                      │  fifo.ts — needs the FULL history, all years
                      ▼
            ┌───────────────────┐   cost basis + gain/loss per disposal
            │  CryptoDisposals  │   idempotent by (TaxableEventID, FiscalYear)
            └───────────────────┘
                      │
                      ▼
              Modelo 100 boxes
        1804-F · 1804-N · 0304 · 0033
```

**Why raw events are kept verbatim.** `RawPayload` is the exact JSON the exchange returned (or a
synthetic equivalent for CSV rows). It exists so the whole pipeline downstream can be recomputed
when the rules change — and they have changed: transfer_in cost basis, stablecoin classification,
normaliser fixes. Re-normalising is always preferable to patching a derived row.

---

## Ingestion

Two paths, one destination.

**Exchange API.** Binance only. Credentials are validated as read-only before anything is stored,
and the sync runs as a background job so the request returns immediately.

**CSV upload.** Binance, Kraken and Coinbase, through a registry seam:

```ts
export interface ExchangeCsvImporter {
  readonly exchange: CryptoExchange;
  detect(headerLine: string, filename: string): boolean;   // sniff ownership
  import(text: string, filename: string): CsvImportResult; // → RawEventInput[]
}
```

**To add an exchange:** implement `ExchangeCsvImporter` in its own module under
`src/services/exchanges/<name>/` and append the instance to `IMPORTERS` in
`src/services/exchanges/shared/index.ts`. No other wiring. Detection is first-match-wins, so keep
narrow header signatures ahead of broad ones — Coinbase is last because its `detect()` also matches
on filename, for exports that carry a preamble before the header.

Each row is stamped with `Source`, so a mixed history stays attributable per exchange.

**Binance CSV: pairing the spot rows of one second.** A spot fill arrives as two or three rows with
the same timestamp (coin bought, coin given, optional fee), and one second can hold several fills
across several coin pairs. No row says which row it traded against; the only hard rule is that a
fill never has the same coin on both sides. `pairSpotFills` (`binance/CsvImporter.ts`) takes the
pairing that keeps the most rows and, among those, the one where each bought row in file order
holds the earliest given row that still allows it, since Binance lists a trade's rows in the same
order on both sides. Simply taking the first free row of another coin strands rows: ETH bought
with BTC and BTC bought with USDT, listed USDT first, pairs ETH with USDT and leaves both BTC rows
out, so that BTC purchase never reaches FIFO. Whenever first-free pairing does keep every row it
can, it is exactly the pairing chosen, so the rule changes nothing for those groups. The search is
exhaustive up to 8 rows per side; above that first-free pairing is used as it is (measured
29-sep-2026: at most ~63,000 search states over 15,000 random 8 + 8 groups, seconds at 12 + 12).
A single coin pair with unequal row counts is summed into one fill instead.

A tie is still a guess: ETH and SOL bought against BTC and USDT in one second pair either way with
every row used, and only row order decides.

**Re-importing a Binance CSV that is already stored.** Imports made before 29-sep-2026 kept one
spot event per second: the first bought row with the first given row, whatever their coins. A
second's first fill keeps that ExternalID as long as it still pairs those two rows, so a re-import
only adds the later fills (`-1`, `-2`…). Where the first bought row now pairs with another row, or
with none —
the ETH example above, or a stored event that paired a coin with itself — the stored event was
wrong and the corrected fills arrive under new ids beside it, since `ON CONFLICT DO NOTHING` keeps
the old one: the bought coin counts twice. The wrong ones are the stored `csv-spot-…` events at a
second that the new import does not produce. Delete those `CryptoRawEvents` rows first (the cascade
takes their `TaxableEvents` and `CryptoDisposals`), then re-import, normalise and recompute FIFO.
A single coin pair with unequal row counts is the opposite trap: the summed fill keeps the old id,
so the stored partial quantity survives the re-import unless its row is deleted too.

**Cross-source dedup.** One operation can reach `CryptoRawEvents` under two ExternalIDs: from a CSV
and from the API, or from two overlapping CSV exports (a Binance spot fill's id depends on its
position inside its second, so an export that lists a second's fills in another order gives them
new ids). Both paths run their events through `dropCrossSourceDuplicates`
(`CryptoRawEventsRepository.ts`) before the insert, against an index of everything the user has
stored, loaded once per CSV upload or sync job. An event matches a stored row on type (the reward
types count as one), asset, side, time (exact second; same UTC day for deposit/withdraw) and amount
(a withdrawal also by its gross); a spot fill also on second and market, filed under both coin
orders because a CSV writes the acquired coin first.

Matching is **one-to-one**: a stored row absorbs at most one event and is then used up. Until
29-sep-2026 an event was dropped when any stored row matched, so two real API fills of one second,
side and size were both dropped against the one a CSV held; and CSV events were not compared with
stored CSV rows at all, so a reordered overlapping export stored its fills twice.

- A CSV event may pair with any stored row; an API event with CSV rows only. Two alike API fills
  are two trades with two ids, and the UNIQUE key already absorbs a re-fetch.
- An event whose `EventType` + ExternalID is already stored claims that row before any amount is
  compared, and is kept for `ON CONFLICT DO NOTHING` to absorb (the CSV upload reports it as
  `eventsDuplicate`, not as cross-source). Otherwise a re-fetched API deposit could use up the CSV
  row of another deposit of the same day and amount, and that other deposit would be stored twice.
- An event met again in the same job (a later task returns the same id) gets the answer it got
  the first time and uses up nothing.
- A kept event is not added to the index: two alike events of one file are two fills.
- An API reward that is stored under its earlier position-based id is dropped, and uses that row up.

Only amounts are compared. When one second holds fills of equal size at different prices and only
some of them are stored, which stored row stands for which new event is a guess: the count comes
out right, but the fill kept may carry the other fill's price.

The index is one scan of the user's rows per job. It reads each identity key as its own `->`
column, which costs about half of `jsonb_each` or `jsonb_build_object` (measured on 100k spot
payloads, local PostgreSQL 17, 29-sep-2026), plus every row's ExternalID for the claim above. A
reward's full payload is sent only when its ExternalID is not in today's format
(`CURRENT_REWARD_ID_PATTERN` in `rewardExternalId.ts`), since only those can be stored under an
earlier id. Every reward stored before the deploy of 29-sep-2026 has a position-based id and is
still sent; rewards stored since are not.

---

## Normalisation

`NormalizationService` turns raw events into fiscally meaningful legs. One raw event may produce
several: a spot trade BTC→USDT is a **disposal** of BTC *and* an **acquisition** of USDT, which is
why the idempotency key is `(RawEventID, Kind, Asset)` rather than the raw event alone.

Kinds: `disposal`, `acquisition`, `airdrop`, `staking_reward`, `transfer_in`, `transfer_out`.

**EUR resolution.** Every leg needs a EUR value at the moment it occurred. `PriceService` resolves
it through a cascade and records which branch produced it in `PriceSource`: `binance_eur` →
`binance_usdt_cross` → `coingecko` → `stablecoin`. Results land in `CryptoPriceCache`, keyed by
`(Asset, DateUtc)` and immutable once written — the same price must not drift between two
normaliser passes.

Prices are stored twice: `EurPriceCents` and `EurPriceMicroCents` (cents × 1e6). Sub-cent tokens
like SHIB or PEPE quantise to zero in plain cents before they are ever multiplied by a quantity.

**Contraprestación (F/N)** classifies what a disposal was exchanged for — **F** for fiat, **N** for
another crypto asset. AEAT reports the two separately, and the split is carried all the way to
casilla 1804.

---

## FIFO

`src/utils/crypto/fifo.ts`. Spain requires FIFO for homogeneous assets, so the matcher consumes the
oldest lots first and needs the **entire history across all years** — never just the year being
filed.

| Event kind | Effect on the queue |
|------------|---------------------|
| `acquisition`, `airdrop`, `staking_reward` | Push a lot at `GrossValueEurCents`, fee allocated proportionally |
| `transfer_in` | Push a lot at fair market value at receipt |
| `disposal` | Consume lots from the head until the quantity is covered |
| `transfer_out` | No-op — audit only |

**`transfer_in` uses FMV as a proxy** because the original cost basis in the sending wallet is
unknown. AEAT accepts a reasonable proxy; without it, externally funded coins would dispose against
an empty queue and be taxed as 100% gain.

**Incomplete coverage is flagged, not dropped.** When an asset has fewer lots than a disposal needs
— a data gap, a partial sync — the missing portion takes a zero cost basis and the disposal is
marked `IncompleteCoverage`. A visibly conservative number beats a silently missing one.

`AcquisitionLotsJson` stores the lot-by-lot breakdown behind each disposal. It is the answer to
"which historical lots covered this 0,005 BTC sale?", and it is the reason the export exists.

**`NeedsReview` and `IncompleteCoverage` are written by the FIFO pass**, not derived in SQL — the
TypeScript computation is the truth, and re-deriving it in SQL would mean float comparisons and
TS/SQL drift. They default to `false`, so **rows that predate a recompute under-report until the
recompute runs**.

**Decimals.** Native quantities carry up to 18 decimals and the matcher works in float64. Below
~10⁹ units the error stays under 1e-7, far smaller than the 1-cent rounding applied when converting
to EUR. EUR cents are always `Math.round`ed integers.

---

## Fiscal years are Madrid time, not UTC

`src/utils/crypto/fiscalYear.ts`. AEAT periods are calendar years in **Europe/Madrid** civil time.
Crypto events are UTC instants with a time of day, so a disposal at 2025-01-01 00:30 Madrid is
2024-12-31 23:30 UTC — `getUTCFullYear()` would file it in the wrong year. Always resolve the year
and the year boundaries through these helpers.

---

## Modelo 100 output

`GET /api/crypto/fiscal/modelo100?year=YYYY` returns four boxes:

| Box | Contents |
|-----|----------|
| 1804-F | Disposals against fiat |
| 1804-N | Disposals against another crypto asset |
| 0304 | Airdrops — sum of `GrossValueEurCents` |
| 0033 | Staking / Earn rewards — sum of `GrossValueEurCents` |

It also reports a **needs-review count**: disposals with an unresolved or zero price, a zero-cost
lot, or a `transfer_in` FMV-proxy basis. Those are the rows a human should look at before filing.

`casilla0304UnresolvedCount` and `casilla0033UnresolvedCount` count the airdrops and rewards whose
price could not be resolved and that therefore add 0 € to their box. The section and the AEAT guide
warn next to the box whenever either is above zero: a raw event is normalised once, so those rows are
never valued again on their own.

`GET /api/crypto/fiscal/export?year=YYYY` produces a CSV, one row per disposal, to keep alongside
the Renta Web filing as inspection evidence.

> The crypto Modelo 100 boxes are **separate from** the professional-activity section computed by
> `FiscalRepository.getModelo100Summary()` — see [FISCAL_DOMAIN.md](FISCAL_DOMAIN.md). The two do not
> interact; both are transcribed into Renta Web by hand.

---

## Security

API credentials are encrypted with **AES-256-GCM** under `CRYPTO_MASTER_KEY`. Each blob is stored as
`<iv-base64>.<authTag-base64>.<cipher-base64>` in a single TEXT column, so every encryption carries
its own IV — reusing an IV across two encryptions under the same key defeats GCM's confidentiality
guarantee.

**Keys must be read-only.** `POST /api/crypto/credentials` always calls the exchange to verify
permissions before writing anything; a key with trading or withdrawal rights is rejected with
`UNSAFE_PERMISSIONS`. The status endpoint never returns the secret or the full key — only the masked
last 4 characters and the cached permission snapshot.

`ExchangeApiCallLog` records every outgoing call (endpoint, status, weight, duration) for
rate-limit forensics. Append-only, pruned periodically.

---

## Sync jobs

`CryptoSyncJobs` holds one row per run: `pending → running → completed | failed | cancelled`.

- `POST /api/crypto/sync` returns **201 with the jobId immediately** and runs the ingestion in
  Next.js `after()`. A second job for the same exchange returns **409 `SYNC_ALREADY_RUNNING`** so the
  UI polls the existing one instead of starting a duplicate.
- Cancellation is cooperative: the worker polls `isJobCancelled` between tasks.
- `Progress` is a JSONB map `{ endpoint: { fetched, totalWindows, lastWindowEnd } }`, so the progress
  bar never needs to count rows. An endpoint whose fetched events the cross-source filter dropped as
  already stored by a CSV also carries `duplicatesSkipped` (also in the `CRYPTO_SYNC_DEBUG` endpoint
  line), so an event dropped by mistake leaves a trace instead of vanishing.
- A successful sync auto-triggers normalisation; `POST /api/crypto/normalize` is the manual escape
  hatch and processes only un-normalised events.
- `GET /api/cron/crypto-sync` runs weekly (Monday 05:00 UTC, see `vercel.json`), authenticated by
  `Authorization: Bearer ${CRON_SECRET}`. It runs without a session and skips users with a job
  already in flight.

### How a failed task decides the job

An incremental sync, manual or from the cron, starts at the last **completed** job's `FinishedAt`
minus 24 h (`computeSyncScope`). So the job's final status is what decides whether a missed window
is ever fetched again. A task that fails does not stop the others; `classifyTaskFailure`
(`BinanceClient.ts`) sorts each failure into one of four kinds:

| Kind | Failures | The job ends |
|------|----------|--------------|
| Fatal | `INVALID_SIGNATURE` | `failed` at once |
| Transient | network errors, 5xx, 429/418 still limited after the retries, any Binance code not listed below, `task_failed`, `insert_failed`, `trade_without_id` (a `myTrades` fill with no numeric id: a malformed answer) | `failed`: the anchor stays, so the next run fetches the same windows again |
| Resumable | `history_resumes_next_run`: a spot walk hit the page cap, stored at least one of its fills, and the next incremental sync continues after them | `completed`, with the gaps recorded |
| Permanent | `history_truncated` (a spot walk hit the page cap and no run will continue it: it stopped below fills already stored, or a CSV already held every fill it walked, see below); `endpoint_not_permitted` (Binance `-2015` on a task) | `completed`, with the gaps recorded |

**Why permanent and resumable failures complete the job.** A failure the next run would repeat
identically kept the job `failed` forever, the anchor never moved, and every weekly run re-fetched
a growing window only to fail again. A resumable one does not need the anchor either: the spot walk
resumes from the stored trade ids. A job whose only failures are of these two kinds completes with
`ErrorCode = completed_with_gaps`, the failure summary in `ErrorMessage`, and a
`permanentFailures` or `resumableFailures` list (`[{ code, count, symbols }]`) in that endpoint's
`Progress` entry. The sync panel shows the permanent gaps as a warning naming the spot pairs and
endpoints to import by CSV, and the resumable ones under their own heading, saying the next
incremental sync keeps fetching them. A job with **any** transient failure still ends `failed` and
lists every failure; the permanent and resumable ones also go to `Progress` so the panel says
which ones a retry will not fill and which ones the next sync continues.

**Why `-2015` counts, and nothing else does.** The Binance SDK documents `-2015` in its own error
enum as *"Invalid API-key, IP, or permissions for action."* The key and IP causes are ruled out by
context, not by the code: spot discovery calls `GET /api/v3/account` with the same key before any
task runs, and a job with `-2015` failures asks it again at the end (`isKeyAccepted`). If that
second call fails, the key may have been revoked or the IP whitelist changed mid-job, and the
`-2015` failures count as transient. The HTTP status cannot help: the SDK rethrows Binance errors
as `{ code, message, body }` with no status, so only the Binance code in the body tells them apart.
Codes Binance may use for "not available for this account" that neither the SDK nor this code
documents are left transient on purpose. The failure summary carries each Binance code
(`deposit/api-error.crypto.exchange-unavailable (binance -1000) ×3`), so a new permanent one can be added from evidence.

### Spot trades resume from the newest stored fill

`myTrades` pages by trade id (`fromId`), not by time. Walking a busy pair from `fromId = 0` on
every run hit the 100-page cap (`history_truncated`) on every incremental run, even for a week of
new fills. An incremental sync now reads, in **one query per job** (`loadLastApiTradeIds`), the
highest trade id stored per symbol **by the API**. It excludes CSV rows (`csvSource`): their
payload has no Binance trade id, and an id from another sequence would make the walk skip real
fills. Each pair with a stored id walks forward from that id + 1 until a short page or the page
that passes `scopeTo`. Every fill after the stored one is kept, even one older than `scopeFrom`: it
was never stored, and dropping it would leave a hole the next run starts after. A pair with no
stored id keeps the recent-page strategy described in `fetchSpotTrades`.

A **full** sync always walks from `fromId = 0`: it is how a hole below the newest stored fill gets
filled.

**A walk that reaches the page cap stores what it walked.** It used to throw the pages away, and
since CSV rows never move the resume point, the pair walked the same pages into the same cap on
every run, for good. The walk now fails with `SpotHistoryTruncatedError`, which carries every fill
it walked: all of the pair's fills from the walk's start id to its last page, in id order and with
no hole, since each page starts right after the newest fill of the one before. Fills older than
`scopeFrom` are kept, as in the resume above: a prefix cut at `scopeFrom` could be empty and leave
the pair stuck. The recent page that a walk from `fromId = 0` starts from is left out: storing it
would move the resume point past the fills in between. The sync stores the walked fills through the
same cross-source filter and insert as any other events, and the pair's next incremental run
resumes after the newest of them, 100 pages further on each run (`history_resumes_next_run`).

That is only true when the walk reaches the fills already stored. A full sync walks from
`fromId = 0` and can stop below fills an earlier run stored, such as the newest page every API sync
stored before 2026-09-29 (next paragraph). The next incremental run then resumes above those, and
no run fetches the fills in between, so `confirmResumableWalk` (`BinanceSyncService.ts`) reports
that gap as permanent `history_truncated`, to be imported by CSV. The walked fills are stored
either way.

It is also only true when the walk stored something. The resume point is the newest fill stored
**by the API**, and the walked fills go through the cross-source filter first: when a CSV import
already holds every one of them, nothing is inserted, the resume point does not move, and each run
walks the same 100 pages into the same cap. So the gap is resumable only if the task inserted at
least one fill, and permanent `history_truncated` otherwise; the fills after those 100 pages have
to come from a CSV. A failed insert keeps it resumable: that failure is transient, fails the job,
and the next run stores the same fills.

**One full sync per user is required after the deploy of 2026-09-29.** Until then `fetchSpotTrades`
stepped back with `fromId = oldestId - 1000`, which lands inside the same recent page, so every
earlier API sync stored at most the newest ~1000 fills per pair. Incremental syncs, the cron
included, now resume after the highest stored id and will never revisit what lies below it; only a
full sync does. Run it once, then recompute FIFO.

Every pair with stored API fills is also a spot candidate in **both** modes, on top of the three
discovery sources. Once a coin is sold off it has no balance, no reward or transfer and may not be
in the top-40 fallback, so without this its later fills, the sale among them, were never fetched.

### A CSV upload is never the incremental anchor

A CSV upload creates a completed `CryptoSyncJobs` row for the same exchange so it shows in the
history, stamped with the `csv-import` progress key (`CRYPTO_CSV_IMPORT_PROGRESS_KEY`). The
anchor lookup (`getLastCompletedJobForUser`, used by the manual sync and the cron) skips those
rows: a CSV only covers what its file holds, and anchoring on it made the next API sync skip every
window between the previous API sync and the upload. An account that only ever uploaded CSVs has
no anchor, so its first API sync starts from the default scope.

---

## Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST / DELETE | `/api/crypto/credentials` | Store (validated read-only) or soft-delete exchange keys |
| GET | `/api/crypto/credentials/status` | Connection state, masked key, cached permissions |
| POST | `/api/crypto/sync` | Start a background sync (201 + jobId; 409 if one is running) |
| GET | `/api/crypto/sync/[jobId]` | Poll job status and progress |
| POST | `/api/crypto/sync/[jobId]/cancel` | Request cancellation |
| POST | `/api/crypto/import/csv` | Multipart CSV upload; exchange auto-detected if not given |
| POST | `/api/crypto/normalize` | Run the normaliser over un-normalised raw events |
| GET | `/api/crypto/events` | Paginated raw movements (`?type&from&to&asset&page`) |
| GET | `/api/crypto/taxable-events` | Paginated normalised legs (`?kind&from&to&page`) |
| GET | `/api/crypto/assets` | Distinct assets the user has touched (filter dropdown) |
| GET | `/api/crypto/pairs` | One summary per traded spot pair |
| GET | `/api/crypto/pairs/[symbol]` | Full position: trades + native-quote FIFO P&L + EUR figures |
| GET | `/api/crypto/klines` | OHLC candles (public Binance data, no credentials) |
| GET | `/api/crypto/ticker` | Live spot price + base-asset EUR price |
| GET | `/api/crypto/fiscal/modelo100` | The four Modelo 100 boxes + needs-review count |
| GET | `/api/crypto/fiscal/disposals` | Paginated FIFO disposals with their lot breakdown |
| GET | `/api/crypto/fiscal/export` | CSV of every disposal in a fiscal year |
| POST | `/api/crypto/fiscal/recompute` | Re-run FIFO for one year, or every year with data (default) |
| GET | `/api/cron/crypto-sync` | Vercel Cron: weekly incremental sync for all active credentials |

**Recompute defaults to all years** because most rule changes propagate cost basis forward: a
correction to a 2021 acquisition changes every disposal after it.

---

## Key files

| Path | Role |
|------|------|
| `src/services/exchanges/shared/` | The importer contract and registry |
| `src/services/exchanges/{binance,kraken,coinbase}/` | Per-exchange clients and CSV importers |
| `src/services/exchanges/binance/NormalizationService.ts` | Raw events → taxable events |
| `src/services/exchanges/binance/PriceService.ts` | EUR resolution cascade + cache |
| `src/utils/crypto/fifo.ts` | Lot matching, cost basis, gain/loss |
| `src/utils/crypto/fiscalYear.ts` | Madrid-time year boundaries |
| `src/utils/crypto/pairPnl.ts` | Native-quote P&L for the position panel |
| `src/utils/cryptoSecrets.ts` | AES-256-GCM encrypt/decrypt |
| `src/services/database/Crypto*Repository.ts`, `TaxableEventsRepository.ts` | Persistence |
| `src/components/crypto/` | Sync panel, CSV uploader, movement/disposal tables, chart, AEAT guide |

---

## Invariants

| Invariant | Why |
|-----------|-----|
| `RawPayload` is never edited | It is the evidence, and the only thing a re-normalisation can rebuild from |
| Idempotency keys stay as they are | `(UserID, EventType, ExternalID)`, `(RawEventID, Kind, Asset)`, `(TaxableEventID, FiscalYear)` — each allows a re-run to insert zero duplicates |
| `CryptoPriceCache` rows are immutable | A price that changes between passes changes past filings |
| FIFO reads all years, never one | Cost basis depends on the full lot history |
| Fiscal years resolve in Europe/Madrid | UTC files December 31st events in the wrong year |
| Review flags come from the FIFO pass | SQL re-derivation means float comparisons and drift |
| Credentials are read-only and encrypted per-row with a fresh IV | A trading-capable key in the database is a liability, and IV reuse breaks GCM |
| A sync job completes only if every task failure is permanent | Incremental syncs anchor on the last completed job: completing over a transient failure skips its windows for good, and failing over a permanent one freezes the anchor for good |

---

## Related documentation

- [FISCAL_DOMAIN.md](FISCAL_DOMAIN.md) — the professional-activity side of the same Renta
- [DATA_MODELS.md](DATA_MODELS.md) — table definitions
- [ARCHITECTURE.md](ARCHITECTURE.md) — where the module sits in the app
