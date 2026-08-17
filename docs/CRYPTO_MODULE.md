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
  bar never needs to count rows.
- A successful sync auto-triggers normalisation; `POST /api/crypto/normalize` is the manual escape
  hatch and processes only un-normalised events.
- `GET /api/cron/crypto-sync` runs weekly (Monday 05:00 UTC, see `vercel.json`), authenticated by
  `Authorization: Bearer ${CRON_SECRET}`. It runs without a session and skips users with a job
  already in flight.

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

---

## Related documentation

- [FISCAL_DOMAIN.md](FISCAL_DOMAIN.md) — the professional-activity side of the same Renta
- [DATA_MODELS.md](DATA_MODELS.md) — table definitions
- [ARCHITECTURE.md](ARCHITECTURE.md) — where the module sits in the app
