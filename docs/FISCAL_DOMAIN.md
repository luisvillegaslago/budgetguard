# Fiscal Domain

The tax rules BudgetGuard encodes, and why the code looks the way it does.

The other documents describe *what* the fiscal module is: its tables, its types, its endpoints.
This one describes the *domain* those things model. Read it before changing anything under
`src/utils/fiscal*.ts`, `src/utils/irpf.ts`, `src/services/database/FiscalRepository.ts` or the
`vw_Fiscal*` views — every rule below was reached by reconciling the app against real filed
modelos, and most of them have already been broken once.

**Scope.** One Spanish self-employed taxpayer (*autónomo*) in **estimación directa simplificada**,
resident in Madrid, whose professional income is invoiced. Everything here assumes that regime.
The app does not implement módulos, recargo de equivalencia, IVA de caja, intracomunitario or any
regional scale other than Madrid's.

**This is not tax advice, and the app is not a filing tool.** It computes the figures the user
types into AEAT's own forms. When a computed figure and a filed modelo disagree, the filed modelo
is what the Treasury has on record — the app's job is to make the disagreement visible, never to
overwrite it.

---

## Table of contents

- [Ground rules](#ground-rules)
- [Devengo vs. caja](#devengo-vs-caja-the-single-most-important-rule)
- [What counts as fiscal](#what-counts-as-fiscal)
- [Modelo 303 — IVA](#modelo-303--iva)
- [IVA a compensar: the pool](#iva-a-compensar-the-pool)
- [Modelo 130 — IRPF pago fraccionado](#modelo-130--irpf-pago-fraccionado)
- [Modelo 390 — annual IVA](#modelo-390--annual-iva)
- [Modelo 100 — Renta](#modelo-100--renta)
- [Amortización del inmovilizado](#amortización-del-inmovilizado)
- [The IRPF provision](#the-irpf-provision)
- [Pension contributions](#pension-contributions)
- [Deadlines](#deadlines)
- [Invariants](#invariants-what-breaks-if-you-change-this)
- [Known gaps](#known-gaps)
- [Legal references](#legal-references)

---

## Ground rules

**Money is integer cents, everywhere.** Not just to avoid float drift: the same `Math.round()`
runs in the repository and in the component, so a figure never differs between the API response
and the screen. Aggregation happens in TypeScript rather than in SQL for the same reason — the
views expose rows, not sums.

**Casilla numbers are the vocabulary.** Every summary field is named after the AEAT box it fills
(`casilla07Cents`, `casilla0224Cents`). A user comparing the screen against a filed PDF should not
have to translate. Do not rename these to friendlier terms.

**A filed modelo outranks a recomputation.** Where the app knows what was actually presented — via
`FiscalDocuments` — that figure wins, and the recomputation is only a fallback. Every place this
happens exposes an `…IsEstimated` flag so the UI can say which one it used.

---

## Devengo vs. caja: the single most important rule

Spanish IRPF and IVA are settled on the **fecha de devengo**. An invoice belongs to the quarter it
was *issued* in, not the quarter it was *collected* in.

BudgetGuard creates an income transaction when an invoice is marked paid, dated on the collection
day. That transaction is on a **cash basis** and is wrong for every tax model.

This is what the two views are for:

| View | Basis | Who may read it |
|------|-------|-----------------|
| `vw_FiscalQuarterly` | Cash — books each transaction on its `TransactionDate` | Nothing fiscal. Only non-fiscal reporting |
| `vw_FiscalAccrual` | Accrual — drops the payment transactions of issued invoices and re-adds each invoice on its `InvoiceDate` | **Every** fiscal model |

`FiscalRepository.loadFiscalRows()` is the only door in, and it reads the accrual view. If a new
fiscal computation queries `vw_FiscalQuarterly` directly, it is wrong even when the numbers look
plausible — they only diverge for invoices whose issue and collection dates cross a quarter
boundary.

> This is not hypothetical. An invoice issued in June and collected in July forced a *rectificativa*
> of the 2T 2026 303. The accrual view produces the corrected casilla 120 exactly; the cash view
> produces the figure that had to be rectified.

---

## What counts as fiscal

`vw_FiscalQuarterly` filters income and expenses asymmetrically, and the asymmetry is load-bearing:

- **All paid income enters the view.** Whether it is *professional* income is decided later, by
  `isProfessionalIncome()`: `Type = 'income'` **and** `ParentCategoryName = 'Facturas'`
  (`PROFESSIONAL_INCOME_CATEGORY`). Income outside that category is surfaced as
  `FiscalReport.uncountedIncome` rather than dropped, so a miscategorised invoice is visible
  instead of silently missing from the 130 and the 100.
- **An expense enters only once it is coded** — it carries a `VatPercent`, a `DeductionPercent` or
  an `InvoiceNumber`. Everything else is private spending.

An earlier version inferred the income side the same way as the expense side, requiring fiscal
coding on both. That erased every 2023 invoice — 44.954,00 €, imported without VAT data — from the
130, the 390 and the 100 of that year. Do not make this filter symmetric.

---

## Modelo 303 — IVA

Quarterly, and **not** cumulative: each quarter stands alone.

| Casilla | Meaning | Source |
|---------|---------|--------|
| 07 | Base imponible, operaciones interiores | Professional income with `VatPercent > 0` |
| 09 | Cuota IVA devengado | VAT on the above |
| 27 | Total IVA devengado | = 09 |
| 28 | Base de las deducciones | Deductible base of coded expenses |
| 29 | Cuota IVA deducible | Deductible VAT of those expenses |
| 45 | Total IVA deducible | = 29 |
| 120 | No sujetas por reglas de localización | Professional income with `VatPercent = 0` |
| 110 | IVA a compensar de periodos anteriores | The pool, carried in |
| 87 | Resultado a compensar en periodos posteriores | The pool, carried out |

The result is `27 − 45`. Negative means *a compensar*.

**Casilla 120 exists because the clients are abroad.** A service invoiced to a business outside
Spain is *no sujeta* by the localisation rules of art. 69 LIVA: no output VAT is charged, but the
base is still declared. The practical consequence is the next section.

## IVA a compensar: the pool

With no output VAT, input VAT never gets offset against anything. It accumulates.

`rollVatPoolCents(opening, quarterResults)` walks the year: a negative quarter adds its excess to
the pool, a positive one settles against the pool first and only the remainder is paid. The pool
never goes below zero.

Two things about this deserve care:

**The opening balance is stored, not computed.** `FiscalProfiles.VatPoolOpeningCents` is seeded
from casilla 110 of the year's first filed 303. Recomputing it from the app's own history would
disagree with AEAT's registry the moment a quarter was filed with incomplete data — and a refund is
paid against *their* figure, not the app's.

**Compensation quotas expire after four years** (art. 99.5 LIVA). If the pool is not consumed
within four years of the quarter that generated it, that amount is lost, and the only way to
recover it is to request the refund (*devolución*) in the fourth-quarter 303 — casilla 62/64, once
a year, only in that quarter.

`vatPoolIsStranded` flags the situation where this is not a risk but a certainty: no output VAT in
the whole year, so the pool can only grow. The UI prompts for the refund when it is set.

> Verified against real filings: the amounts that vanished from this user's 2025-2026 pool match
> the 2021-2022 quarterly results one for one, five out of five. 139,15 € had already expired
> unnoticed.

---

## Modelo 130 — IRPF pago fraccionado

Quarterly but **cumulative from 1 January**: each filing restates the year to date and subtracts
what was already settled. `computeModelo130Series()` therefore always computes quarters 1..N even
when only quarter N is displayed.

| Casilla | Meaning |
|---------|---------|
| 01 | Ingresos acumulados |
| 02 | Gastos acumulados (documented + 5% difícil justificación) |
| 03 | Rendimiento (01 − 02) |
| 04 | 20% of 03 |
| 05 | Sum of the **positive** casillas 07 of earlier quarters |
| 06 | Retenciones practised by clients this year |
| 07 | To pay: `max(0, 04 − 05 − 06)` |

**Gastos de difícil justificación** (art. 30 RIRPF): a flat 5% of `ingresos − gastos documentados`,
capped at **2.000 €/year**. `calcGastosDificilCents()`. It is computed on the cumulative figure, so
the cap applies across the year rather than per quarter.

**Casilla 05 is seeded from what was filed.** `settledAmountCents()` takes the amount from
`FiscalDocuments` when the quarter's modelo was recorded, and only falls back to the recomputation
otherwise. The box means *money already paid*; a recomputation that drifts by a cent propagates
through every remaining quarter of the year. `casilla5IsEstimated` tells the UI when a fallback was
used.

Only **positive** amounts count — the form says "suma de los importes positivos de la casilla 07",
so a quarter that came out negative contributes nothing.

**Casilla 06 matters more than it looks.** IRPF withheld by Spanish business clients
(`IRPF_RETENTION_RATE`: 15% general, 7% reduced during the first three years) is already in the
Treasury, so it reduces what is due. Foreign clients and private individuals never withhold.

---

## Modelo 390 — annual IVA

An informative annual summary of the four 303s. Most boxes are plain sums.

The one that is not is the *a compensar* split:

- **Casilla 97** carries **only the last period's own result** — the form is explicit: "si el
  resultado de la autoliquidación del último periodo es a compensar". This is the figure AEAT
  reconciles against the 4T 303.
- **Casilla 662** carries the amounts generated in the *other* quarters.

Putting the annual aggregate in 97 — which this code did — mismatches the 4T 303 by the whole of
the rest of the year, and that mismatch is exactly what triggers a requerimiento.

---

## Modelo 100 — Renta

The app fills only the **economic activities** section (estimación directa simplificada); the rest
of the declaration is completed in Renta Web.

Income and expense totals mirror the 130's annual position (casillas 0171/0180/0218/0221/0222/0223,
rendimiento neto in 0224). The extra work is `gastosPorCasilla`: each expense category must land in
the right AEAT expense box.

`MODELO_100_CASILLA` holds **every** expense box of the official form, and a category may only be
assigned one of them. `C0202` (*otros servicios exteriores*) is the fallback for a category with
none, and `Modelo100Section.unmappedCents` reports how much the fallback absorbed — without it, an
unmapped category and a deliberate 0202 produce an identical row.

**Box numbers change between campaigns, and boxes get added.** The invariant that catches an
invented box is the definition of casilla 218, which on the ejercicio 2023 form reads:

```
Suma ([0181] a [0195] + [0198] a [0200] + [0202] + [0203] + [0205] + [0206] + [0208] +
      [0227] + [0214] a [0217])
```

A code outside every summed range is not a deductible-expense box, and
`modelo100-category-map.test.ts` checks membership rather than restating the constant.

**But that form is not the whole answer.** It has no 0196, and the filed Renta of **ejercicio 2025
does** — "Regularización cuotas RETA (si resulta cantidad a ingresar)", 376,44 €, summed into its
casilla 218 along with the other four boxes to the cent. AEAT added it once the RETA
regularisations by real income started arriving. Reading the 2023 form as authoritative for 2025
led to deleting a box that exists and re-filing the RETA regularisation into 0186.

The rule this leaves: **an official form proves what existed in its campaign, never what exists
now.** The authority for a year being filed is a filed modelo of that year. The test's ranges carry
a source comment per entry for exactly this reason.

Note that invoice-derived rows carry `CategoryID = 0`. `getModelo100Summary()` joins `Categories`
with a `LEFT JOIN` for that reason; an `INNER JOIN` makes every invoice disappear.

---

## Amortización del inmovilizado

**An asset is not consumed in the year it is bought.** A laptop bought in November is not a
November expense: it is a cost that the activity consumes over several years, and only the share
that corresponds to each year is deductible in that year (art. 30.2 RIRPF, which sends estimación
directa simplificada to the *tabla de amortización simplificada* of the Orden de 27 de marzo de
1998). The purchase itself is a movement of money; the deduction is a calendar.

Until this module existed BudgetGuard deducted the whole purchase in the purchase year, which is
why casillas 0208 and 0227 of Modelo 100 could never be filled — nothing in the app could produce
a dotación. **It cost money.** A Lenovo Yoga Slim 7 bought on 28-Nov-2025 for 869,00 € IVA
incluida (base 718,18 €) was deducted in full in 2025 instead of the 34,79 € the 34 days of that
year actually earn, and the Renta had to be rectified on 17-Aug-2026.

### The 300 € escape hatch — when an asset *is* a period expense

Art. 12.3.e) LIS allows elementos **nuevos** del inmovilizado **material** whose unit value does
not exceed **300 €** to be freely amortised — that is, expensed in full in the year of purchase —
up to a ceiling of **25.000 €** per tax period. This applies to IRPF in estimación directa through
art. 30.2.1.ª LIRPF.

So a 180 € monitor does not need a `FixedAssets` row: leaving it as an ordinary deductible expense
is the legally correct treatment, not a shortcut. Registering an asset is what you do **above** that
threshold. Three details the exemption does not survive:

- **Unit value, not invoice total.** Ten 180 € monitors on one 1.800 € invoice are ten units of
  180 €, all exempt — until the 25.000 € annual ceiling is reached.
- **New, and material.** Second-hand items and the inmovilizado intangible of casilla 0227 are out.
- **The app does not check any of this.** Nothing warns that a 250 € purchase was registered as an
  asset, or that a 4.000 € one was not. It is a user decision the module records, not enforces.

### The tabla de amortización simplificada

The coefficient is the **maximum**, not a fixed rate: amortising more slowly is legal, amortising
faster is not. Verbatim from the Orden de 27 de marzo de 1998, and encoded in
`AMORTIZATION_GROUP` (`src/constants/finance.ts`), keyed by the grupo number the AEAT itself uses:

| Grupo | Elementos patrimoniales | Coef. lineal máx. | Período máx. (años) |
|-------|-------------------------|-------------------|---------------------|
| 1 | Edificios y otras construcciones | 3% | 68 |
| 2 | Instalaciones, mobiliario, enseres y resto del inmovilizado material | 10% | 20 |
| 3 | Maquinaria | 12% | 18 |
| 4 | Elementos de transporte | 16% | 14 |
| 5 | Equipos para tratamiento de la información y sistemas y programas informáticos | 26% | 10 |
| 6 | Útiles y herramientas | 30% | 8 |
| 7 | Ganado vacuno, porcino, ovino y caprino | 16% | 14 |
| 8 | Ganado equino y frutales no cítricos | 8% | 25 |
| 9 | Frutales cítricos y viñedos | 4% | 50 |
| 10 | Olivar | 2% | 100 |

**The rate is stored on the asset, never re-derived from the group.** Three independent reasons,
any one of which would be enough: the tabla gives a maximum and the taxpayer may choose less; the
ERD doubling below depends on facts the group cannot express; and a rate recomputed at read time
would silently rewrite the dotación of a year that has already been filed. `AmortizationGroup` is
therefore nullable — a custom rate, or libertad de amortización (art. 102 LIS), belongs to no group.

### Amortización acelerada — the ×2 of art. 103 LIS

An *empresa de reducida dimensión* may amortise **elementos nuevos del inmovilizado material** at
up to **twice** the tabla coefficient (art. 103 LIS, `AMORTIZATION.ERD_MULTIPLIER`). It reaches IRPF
through art. 30.2 LIRPF and applies in estimación directa, both modalidades — verified against
AEAT before being encoded, because "simplificada" reads as if it excluded the LIS incentives.

It is **a per-asset decision, never an automatic transformation**: second-hand items and the
intangible of casilla 0227 do not qualify, and the group alone cannot tell new from used. The
validation that follows is the only place the multiplier appears as a rule: with a group declared,
the rate must be `≤ grupo.coefficientPercent × 2`. On a grupo 5 laptop, 52% passes and 60% does not.
`coefficientFitsGroup()` (`src/schemas/fixed-asset.ts`) is exported precisely so the PUT route can
re-run it against the **merged** row — the schema only ever sees the payload, so `{ coefficientPercent: 60 }`
on a stored grupo 5 asset would otherwise slip through with no group to check against.

### How the dotación accrues: days, then the remainder

`src/utils/amortization.ts` is pure and works in calendar days from the **in-service date**, not the
invoice date. Two rules:

- **The first year is prorated by days.** `base × rate × días / (100 × 365)`, inclusive of both
  ends. An asset in service on 28 November earns 34 days of its first year, not a twelfth, not a
  full year.
- **The last year takes the remainder.** Accrual is capped at the base, and each year is computed
  as the *difference of two accrued totals* rather than prorated on its own. That is what makes the
  schedule sum to the base exactly: no year can inherit the rounding drift of the year before it.

**The year is always 365 days, leap years included.** A 366-day year therefore accrues `366/365` of
the nominal coefficient — 0,27% above the tabla's maximum for that one year. It is a deliberate
simplification, not an oversight, and it cannot over-deduct: the accrual is capped at the base, so
whatever a leap year takes early is simply missing from the final year. The total is always the
base. Making each year conform strictly to its own coefficient would be a design change, not a bug
fix, and `amortization.test.ts` asserts the current behaviour literally so it cannot drift by
accident.

The golden case, which is also the regression test:

```
Lenovo Yoga Slim 7 Gen 9 — 869,00 € con IVA 21% → base 718,18 € (71818 cents)
grupo 5 (26%) × 2 (art. 103 LIS) = 52%, en servicio 28-nov-2025

2025 →  34,79 €   (34 días)        restante 683,39 €
2026 → 373,45 €                    restante 309,94 €
2027 → 309,94 €   (el resto)       restante   0,00 €
                 ────────────
                   718,18 €
```

> The 34,79 € of 2025 is the figure filed in casilla 0208 of the rectificativa — that one is
> settled with the Treasury, and 2027 is only ever the remainder. The 2026 figure is the one a
> rounding convention can move: `71818 × 0,52 = 37345,36`, so 373,45 € here, while rounding the
> yearly quota up first gives 373,46 € and leaves 309,93 € for 2027. `amortization.test.ts` pins
> the first reading. Nothing downstream hardcodes it — every model calls
> `amortizationCentsBetween()`, so the convention lives in one file and the models follow it.

### Where the dotación enters the models

It is a deductible expense that **no transaction can carry**, because no money moves.
`getAmortizationCentsForPeriod()` (`FixedAssetRepository`) folds the user's assets over a date range
and returns the total plus the split per casilla; `FiscalRepository` is the only caller.

| Model | Where it lands |
|-------|----------------|
| **Modelo 130** | Inside casilla 02, cumulative from 1 January to the end of the quarter. It also lowers the base the 5% of gastos de difícil justificación is computed on — it is an expense of the year, only one that moved no money |
| **Modelo 100** | Its own row of `gastosPorCasilla`: **0208** inmovilizado material, **0227** intangible. From there into 0218 → 0221 → 0222 → 0223 → 0224 |
| **IRPF provision** | Subtracted straight from the projected rendimiento, **never** run-rated |
| **Modelo 303 / 390** | Nowhere. A dotación carries no IVA; the input VAT was already deducted on the purchase |

`unmappedCents` is deliberately untouched by this: an asset always declares its casilla, so it can
never fall back to 0202.

**Amortization is a calendar, not a run rate.** The IRPF projection extrapolates the year-to-date
figures by elapsed days, and applying that to a dotación would be nonsense — twenty days into
January it would inflate the December figure roughly thirtyfold. `getIrpfProjection()` therefore
keeps `amortizacionCents` out of `ytdExpensesCents` and `projectedExpensesCents` and subtracts the
full-year figure directly.

### The purchase is expense for IVA but not for IRPF

The purchase keeps its own `Transactions` row untouched — the money did leave the account, and the
balance, the summaries and the cash-flow charts are all right about that. What changes is that the
**IRPF** models stop counting it: `getAssetTransactionIds()` returns the `TransactionID` of every
registered asset, and Modelo 130, Modelo 100 and the projection skip those rows. Their cost arrives
as the dotación instead; counting the purchase as well would deduct the same laptop twice.

**Modelo 303 and Modelo 390 do not skip it**, and that asymmetry is the whole point. The input VAT
of an asset is deducted **in full in the quarter of purchase** and is never amortized — amortization
is an IRPF concept, not an IVA one.

This is why the exclusion happens at read time instead of by zeroing the transaction's
`DeductionPercent`, which is the obvious shortcut and is wrong: that single column drives the
deductible VAT as well (see `computeFiscalFields`), so zeroing it silently erases the purchase's
input VAT from the 303 and the 390. On the real Lenovo that would have removed 150,82 € of the
158,74 € in casilla 29 of an already filed 4T 2025 — a 95% hole in a quarter that cannot be
rectified without cost. The audit finding that one `DeductionPercent` drives two legally distinct
percentages is exactly what makes the shortcut unsafe.

`FixedAssets.TransactionID` is therefore load-bearing, not decorative. The FK is `ON DELETE SET NULL`
so that re-importing or correcting the movement never destroys the schedule of a year already filed —
but note that a schedule whose link is lost stops excluding anything, and the purchase silently
becomes deductible again.

---

## The IRPF provision

Modelo 130 pays a flat 20% of the net income. The Renta charges a progressive scale. The difference
arrives as one payment the following June, and the point of this feature is that it should not be a
surprise.

`getIrpfProjection()` composes the pure helpers in `src/utils/irpf.ts`:

1. **Project the year.** `projectAnnualCents()` extrapolates the year-to-date figures by linear
   run-rate, unless the caller supplies an income override. `isProjectionReliable` is false below
   `MIN_PROJECTION_DAYS` (30) — and it depends on **elapsed days only**, never on whether an
   override was given, because the expense side is extrapolated either way.
2. **Net income.** Projected income − projected expenses − gastos de difícil justificación.
3. **Base liquidable.** Net income − the pension reduction (next section). Modelo 130 does *not*
   get this reduction, which is precisely why declaring contributions shrinks the gap.
4. **Apply the scale.** `computeIrpfCents()` runs both halves — `IRPF_STATE_SCALE` and
   `IRPF_REGIONAL_SCALE[madrid]` — and adds them.
5. **Relieve the mínimo personal.** 5.550 € (`MINIMO_PERSONAL_CENTS`) is **not subtracted from the
   base**. It is taxed by the scale and its resulting quota is subtracted from the gross quota, which
   is what makes it always relieve at the lowest brackets. It is capped at the base, so a small base
   pays zero rather than generating a refund.
6. **The gap.** `estimatedIrpfCents − modelo130TotalCents`, plus a monthly figure to set aside.

`modelo130PaidCents` counts only quarters whose filing window has already **closed**
(`settledM130Quarters()` reuses the deadline calculator). A quarter still inside its window is
pending, not paid, and belongs in the deadline calendar instead.

---

## Pension contributions

Contributions to a pension plan reduce the **base imponible general** of the Renta (arts. 51-52
Ley 35/2006). They are neither an expense nor a deducción en cuota, and Modelo 130 ignores them
entirely (art. 110 RIRPF).

No transaction can carry this: it is savings, not income or expense. Hence `FiscalProfiles`, one
row per year.

**Two buckets, never one total**, because each carries its own ceiling:

| Bucket | Ceiling | Applies to |
|--------|---------|------------|
| `PensionIndividualCents` | 1.500 €/year (art. 52.1.b) — the *general* limit, on the total whatever the instrument) | Any plan |
| `PensionEmploymentCents` | +4.250 €/year (art. 52.1.b) 2.º — an *increment*) | Planes de empleo simplificados de trabajadores por cuenta propia only |

A single stored total could not be validated: 5.750 € is legal as 1.500 + 4.250 and illegal as
5.750 in an individual plan alone, and nothing in the number distinguishes them.

`computePensionReductionCents()` applies the caps in the order the law does:

```
min(
  min(individual, 1.500) + employment,          // art. 52.1.b): each bucket vs. its own ceiling
  1.500 + min(employment, 4.250),               //   the absolute ceiling of the pair
  30% of net earnings                           // art. 52.1.a): JOINT cap on the sum
)
```

The 30% is a cap on the **sum**, not on either bucket. An earlier implementation clamped the
1.500 € against the individual bucket alone, which let an individual contribution absorb an
allowance reserved for the self-employed products — and a unit test encoded the bug with an
authoritative-sounding comment. Check the formula against the article, not against the test.

Excess is not lost — art. 52.2 carries it forward five years — but this projection only measures
the current year.

---

## Deadlines

`src/utils/fiscalDeadlines.ts` computes the calendar; `src/utils/workingDays.ts` decides which days
count. **All dates are local**, because a deadline is a calendar day in Spain — reading them in UTC
moves them a day for half the year, which is how 30 January 2027 once read as a Friday.

**Working days.** A deadline landing on a día inhábil runs to the next working day (art. 30.5 Ley
39/2015). `nextWorkingDay()` skips weekends, the nine fixed national holidays, and Jueves and
Viernes Santo — the only movable feasts that can reach a tax deadline, since Easter runs as late as
25 April and the quarterly deadline is the 20th. Regional and municipal holidays are deliberately
out of scope: they would need a table per comunidad per year, and the app only uses this to *explain*
an extension, never to move a reminder later.

Both dates are kept: `nominalEndDate` is what the rule says, `endDate` is where it actually lands.

**Domiciliación.** Filing with the payment direct-debited closes earlier than filing itself: the
**15th** of the month, or **27 January** for the fourth quarter. Taken from AEAT's published
calendar, not derived.

It deliberately does **not** ride the working-day extension. The rule says the domiciliación
deadline moves "con carácter general" by the same days, but each year's calendar is what settles it,
and a future year's is not published. Filing a day early costs nothing; a day late costs a recargo.

**Renta window.** Fixed by an Orden ministerial each campaign and it moves — 3 April in 2023,
2 April in 2024, 8 April in 2025. `RENTA_WINDOWS` holds the published ones; a year past
`LAST_PUBLISHED_RENTA_CAMPAIGN` falls back to the most recent window *and* is flagged
`isWindowConfirmed: false`, so the UI shows it as provisional rather than presenting a guess as a
fact. **Add the new window here every year.**

---

## Invariants (what breaks if you change this)

| Invariant | Enforced by | If broken |
|-----------|-------------|-----------|
| Fiscal models read `vw_FiscalAccrual`, never `vw_FiscalQuarterly` | `loadFiscalRows()` is the only entry point | Invoices crossing a quarter land in the wrong period → rectificativa |
| Issued-invoice statuses match in SQL and TS | `fiscal-accrual-view-contract.test.ts` reads `schema.sql` | Income double-counted or dropped |
| All income enters the view; only coded expenses do | `vw_FiscalQuarterly` WHERE clause | Uncoded invoices vanish from 130/390/100 |
| Casilla 05 prefers the filed amount | `settledAmountCents()` | Drift propagates through the rest of the year |
| Casilla 97 = last period only | `getModelo390Summary()` | 390 mismatches the 4T 303 |
| Every Modelo 100 casilla is one casilla 218 sums | `modelo100-category-map.test.ts` | Expenses filed into a box that does not exist |
| The VAT pool opening is stored, not derived | `FiscalProfiles.VatPoolOpeningCents` | The app's pool diverges from AEAT's registry |
| Pension caps applied per bucket, 30% on the sum | `computePensionReductionCents()` | An illegal reduction is projected |
| `FiscalProfileInput` writes are partial | `COALESCE` in the repository upsert | One card wipes the other's figure |
| Deadlines and working days are computed in local time | `formatDateLocal()`, `workingDays.ts` | Deadlines shift a day |
| Amounts are summed in TypeScript, not SQL | Views expose rows | Backend and frontend round differently |
| An amortization schedule sums to the base, to the cent | Each year is the difference of two capped accruals in `amortizationCentsBetween()` | A cent of the asset is deducted twice, or never — and the last year no longer closes at zero |
| Amortization is a calendar, never a run-rate projection | `getIrpfProjection()` subtracts it outside `projectAnnualCents()` | In January the provision projects a dotación ~30× the real one |
| An asset's purchase is skipped by the IRPF models only | `getAssetTransactionIds()`, applied in Modelo 130/100 and the projection | Skipped nowhere: the asset is deducted twice. Skipped everywhere: its input VAT vanishes from an already filed 303 |
| A dotación is never a `Transactions` row | `FixedAssets` is its own table | The purchase is double-counted and every balance, summary view and cash-flow chart is falsified |
| With a group declared, rate ≤ tabla × 2 | `coefficientFitsGroup()`, re-run by PUT against the merged row | An over-fast rate over-deducts — the exact error this module exists to prevent |

---

## Known gaps

Open items from the fiscal audit, in the order they matter:

1. **036 affectation not declared.** Deducting home-office supplies (art. 30.2.5.ª b LIRPF, 30% of
   the affected share) requires the affectation to be declared in the censo. Until the 036 is filed
   and the real m² share known, those deductions are exposed on inspection.
2. **Modelo 100 casilla map covers only what has been used.** Every category that has ever carried a
   deductible expense is now assigned; the rest are personal categories left unmapped on purpose. A
   new one falls through to `C0202` and is reported in `unmappedCents`, so the gap is visible rather
   than silent.
3. **Amortization is recorded, but not policed.** The schedule, the tabla, the ERD doubling and the
   two Modelo 100 boxes are implemented (§ Amortización del inmovilizado). What is still manual:
   - **The link to the purchase is what prevents the double deduction.** Registering an asset
     without setting `TransactionID` leaves its purchase deductible on the IRPF side as well.
     Nothing warns about it.
   - **The 300 € threshold is not suggested either way.** Nothing flags a 250 € purchase registered
     as an asset, nor a 4.000 € one left as a period expense, nor the 25.000 €/year ceiling of
     art. 12.3.e) LIS.
   - **No bajas.** Selling, scrapping or dis-affecting an asset before its base is exhausted should
     stop the schedule and settle the pending value; today the dotación simply keeps accruing.
   - **No historical assets.** Only what has been registered amortises. Anything bought before this
     module existed was deducted in full in its year and is not restated.
4. **No cross-quarter invoice alert.** An invoice whose issue and collection dates fall in different
   quarters is handled correctly by the accrual view, but nothing warns the user that the two
   periods differ — which is the situation that produced the 2T 2026 rectificativa.
5. **Madrid only.** Adding a comunidad means an entry in `IRPF_REGION` plus its bracket table in
   `IRPF_REGIONAL_SCALE`; nothing else in the code assumes a single region.
6. **Scales are hardcoded per year.** `IRPF_STATE_SCALE`, `IRPF_REGIONAL_SCALE`,
   `MINIMO_PERSONAL_CENTS` and `PENSION_PLAN` hold the 2025-2026 figures. They are not versioned by
   year: projecting an older year applies today's scale.

---

## Legal references

| Topic | Source |
|-------|--------|
| Estimación directa simplificada, gastos de difícil justificación | Art. 30 RIRPF (RD 439/2007) |
| Amortización en estimación directa simplificada; tabla de coeficientes | Art. 30.2 RIRPF; Orden de 27 de marzo de 1998 |
| Elementos nuevos ≤ 300 €/unidad, hasta 25.000 €/año, libremente amortizables | Art. 12.3.e) Ley 27/2014 (LIS), vía art. 30.2.1.ª Ley 35/2006 |
| Libertad de amortización (creación de empleo, I+D, ...) | Art. 102 Ley 27/2014 (LIS) |
| Amortización acelerada ×2, empresas de reducida dimensión | Art. 103 Ley 27/2014 (LIS) |
| Pagos fraccionados ignore pension reductions | Art. 110 RIRPF |
| Pension plan reduction, limits | Arts. 51-52 Ley 35/2006 (IRPF), as worded by Ley 31/2022 |
| Base cannot turn negative through reductions | Art. 50.1 Ley 35/2006 |
| Home-office supplies, 30% of the affected share | Art. 30.2.5.ª b Ley 35/2006 |
| Localisation rules — services to non-resident businesses | Art. 69 Ley 37/1992 (IVA) |
| Deduction of input VAT, affectation | Art. 95 Ley 37/1992; consulta V2554-23; TEAC 6654/2022 |
| Compensation quotas expire after four years | Art. 99.5 Ley 37/1992 |
| A deadline on a día inhábil runs to the next working day | Art. 30.5 Ley 39/2015 |

---

## Related documentation

- [DATA_MODELS.md](DATA_MODELS.md) — the tables, views and TypeScript types named above
- [API_REFERENCE.md](API_REFERENCE.md) — the fiscal endpoints and their payloads
- [ARCHITECTURE.md](ARCHITECTURE.md) — where the fiscal module sits in the app
