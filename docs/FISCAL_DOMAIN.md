# Fiscal Domain

The tax rules BudgetGuard encodes, and why the code looks the way it does.

The other documents describe *what* the fiscal module is: its tables, its types, its endpoints.
This one describes the *domain* those things model. Read it before changing anything under
`src/utils/fiscal*.ts`, `src/utils/irpf.ts`, `src/utils/deferral.ts`, `src/utils/badDebt.ts`,
`src/utils/crossQuarterDeadlineNotes.ts`, `src/services/database/FiscalRepository.ts` or the
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
- [The two deduction shares](#the-two-deduction-shares-irpf-is-not-iva)
- [Modelo 303 — IVA](#modelo-303--iva)
- [IVA a compensar: the pool](#iva-a-compensar-the-pool)
- [Créditos incobrables (art. 80.Cuatro LIVA)](#créditos-incobrables-art-80cuatro-liva)
- [Modelo 130 — IRPF pago fraccionado](#modelo-130--irpf-pago-fraccionado)
- [Modelo 390 — annual IVA](#modelo-390--annual-iva)
- [Modelo 100 — Renta](#modelo-100--renta)
- [Amortización del inmovilizado](#amortización-del-inmovilizado)
- [Aplazamientos y fraccionamientos](#aplazamientos-y-fraccionamientos)
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

> This is not hypothetical. **CREST-01**, 600,00 €, was issued on **15-mar-2026** (1T) and collected
> on **27-abr-2026** (2T). The 2T 2026 303 was filed with **26.475,00 €** in casilla 120; the correct
> figure was **25.875,00 €**, exactly those 600,00 € less. It forced a *rectificativa*. The accrual
> view produces the corrected figure; the cash view produces the one that had to be rectified.

### The cross-quarter alert: it warns a human, it does not fix a number

The figures were never the problem. `vw_FiscalAccrual` had CREST-01 in 1T from the day it was
issued, and every modelo read it from there. What failed is upstream of the code: the person filing
reasoned from the bank statement — *the money came in April, so it goes in 2T* — and overrode a
figure the app had computed correctly. A rule the code obeys and the user does not is still a wrong
filing.

So the alert **warns a human rather than correcting a computation**.
`InvoiceRepository.getCrossQuarterInvoices(year, quarter)` reads `"Invoices"` and the payment
transaction its `TransactionID` points at, resolves both periods with the same `EXTRACT` over the
same two dates the accrual view uses, and returns the rows where the two disagree about the quarter
on screen. It changes no total, fills no casilla, and is an input to nothing. Only `finalized` and
`paid` invoices are considered — `ISSUED_INVOICE_STATUSES`, the pair the accrual view itself uses,
because a draft is declared nowhere.

Anyone who reads this section as evidence of a bug in `vw_FiscalAccrual`, in `loadFiscalRows()` or
in the accrual rule has misread it. There is nothing there to fix.

Four ways the disagreement surfaces. Three are informational and none of them is an error; the
fourth is not about tax at all.

| Case | What it says | Live example |
|------|--------------|--------------|
| `collected-in-another-period` | Declared in this quarter, collected in another. `crossesFiscalYear` marks the worse variant, where the two periods belong to two different *Rentas* | CREST-01 seen from 1T 2026 |
| `issued-not-collected` | Declared in this quarter, no collection on record **and the invoice is still `'finalized'`**. The IVA falls due on issue whether or not the money arrived | DW-09, 1.200,00 €, issued 3-ago-2026, never collected — it is declared in the 3T 303/130 due 20 October 2026 |
| `declared-in-earlier-period` | The money arrived in this quarter, but the invoice was already declared in an earlier one. This is the one that misleads: bank income that no modelo of this quarter counts | CREST-01 seen from 2T 2026 — the same 600,00 € that produced the rectificativa |
| `paid-without-linked-movement` | Declared in this quarter, marked `'paid'`, **no movement linked**. A broken record, not a timing disagreement | An invoice collected before the link existed, or one whose `TransactionID` was lost |

The first and the third are one invoice seen from its two ends, and that is the point: which of the
two misleads depends only on which quarter the user happens to be filing.

**`paid-without-linked-movement` is a data-integrity finding, and the copy has to say so.** It is
decided on `"Invoices"."Status"`: a `'finalized'` invoice with no linked transaction genuinely has
not been paid, while a `'paid'` one with a NULL `TransactionID` *was* collected — only the link to
the movement is gone. Reporting the second as *sin cobro registrado* reads as *aún no cobrada*,
which raises a fiscal alarm over a bookkeeping defect. So the two are separate cases, the paid one
says *cobrada, sin el movimiento enlazado*, and it states plainly that no figure changes: the
invoice is declared in the quarter it was issued in either way.

What is genuinely lost with the link is **case (c)**. With no collection date the invoice can only
ever surface from its own quarter, so *money that arrived this quarter for an invoice declared in an
earlier one* cannot be computed for it **at all**. Nothing in the UI may imply the
`declared-in-earlier-period` list is complete while one of these exists — that is the whole reason
the case carries its own wording instead of being folded into the count.

Two things about the copy of the other three are deliberate. Nothing is worded as a mistake — the
text states the rule and confirms the app already applies it. And *sin cobro registrado* is reserved
for the invoice that really has no collection on record, now that the paid-but-unlinked one has its
own sentence.

The same warning appears one step earlier, in the pay flow (`AccrualPeriodNote`), where marking an
invoice paid is about to create a collection-dated transaction in a quarter that is not the one the
invoice will be declared in.

#### The findings ride the deadline that is already due

A panel on the quarter being *looked at* never reaches the person about to file, who is reading the
deadline surface. So the findings of a quarter are attached to that quarter's **existing** deadline
entry as a `crossQuarter` qualifier (`CrossQuarterDeadlineNote`): how many invoices disagree, for
how much, and how many of them are the broken-link case.

**No deadline is invented.** Nothing new falls due because an invoice was collected in another
quarter; `computeDeadlines()` remains the only source of what is owed and when, and the filing-status
machine keeps reading a calendar nobody has added rows to. The qualifier is attached afterwards, by
`withCrossQuarterNotes()` in `src/utils/crossQuarterDeadlineNotes.ts`, and it is narrowed three ways:

- **only the 303 and the 130** (`CROSS_QUARTER_DEADLINE_MODELOS`). The annual 390 and 100 span every
  quarter of the year, so a quarter boundary inside one year moves nothing for them;
- **only `upcoming` and `due`** (`CROSS_QUARTER_DEADLINE_FILING_STATUSES`). `not_due` is noise months
  ahead and `filed` is too late to inform. `overdue` is left out on purpose: that deadline already
  shouts on its own, and this note exists to reach the user while the figure is still being decided;
- **only when the quarter has findings.** `buildCrossQuarterNote()` returns `null` for an empty
  quarter rather than a zeroed note — a qualifier that is always on screen is one nobody reads.

The note is drawn by a single component (`DeadlineCrossQuarterNote`) so its wording cannot drift
between the dashboard banner and the fiscal page's deadline list, and it links to the detail panel
through `CROSS_QUARTER_PANEL_ANCHOR`: a note that states a count and an amount owes the user the
list behind them. It is deliberately quiet — no warning colour, no alarm icon. The figures about to
be filed are right; what the note guards is the human step afterwards.

---

## What counts as fiscal

`vw_FiscalQuarterly` filters income and expenses asymmetrically, and the asymmetry is load-bearing:

- **All paid income enters the view.** Whether it is *professional* income is decided later, by
  `isProfessionalIncome()`: `Type = 'income'` **and** `ParentCategoryName = 'Facturas'`
  (`PROFESSIONAL_INCOME_CATEGORY`). Income outside that category is surfaced as
  `FiscalReport.uncountedIncome` rather than dropped, so a miscategorised invoice is visible
  instead of silently missing from the 130 and the 100.
- **An expense enters only once it is coded** — it carries a `VatPercent`, a `DeductionPercent`,
  a `VatDeductionPercent` or an `InvoiceNumber`. Everything else is private spending. The IVA share
  counts on its own: an expense whose single fiscal datum is *none of this input VAT is deductible*
  would otherwise never reach a model (§ The two deduction shares).

An earlier version inferred the income side the same way as the expense side, requiring fiscal
coding on both. That erased every 2023 invoice — 44.954,00 €, imported without VAT data — from the
130, the 390 and the 100 of that year. Do not make this filter symmetric.

---

## The two deduction shares: IRPF is not IVA

A coded expense carries **two** deduction percentages, because one receipt is answering two
different articles:

| Column | Answers | On the live home-office supplies |
|--------|---------|----------------------------------|
| `DeductionPercent` | Art. 30.2.5.ª b LIRPF — the supplies of a dwelling partially affected to the activity are deductible at **30 % of the affected proportion** | The modelo 036 filed on **18-ago-2026** declares a **25 % affectation of 102 m²**, so 30 % × 25 % = **7,5 %** |
| `VatDeductionPercent` | Art. 95 LIVA — exclusive affectation is required for anything that is not a bien de inversión | AEAT's position on those same supplies (consulta **V2554-23**, **TEAC 6654/2022**) is that **none** of that input VAT is deductible: **0 %** |

7,5 and 0, on the same receipt, on the same day. One column could not say both, and while there was
only one the app deducted input VAT a comprobación would disallow. That was the last open finding
of the fiscal audit, and it also shaped a second module — see § Amortización del inmovilizado.

**`DeductionPercent` did not change meaning.** It is the IRPF share, as it always was. Every
pre-existing row, category default and test keeps working untouched; the IVA share is the new
column, and it is the only thing that is new.

### NULL means "the same share as the IRPF one" — it does not mean 0

`VatDeductionPercent` is nullable on `Transactions` and `RecurringExpenses`
(`DefaultVatDeductionPercent` on `Categories`), and **an unset value inherits the IRPF share**.
That is exactly what the app did while there was a single percentage, which is why adding the
column moved no figure anywhere: with no row setting it, every casilla 29 and every deductible base
came out identical to the cent against the pre-change database. Only a row that sets it explicitly
makes the two diverge.

`VAT_DEDUCTION_INHERITS_IRPF = null` names the default in `src/constants/finance.ts`, and
`VAT_DEDUCTION_PERCENT` names the two points art. 95 LIVA actually leaves available for a
non-bien-de-inversión expense (`NONE: 0`, `FULL: 100`). Do not "tidy" the null into a `0`: a 0 is
an explicit *deduct no input VAT*, and applied as a default it would strip the input VAT from every
row written before the column existed — including quarters already filed.

**The fallback is resolved once, in SQL**, by `vw_FiscalQuarterly`:

```sql
COALESCE(t."VatDeductionPercent", t."DeductionPercent", 0) AS "VatDeductionPercent"
```

The view column is therefore never NULL, and no model has to remember the rule. Resolving it in SQL
rather than in TypeScript is deliberate: a model that read a raw NULL as a zero would erase an
already filed casilla 29.

`computeFiscalFields()` takes the VAT share as an optional **fourth** argument and falls back with
`??` — never `||`, which would discard the explicit `0` that is the entire point of the column:

```ts
const vatShare = vatDeductionPercent ?? deductionPercent;
const baseDeducibleCents = Math.round((baseCents * deductionPercent) / 100); // IRPF, art. 30 LIRPF
const ivaDeducibleCents = Math.round((ivaCents * vatShare) / 100);           // IVA, art. 95 LIVA
```

The first three parameters keep their order and meaning, so a three-argument call is still correct
— it simply means *both shares are the same*.

### The rule has to travel, or it is recreated every month

Internet, luz and calefacción — the expenses the two shares actually differ on — are **recurring**.
`RecurringExpenses` therefore carries the pair as well, and `confirmOccurrence()` stamps both onto
the movement it generates: a rule that could only carry the IRPF share would re-create the defect
every month, on a row nobody ever re-codes by hand. `Categories.DefaultVatDeductionPercent` seeds
the same pair into hand-entered expenses through `useFiscalDefaults()`, which deliberately does
**not** coerce a missing default to 0 — that would write an explicit *no VAT deducted* onto every
expense of every category.

`RecurringExpenseForm` puts the IVA share next to the IRPF one, so a rule can be given a share of
its own instead of only ever receiving whatever its category carries. Left blank it stays NULL from
the form (`toNullableNumber`) through the schema, the INSERT and `confirmOccurrence()` all the way
to `Transactions."VatDeductionPercent"`, where the view resolves it to the IRPF share. Only an
explicit `0` — the supplies case — writes a zero, and every hop uses `??`, never `||`, so that zero
survives to the movement.

### On screen: mark the divergence, do not print the agreement

`FiscalTransaction` carries both shares — `deductionPercent` and `vatDeductionPercent`, the second
already resolved by the view — and `FiscalExpenseTable` shows the IRPF one in its `Deduc%` column
exactly as it always did. On the rows where the IVA share differs, and only there, a neutral
`ⓘ IRPF ≠ IVA` badge appears beneath the percentage; the two figures, labelled, and the reason live
in its tooltip.

**A permanent second column was the obvious answer and is the wrong one.** The two shares are equal
on almost every row — that is what *NULL inherits the IRPF share* means in practice — so a second
column would print the same number twice down the entire table, and a column that says nothing on
ninety-nine rows is not read on the hundredth. Equal is the normal case, and the normal case is
precisely what does not need showing. The exception is what needs showing, and it has to *look*
unlike its neighbours to be seen at all.

What the badge defends against is not confusion, it is a correction. A supplies row reads **7,5 %**
next to an **IVA deducible of 0,00 €**, which looks like arithmetic that failed. Both figures are
right, and a right figure that looks like a bug is eventually "fixed" — by making the two agree,
which means deducting input VAT that art. 95 LIVA denies, on recurring rows, every quarter, until a
comprobación disallows it. An explanation attached to the row is the cheapest place to stop that.

On the mobile card the marker sits under **IVA deducible** instead, because the card shows no
deduction rate at all: there the `0,00 €` *is* the figure that reads as a bug, and the tooltip
supplies the two percentages the card has no room for.

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

## Créditos incobrables: art. 80.Cuatro LIVA

An invoice that will not be paid lets the **IVA repercutido already declared on it** be recovered:
the base imponible is reduced by issuing a *factura rectificativa* and notifying AEAT. The right
runs on hard deadlines, and letting them pass loses it permanently.

The app implements a **clock and a checklist, and nothing else**. It issues no rectificativa, files
no modelo 952, and never touches an invoice's `Status`. It answers two questions: does the article
reach this invoice at all, and if so, between which two dates may the right be exercised.

> **Vigencia verified on 18-ago-2026** against the BOE consolidated texts. Art. 80 LIVA is in the
> version in force since **1-1-2023** (art. 77 Ley 31/2022, BOE-A-2022-22128) — no later norm
> reaches it; the 2024-2026 amendments to the LIVA touch arts. 19 and 91.Dos, the anexo and the
> DT 13.ª. Art. 24 RIVA is in force since **1-1-2024** (art. 1.4 RD 1171/2023, BOE-A-2023-26454).
> Re-verify before changing any term below.

### It does not apply to an invoice with no Spanish output VAT — which is nearly all of them here

**Read this before "fixing" the detection into offering the module for the invoices on file.** This
taxpayer's invoices are services to businesses established **outside the TAI**: not subject by the
localisation rules (art. 69.Uno.1.º LIVA), no cuota repercutida, declared in **casilla 120** of the
303. Art. 80.Cuatro does not reach them, on **two independent grounds**:

1. **There is no cuota to recover.** The article reduces the base *«cuando los créditos
   correspondientes a las cuotas repercutidas por las **operaciones gravadas** sean total o
   parcialmente incobrables»*. An operación no sujeta is not an operación gravada and repercutió
   nothing: a rectificativa would reduce a base carrying 0,00 € of IVA and the 303 would not move by
   a cent. **No right lapses by letting the window close.**
2. **Even with a cuota, it is excluded.** Art. 80.**Cinco.2.ª**: *«Tampoco procederá la modificación
   de la base imponible cuando el destinatario de las operaciones no esté establecido en el
   territorio de aplicación del Impuesto, ni en Canarias, Ceuta o Melilla.»* The only carve-out —
   insolvency declared by a court of another Member State under Reglamento (UE) 2015/848 — routes the
   case through **art. 80.Tres** (concurso), not through the Cuatro, and is outside this module.
   Art. **24.2.a).2.º RIVA** turns it into an express declaration by the acreedor: filing a modelo
   952 for a foreign client is declaring something false.

So the gate is **fail-closed**. An invoice enters the clock only when **both** hold — a cuota
repercutida **> 0** (`VatPercent > 0`), and a recipient **established** in TAI, Canarias, Ceuta or
Melilla — and a missing datum keeps it out rather than letting it in
(`RECIPIENT_ESTABLISHMENT_UNKNOWN`). With the current portfolio the tracked list is **empty, and
that is the correct answer**. It is why excluded invoices are returned in `outOfScope` *carrying
their reason* instead of vanishing: a module that shows nothing and explains nothing reads as a bug,
and the next reader "fixes" it.

> **Live case — DW-09**, 1.200,00 €, `finalized` on 3-ago-2026, never collected, client established
> in Australia, `VatPercent = 0`, casilla 120. **It is out of the window, now and for ever**, on
> `NO_OUTPUT_VAT` and, independently, on `RECIPIENT_NOT_ESTABLISHED`. That is the finding, not a
> failure of the detection.

### The terms

| Term | Value | Source |
|------|-------|--------|
| Waiting term, general rule | **1 year** from the devengo without having obtained payment | art. 80.Cuatro.A).1.ª párr. 1 |
| Waiting term, PYME option | *«podrá ser, de seis meses o un año»* — **6 months** | art. 80.Cuatro.A).1.ª párr. 3 |
| PYME threshold | previous calendar year's volumen de operaciones ≤ **6.010.121,04 €** (computed per art. 121 LIVA) | art. 80.Cuatro.A).1.ª párr. 3; AEAT, Manual práctico IVA 2025 |
| Window to issue the rectificativa | **6 months** from the end of the waiting term. Caducidad | art. 80.Cuatro.B) |
| Notice to AEAT | **1 month** from the date the rectificativa was issued («expedida»), electronically, **modelo 952** | art. 24.2.a).2.º RIVA; AEAT procedimiento G416 |
| Minimum base, recipient not an empresario/profesional | > **50 €** (was 300 € until 31-12-2022) | art. 80.Cuatro.A).3.ª |
| Modification back **upwards** | **1 month** from desisting of the reclamación judicial or agreeing a settlement | art. 80.Cuatro.C) |

The user is a PYME by turnover trivially, so **both terms are available to them** — which is exactly
why the app must not choose one.

```
windowStartDate = devengo + 6 or 12 months     [art. 80.Cuatro.A).1.ª]
windowEndDate   = windowStartDate + 6 months   [art. 80.Cuatro.B)]
```

Both ends are **inclusive**: the waiting term is «un año desde el devengo sin haber obtenido el
cobro», so on the anniversary the year has elapsed and the rectificativa may already be issued; and
the closing day is the last day of a plazo de caducidad, not the first day after it. Months are
added *de fecha a fecha*, falling back to the last day of the target month when it has no equivalent
day (art. 5.1 CC): 31-ago-2026 + 6 months is **28-feb-2027**, not 3-mar-2027. Overshooting would
hand the user a deadline later than the one the law gives them.

**Both windows are always computed and shown as labelled alternatives.** Nothing in the data model
records which term the taxpayer chose, and choosing for them would be inventing a fact.

> ⚠ **NOT CONFIRMED, and deliberately not encoded as certainty.** The two windows are contiguous by
> construction, which would mean a PYME who lets the six-month one lapse still has the one-year one
> (outer limit devengo + 18 months). The law's *«podrá ser, de seis meses o un año»* reads as a
> genuine option, and no DGT ruling settling the point was found. Never collapse the two into one
> outer deadline on the strength of the arithmetic alone.

### `InvoiceDate` stands in for the devengo, and that is an approximation

Services accrue when they are rendered (art. 75.Uno.2.º LIVA), or with the anticipated payments of
art. 75.Dos. The app stores no service date, so the clock runs on `"Invoices"."InvoiceDate"`. For an
invoice issued the day the work ended the two coincide; otherwise the clock can be a few days early
or late. **The UI must say so, and no other feature may lean on this as if it were the devengo** —
art. 75 has not been researched to the depth art. 80 has.

### Stages, exclusions and the checklist

`BAD_DEBT_STAGE` is `waiting` → `in-window` → `window-expired`, plus `out-of-scope` for a closed
gate. An invoice whose windows have all lapsed **stays listed**: the right is gone and the loss
should be visible. `needsAttention` is what separates what can still be chased (open, or opening
within `BAD_DEBT_APPROACHING_DAYS` = 60) from what is only on the record. Sixty days is a product
decision, not a legal term: instar el cobro por un medio fehaciente has to be done *and documented*
before the rectificativa can be issued, so warning on the day the window opens would already be late.

There is deliberately **no `pendiente-comunicar-952` stage.** That clock starts on the date a
rectificativa was issued, and the app neither issues one nor records that anyone did. A stage
nothing could ever compute would be a lie in the type; the one-month term lives in the checklist as
text.

| Checklist step | Basis |
|----------------|-------|
| Instar el cobro — reclamación judicial, requerimiento notarial **or any medio fehaciente**, and keep the proof | art. 80.Cuatro.A).4.ª |
| The operation invoiced and the impago booked in the **Libros Registro**, in time and form | art. 80.Cuatro.A).2.ª; art. 24.2.a).1.º RIVA |
| Issue («expedir») the rectificativa **inside the window** | art. 80.Cuatro.B); art. 15 RD 1619/2012 |
| **Remit** it to the destinatario and be able to prove the remission | art. 24.1 RIVA; STS 371/2025 |
| Upload the supporting documents through the registro electrónico and keep the **código de registro** | art. 24.2.a).2.º RIVA |
| File the **modelo 952** within one month | art. 24.2.a).2.º RIVA |
| Carry the minoración into the 303 of the period | art. 80.Cuatro |

*Medio fehaciente* is the part that changed with Ley 31/2022: before 2023 only judicial or notarial
claims counted. The DGT requires the medium to evidence the content of the claim, the identity of
sender and recipient, and the result and date of delivery, *«con las mismas garantías»* as the
notarial route — burofax and mediation are admitted (**V0206-23**, 09-02-2023, and V0209-23 /
V0212-23; ⚠ read through two coincident secondary sources, not in the DGT database).

The requirements are **substantive, not procedural niceties**: TEAC 00/05698/2023 (13-05-2025) held
the plazo and the minimum amount compatible with art. 90 of Directiva 2006/112/CE. ⚠ That resolution
judges the pre-2023 wording; what it establishes here is that **missing the window loses the right**.

### Deliberately not built

- **No rectificativa is generated, nothing is filed, no status changes.** Every step above is the
  user's, and several of them (remitting, proving the remission, uploading evidence) happen outside
  this app entirely.
- **No B2C 50 € rule.** This user's recipients are empresarios, so the threshold never fires. And the
  case law is contradictory: on the three SAN judgments of 22-01-2025 one commentator reports that
  no minimum may be required in B2C and another that the 300 € limit was upheld. ⚠ The contradiction
  is unresolved (the judgments were only read through summaries). Codifying either reading would be
  encoding a guess — if it ever matters, research it then, with the judgment in hand.
- **No art. 80.Tres (concurso) path**, and no IRPF treatment of the loss. The deductibility of a bad
  debt in estimación directa, and how it interferes with the 5 % de difícil justificación, has **not
  been investigated**; symmetry with the IVA must not be assumed.

### Where it lives

`getBadDebtReport(asOfDate)` in `InvoiceRepository.ts` over the pure maths of `src/utils/badDebt.ts`.
The SQL is deliberately wide — every `ISSUED_INVOICE_STATUSES` invoice with a NULL `TransactionID` —
and **the gate decides**, so a `'paid'` invoice whose link was lost is admitted by the WHERE and then
ruled out as `COLLECTED`. That is the same finding the cross-quarter panel reports as
`paid-without-linked-movement`, and it is emphatically **not** an impagado. Deciding it in SQL would
bury the distinction inside a predicate; a test asserts the query contains no `'paid'` literal.

`asOfDate` is always explicit, so the clock is testable and a report can never be computed against a
different day than the copy around it.

`GET /api/fiscal/bad-debt` serves it, **GET only and unscoped by period**: there is no write verb
because the app exercises nothing, and no `?year=` because a window runs from each invoice's own
devengo and straddles quarters and years — filtering by the period on screen would hide the invoice
closest to lapsing. `BadDebtCard` renders it on **`/invoices`**, under the list, for the same reason:
the thought that leads here is *this client never paid me*, and every other fiscal surface is
organised by a period this clock does not have.

The card **opens itself when something needs attention** and stays shut otherwise; a card you must
open to discover a lapsing deadline is a display, and this is meant to chase. When `tracked` is empty
the excluded list becomes the main state, **expanded**, each invoice showing its exclusion in full —
so DW-09 reads *«Sin IVA repercutido… no hay ningún plazo que se te pueda pasar»* rather than looking
broken. Two sentences are kept apart there: nothing uncollected at all, versus the article simply not
reaching anything.


`src/__tests__/services/bad-debt-invoices.test.ts` pins the boundaries — the day before a window
opens, its opening day, its closing day (where `daysRemainingInWindow` is **0**: still open, and out
of time) and the day after. **Every fixture prefixed `ES-` is labelled HYPOTHETICAL**, in the file
header and in each docblock: no real invoice carries Spanish output VAT to an established client, so
without them the clock could not be exercised at all. Do not read them as data about this taxpayer.

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

The exclusion happens **at read time**, and not by zeroing the transaction's `DeductionPercent`,
which is the obvious shortcut.

**The original reason is now historical.** While a single column drove both percentages, zeroing
`DeductionPercent` also erased the purchase's *input VAT* from the 303 and the 390: on the real
Lenovo that would have removed 150,82 € of the 158,74 € in casilla 29 of an already filed 4T 2025,
a 95% hole in a quarter that cannot be rectified without cost. Since the two shares were split
(§ The two deduction shares) that trap is gone — an asset could now be zeroed on the IRPF side
while `VatDeductionPercent` kept its VAT whole.

**The design does not change, because it never rested only on that.** Two reasons stand on their
own, and both were always the better ones:

- **The purchase is not a period expense at all**, at any percentage. Its cost reaches the IRPF
  models as the dotación, spread over the asset's life. A deduction share is not a weaker version
  of that — it is the wrong instrument. Read-time exclusion states the actual rule: *this row is
  not an expense of this period*.
- **Zeroing rewrites a fiscal datum of a period that may already be filed**, and it does not
  survive the link being undone. Deleting the asset, or the `ON DELETE SET NULL` clearing
  `TransactionID`, would leave a zeroed row with no schedule behind it — a purchase deducted
  nowhere, on either side. The exclusion is *derived* from the link, so it disappears exactly when
  the link does.

`FixedAssets.TransactionID` is therefore load-bearing, not decorative. The FK is `ON DELETE SET NULL`
so that re-importing or correcting the movement never destroys the schedule of a year already filed —
but note that a schedule whose link is lost stops excluding anything, and the purchase silently
becomes deductible again.

### A missing link is said out loud, and the purchase is offered

The failure has no symptom. Both figures are individually correct — the purchase *is* a coded
deductible expense, the dotación *is* the schedule of a registered asset — so nothing in the app
looks wrong while the same asset is deducted twice, every year the schedule runs. That is what makes
it worth detecting: an error that reads as a bug gets fixed by whoever sees it, and this one does
not read as anything at all.

**The warning half.** An asset whose `TransactionID` is null is reported, unprompted, next to the
asset itself (`UnlinkedPurchaseNotice`), and the copy states the cost rather than the condition: the
purchase is still being deducted as an expense of its period *and* the dotación is deducted on top.
`getUnlinkedFixedAssets(year?)` is the server-side reading of the same set; it takes the `year` of
`getFixedAssets()`, so it answers *which assets are being double-deducted in the modelos of this
year*, which is the only question with a fiscal consequence. It deliberately returns no cost figure —
what the duplication is worth is the dotación of a period, and only the caller knows which period it
is asking about.

**The fix half — and it is the valuable one.** A warning about a link the user must go and find by
hand is a warning that gets postponed. `getAssetPurchaseCandidates(assetId)` searches for the
movement that is almost certainly the purchase: a fiscally coded **expense** of this user whose
amortizable cost is within `ASSET_PURCHASE_MATCH.AMOUNT_TOLERANCE_PERCENT` (1 %, floor
`AMOUNT_TOLERANCE_MIN_CENTS` = 100 cents, so a cheap asset still has a band) of the asset's base,
dated inside an **asymmetric** window around the in-service date — 90 days before, 30 after, because
a thing is bought and *then* put into service and the forward month exists only because in-service
dates are typed by hand — and **not already another asset's purchase**. Ranked by how close the
amount is, then by how close the date is, cut at `MAX_CANDIDATES` (5).

Every clause of that rule is there to offer *fewer* rows. **A wrong link is strictly worse than no
candidate**: it makes a real purchase stop being deducted while the impostor keeps being deducted,
and it is silent in both directions. So the module suggests and never acts — linking is an ordinary
field update on the asset (`PUT /api/fiscal/assets/:id` with `{ transactionId }`), confirmed by the
user, and there is no second write path onto that column.

#### The two amounts are not comparable, and the comparison is the whole trick

`FixedAssets.BaseCents` is the acquisition cost **net of deductible VAT**. A transaction's amount is
what left the account: VAT included, and *halved* when the expense is shared. Both corrections
already have a home — `vw_FiscalQuarterly` un-halves the amount into `FullAmountCents` and resolves
the NULL `VatDeductionPercent` into the IRPF share, and `computeFiscalFields()` splits that into base
and cuota — so the comparable figure is

```
amortizableCost = baseCents + ivaCents − ivaDeducibleCents
```

Input VAT that is **not** deductible was never recovered from the Treasury, so it is part of the cost
and belongs in the base. On the live Lenovo the VAT is fully deductible and this comes out at exactly
the 718,18 € stored on the asset.

This is the one fiscal read that goes to **`vw_FiscalQuarterly`** on purpose, and it is not the
mistake § Devengo vs. caja warns about: it fills no casilla and computes no fiscal figure. It is
looking for a *movement*, and it needs that movement's own `TransactionID` and its own payment date —
which is precisely what the accrual view replaces for issued invoices. For expense rows the two views
are the same row anyway.

> **The regression test is silence.** The only asset on the live data, the Lenovo, is linked to
> transaction **3489**. A correct implementation therefore renders nothing, requests nothing and
> reports nothing on the real database, and the tests pin exactly that — the asset on screen, no
> warning, no candidate query issued at all. Every fixture that exercises the matcher is labelled
> HYPOTHETICAL for the same reason.

---

## Aplazamientos y fraccionamientos

When AEAT grants a deferral it sends a **RESOLUCIÓN DE APLAZAMIENTO/FRACCIONAMIENTO**: a header, an
**ANEXO I** with one row per fracción, and an **ANEXO II** with the liquidación de intereses behind
those rows. What later leaves the bank account is one charge per fracción — and that charge is
three legally different things paid together.

Until this module existed the instalments were typed into Movimientos by hand, **whole**, as
pending expenses. That is the failure this section is about.

### One instalment, three fates

| Part | What it is | Deductible | Where it lands |
|------|------------|------------|----------------|
| **Principal** | The IVA or the IRPF being deferred | **Not an expense at all** — it is the tax | Nowhere |
| **Recargo de apremio** | Surcharge of the período ejecutivo | **No**, expressly (art. 15.c LIS) | Nowhere |
| **Intereses de demora** | The price of paying late | **Yes, in full** | Modelo 100 **casilla 0203** |

The interés is a **gasto financiero**, not "otros tributos" (0206), and that distinction is the
whole point of the module. DGT **V4080-15** classifies intereses de demora tributarios as financial
expenses; STS **150/2021** settled that they are deductible at all, against the earlier reading that
a cost arising from the taxpayer's own default could not be. `DEFERRAL_INTEREST_CASILLA` names that
box and nothing else may point at it.

**Booking the instalment whole has already cost money, in both directions.** The interest is never
deducted — 95 € of it sat invisible for two years — and one instalment ended up marked 100 %
deductible by a stray click, which is the same error with the sign reversed: the tax itself deducted
as an expense.

### How AEAT builds the calendar (art. 53 RGR)

The principal is split into N fracciones falling due on the **5th or the 20th** of a month (art.
45.2 RGR). Interest is then liquidated **per fracción**, on that fracción's principal, from the day
after the **fecha de intereses** — the close of the periodo voluntario, printed in the header — up to
its own vencimiento:

```
interés = base × tipo × días / (100 × 365)
```

Three consequences, all of them visible in the letters:

- **The instalments increase.** The principal is flat; every fracción accrues over a longer span
  than the one before it, on the same base. A calendar whose instalments are equal is not a
  fraccionamiento of AEAT.
- **The base is the principal alone.** The recargo de apremio is *not* in it — the letter says so
  verbatim ("la base para el cálculo de intereses no incluirá el recargo del período ejecutivo").
- **The tipo is fixed by the Ley de Presupuestos**, interés legal × 1,25 (art. 26.6 LGT). It is
  stored as printed and never re-derived from the year: recomputing it would rewrite the interest of
  a letter already accepted.

> Expediente **282640560363H** — Modelo 130 2T 2026, tipo 4,062 %, fecha de intereses 20-07-2026,
> so interest runs from the 21st:
>
> ```
>   #   principal    interés   total del plazo   vencimiento   días
>   1     781,66       5,39         787,05       21-09-2026     62
>   2     781,66       8,00         789,66       20-10-2026     92
>   3     781,66      10,70         792,36       20-11-2026    123
>   4     781,66      13,31         794,97       21-12-2026    153
>   5     781,66      16,01         797,67       20-01-2027    184
>   6     781,69      18,71         800,40       22-02-2027    215
>       ─────────   ────────      ─────────
>        4.689,99      72,12       4.762,11
> ```

### The remainder lands on the LAST fracción — so the split is read, never derived

AEAT does **not** keep the principal constant. It divides, rounds, and loads the leftover cents onto
the final row:

| Letter | Principal | Split |
|--------|-----------|-------|
| 282640560363H | 4.689,99 € | 781,66 ×5, then **781,69** |
| 282640432002C | 1.956,71 € | 489,17 ×3, then **489,20** |

Dividing the total by N is off by up to three cents per instalment, and this project already made
that mistake by hand. **ANEXO I is the source of the split.** Everything downstream — the schema,
the extractor prompt, the verification — is built so that a derived split can never become the
stored one. The header totals exist to be *checked against* the rows, not to generate them.

The same rule governs the interest column: the last fracción absorbs its rounding too
(282640560363H #6 works out to 18,70 on its own and is printed as 18,71, so the column adds to
72,12).

### Two columns that get conflated — both have already been misread

**1. `Importe total deuda (1+2)` is not the principal.** It is principal + recargo. On expediente
**282540627253E**, requested in período ejecutivo:

```
principal 2.081,21 €   recargo de apremio 416,24 €   total deuda 2.497,45 €   intereses 42,08 €
```

Reading 2.497,45 as the principal buries **416,24 € of non-deductible recargo** inside a figure
treated as tax paid — exactly the state art. 15.c LIS forbids and this module exists to prevent. The
same letter proves the base rule above: its whole recargo sits on a **sixth fracción of 0,01 € of
principal**, which therefore accrues **0,00 € of interest over 272 días**.

**2. The vencimiento in ANEXO I is already moved off a día inhábil; ANEXO II accrues to the day it
was moved from.** Fracción 1 above falls due **21-09-2026** but is liquidated over **62 días**,
ending 20-09. Using the printed vencimiento as the accrual end breaks the day count on five of the
sixteen real rows. `interestAccrualEndDate()` rolls a vencimiento back to the 5th or the 20th when
it sits within four days of one, and takes it at face value otherwise.

> `workingDays.ts` is deliberately **not** used for that rollback. `nextWorkingDay()` is not
> invertible — 19, 20 and 21-09-2026 all map to 21-09 — and it does not know regional holidays, so
> it would manufacture findings rather than catch them.

### What the verification checks, and what it refuses to do

`verifyDeferral()` (`src/utils/deferral.ts`) returns a `DeferralVerdict`: a list of findings, never
a boolean. Six of the seven checks compare the letter **against itself**; none of them recomputes a
split.

| Check (`DEFERRAL_CHECK`) | What it catches |
|--------------------------|-----------------|
| `fraccion-sequence` | No rows read at all, or a numbering that is not 1..N without gaps |
| `fraccion-total` | A row whose printed *total del plazo* ≠ its own principal + recargo + interés |
| `principal-total` / `surcharge-total` / `interest-total` | A column that does not add up to the totals row |
| `due-date-order` | Vencimientos out of order, or one on/before the fecha de intereses |
| `interest-accrual` | An interés that cannot belong to its own number of días (art. 53 RGR) |

`totalCents` is required on every row precisely because it is redundant: it is the cheapest way to
turn a single misread digit into a rejected payload instead of an absorbed one. It is checked, never
filled in.

**`interest-accrual` is the only check that derives a figure, and the only one with a tolerance.**
The letter prints its tipo truncated — **4,062 is really 4,0625 %** — and recomputing with the
printed value lands exactly one cent low on three of the sixteen real rows. The band is therefore
derived rather than picked: one ulp of the printed rate plus AEAT's half-up cent,
`ceil(base × 10⁻³ × días / 36500) + 1`. It scales with the base, so a 10.000 € deferral does not
false-positive and an 800 € one keeps no blind spot. A three-cent disagreement is still reported —
widening a tolerance until a finding disappears defeats the feature.

The tipo must reach the verification **as printed**. "Correcting" 4,062 to 4,0625 upstream removes
the reason the band exists.

### How a resolution enters the books

`DeferralImportService.importDeferral()` writes, in one transaction:

- one **`Deferrals`** row — the letter's header and its three totals;
- one **`Transactions`** row per **non-zero** part of each fracción, `Status = pending`, dated on the
  vencimiento, `DeferralID` / `DeferralFraccionNumber` / `DeferralPart` set;
- one **`TransactionGroups`** row per fracción that books two or more parts, so the instalment reads
  as the single payment it is.

The categories are not a preference: the interés goes to `Trabajo › Intereses de demora` at **100 %**
deduction, the principal and the recargo to `Trabajo › Impuestos` at **0 %** (`DEFERRAL_CATEGORY`,
`DEFERRAL_PART_DEDUCTION_PERCENT`). The 0 % is what keeps them out of every box — `getModelo100Summary()`
only maps rows with `baseDeducibleCents > 0`, so the "Impuestos" casilla 0206 is never reached. If
either subcategory has been deleted or renamed the import fails with a 404 and writes nothing,
rather than booking a financial expense into the wrong box.

**A zero part books nothing.** A 0,00 € recargo is a real reading — the totals row proves it was
read — but a 0,00 € expense is noise in every list and export. The zero survives where it belongs:
in `Deferrals.SurchargeCents`, and in the rebuilt ANEXO I, which adds up either way.

**There is no fracciones table.** A fracción *is* its movements: `getDeferralFracciones()` rebuilds
ANEXO I with `SUM(...) FILTER (WHERE "DeferralPart" = …)`. That is what makes the verdict on a
stored deferral a real check instead of a tautology — an edited movement makes its own fracción stop
reconciling with the header the letter printed.

`DeferralPart` exists because principal and recargo are coded **identically** (both 0 %, both
"Impuestos"), so nothing else in the row tells them apart, and the interest rows have to be
summable on their own. It is a different axis from `TransactionGroupID`: the group answers *what did
this instalment cost me*, `DeferralID` answers *what is left of this resolution*.

### What the models actually see

A fracción is booked **pending**, and every fiscal view filters `Status = 'paid'`. So a freshly
imported resolution changes no casilla at all: it is a calendar of what is owed. Marking an
instalment paid — which already works, and is not part of this module — is what lets its interés
into the models, and only its interés.

| Model | What of a deferral reaches it |
|-------|-------------------------------|
| **Modelo 130** | The paid **interés** only, inside casilla 02, in the quarter its movement is dated |
| **Modelo 100** | The paid **interés** only, in `gastosPorCasilla` under **0203** → 0218 → 0224 |
| **Modelo 303 / 390** | Nothing. No part of a deferral carries IVA — the principal *is* the IVA, already declared in the quarter it accrued |
| **IRPF provision** | Through the 130 figures, like any other deductible expense |

The principal and the recargo reach nothing, ever. They are movements of money the balance and the
cash-flow charts are right about, and expenses that no tax model may count.

### Cancelling a resolution

A deferral can be paid off early or be cancelled outright, and until this existed its pending
fracciones sat in Movimientos for ever, asking to be paid.

`cancelDeferralPendingMovements()` cuts the calendar where the user actually is, in one transaction:

- every fracción movement still **`pending`** becomes **`TRANSACTION_STATUS.CANCELLED`**;
- every movement already **`paid`** is left **exactly** as it is — that money really did leave the
  account, and its interés remains a deductible expense of the year it was paid in. Rewriting it
  would delete a real expense from an already filed 130.

Cancelling therefore needs **no new mechanism and no new flag**. `cancelled` is already filtered out
of every summary view and every fiscal view, so a cancelled fracción leaves the 130 and the 100
exactly as if it had never been booked, while the paid ones keep counting in the year they fell in.

**The `Deferrals` row survives, and nothing on it changes.** Three reasons, in order of weight:

1. `UQ_Deferrals_UserExpediente` is what stops the same letter being imported twice. Deleting the row
   frees the expediente, so the very next upload of the same PDF would silently re-book the
   instalments the user has just cancelled.
2. The cancelled movements keep pointing at it through `DeferralID`. The letter is the only thing
   that explains what those rows were, and `FK_Transactions_Deferral` would null the link.
3. There is no status column to set. `DEFERRAL_STATUS` (`active` / `settled` / `cancelled`) is
   **derived from the movements every time it is read**, never stored: a stored copy is one more flag
   that can go stale, and the movements are the only truth about what has been paid. Note that
   `settled` is *nothing pending and nothing cancelled* — paying ahead of the calendar cancels
   nothing, because that money did move.

Deleting a resolution is a different operation and it already exists: `deleteDeferral()` is for an
import that was **wrong**, cancellation is for a deferral that really was **cancelled**.

**The guard lives in the UPDATE, not in a check before it.** Only rows still `pending` are matched,
so a fracción marked paid between the confirmation screen and the click is not rewritten, and two
cancellations racing each other cannot both claim the same fracción — the second matches nothing and
answers `409 api-error.conflict.deferral-nothing-to-cancel`. The movements are then re-read **inside
the same transaction**, so the state reported back is the one the COMMIT leaves behind rather than
the one the update intended.

**The confirmation shows both halves**, and that is not decoration: a deferral is cancelled in the
middle of its calendar, so what is *kept* matters as much as what goes. `DeferralCancellationPreview`
carries the fracciones to cancel and the fracciones to keep with their own totals, and the copy says
plainly that the cancelled movements are not deleted — they stay in the history with that status, and
reviving one means marking it pending again by hand. It also says that this changes **only what the
app shows**: if the aplazamiento was cancelled at AEAT too, the debt is still alive there, with its
own plazos and recargos.

A fracción is three movements, so its status is **resolved, not read**: pending if any part is still
pending (there is something left to cancel), paid if none is pending and at least one was paid,
cancelled only when every part is cancelled.

**Until this existed no surface showed a deferral at all.** The wizard imported the letter and the
app never mentioned it again, so adding the action meant building the place it lives: `DeferralList`
on `/fiscal`, the year's resolutions with their expediente, modelo and period, keyed by year like the
inmovilizado, because a resolution belongs to a year and not to a quarter. The list carries **no
status badge per row** — `DEFERRAL_STATUS` is derived from the movements, so a badge would cost a
query per resolution to print one word. It is computed once inside the confirmation, next to the
fracciones it was derived from.

`GET /api/fiscal/deferrals/:id/cancel` is the preview and `POST` to the same URL performs it, neither
taking a payload: what gets cancelled is decided by the movements' own status, so there is nothing to
validate and nothing that can drift between the confirmation and the write. The confirm button is not
danger-red — nothing is destroyed — and after the write both halves come down, replaced by what
actually happened; leaving them on screen under a success message would read as *these are still
about to be cancelled*.


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
4. **Apply the scale of that year.** `computeIrpfCents(fiscalYear, base)` runs both halves —
   `stateScale` and `regionalScale[madrid]` of `getIrpfFigures(fiscalYear)` — and adds them.
5. **Relieve the mínimo personal.** 5.550 € (`minimoPersonalCents`) is **not subtracted from the
   base**. It is taxed by the scale and its resulting quota is subtracted from the gross quota, which
   is what makes it always relieve at the lowest brackets. It is capped at the base, so a small base
   pays zero rather than generating a refund.
6. **The gap.** `estimatedIrpfCents − modelo130TotalCents`, plus a monthly figure to set aside.

`modelo130PaidCents` counts only quarters whose filing window has already **closed**
(`settledM130Quarters()` reuses the deadline calculator). A quarter still inside its window is
pending, not paid, and belongs in the deadline calendar instead.

### The figures are per year, and they are looked up

Both halves of the scale, the mínimo personal and the ceilings of the pension reduction are fixed
by the Ley de Presupuestos. They live in `IRPF_YEAR_FIGURES`, keyed by fiscal year — deliberately
the same shape as `RENTA_WINDOWS` in `src/utils/fiscalDeadlines.ts`, which had this problem first
and answered it once. The three pieces map one to one, and a fourth answer to the same question is
what this is meant to prevent:

| Renta filing window | IRPF figures |
|---------------------|--------------|
| `RENTA_WINDOWS`, keyed by campaign | `IRPF_YEAR_FIGURES`, keyed by fiscal year |
| `LAST_PUBLISHED_RENTA_CAMPAIGN` | `LAST_PUBLISHED_IRPF_YEAR` |
| `isRentaWindowConfirmed()` | `isIrpfScaleConfirmed()` |

The reason both look like this is the same: a date or an amount set by ley cannot be derived from
the previous year's, only looked up — and when it is missing the honest answer is last year's
figure *labelled as last year's*, not a guess presented as fact.

`computeIrpfCents()`, `computeMarginalRate()` and `computePensionReductionCents()` therefore all
take the year, and `getIrpfFigures(year)` falls back to `LAST_PUBLISHED_IRPF_YEAR` when the year has
no entry of its own. `isIrpfScaleConfirmed(year)` says which of the two happened, and reaches the UI
as `IrpfProjection.isScaleConfirmed`.

**This is not a nicety.** While the figures were flat constants, updating them for a new ley
rewrote the projection of every year already declared — the app would have started disagreeing with
declarations that are on record, with nothing on screen to say so. Hence the rule: **a new year gets
a new entry, never an edit of an existing one.** 2025 and 2026 deliberately point at the same object
(`IRPF_FIGURES_PRORROGADAS_2023`), which is what a prorrogación is.

`isScaleConfirmed` and `isProjectionReliable` answer different questions and must not be merged:
the second is about how much of the year has elapsed and improves on its own as days pass, the
first is about whether the law is published and only changes when somebody adds the year to the
table.

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

**The year on the calendar is not the year being filed.** Every period is filed in the one after it:
on 10 January the 303 and the 130 of Q4 are due and so is the 390, and the Renta of the previous year
runs from April to June. A surface that only ever computes `new Date().getFullYear()` finds all of
those `not_due` and shows **nothing at all on exactly the days something is owed** — which is what
the dashboard banner did, and with it the cross-quarter qualifier of Q4, the likeliest quarter to
carry one (invoice issued in December, collected in January, `crossesFiscalYear`).

`getCarryOverDeadlines()` is the fix, and it stays inside the same discipline as the rest of this
file: **pure, and it invents nothing.** It filters the entries `computeDeadlines()` already emits for
a closed fiscal year down to those whose window is still open, and only the `active=true` path of the
route prepends them. Two boundaries are deliberate:

- **`upcoming` and `due` only — never `overdue`.** A filing missed in a year that is already closed
  is a different conversation, and carrying it forward would park a permanent warning on the
  dashboard of anyone who ever skipped one.
- **The year view is left alone.** Asked about a year, the route answers for that year; adding
  another year's rows would contradict the selector the user just moved and its own `meta.year`.

⚠ One consequence to know about: a carried-over **Modelo 100** may be a window flagged
`isWindowConfirmed: false` (see below). The banner does not render that flag — the panel is where
dates are detailed — so a provisional Renta window can appear there without its caveat. Pre-existing
in the banner and now reachable in one more situation; it is a copy decision, not a wiring one.

**Renta window.** Fixed by an Orden ministerial each campaign and it moves — 3 April in 2023,
2 April in 2024, 8 April in 2025. `RENTA_WINDOWS` holds the published ones; a year past
`LAST_PUBLISHED_RENTA_CAMPAIGN` falls back to the most recent window *and* is flagged
`isWindowConfirmed: false`, so the UI shows it as provisional rather than presenting a guess as a
fact. **Add the new window here every year.**

This is the older of the two published-by-ley lookups in the module. The IRPF figures follow the
same shape for the same reason (§ The figures are per year, and they are looked up), and a third
answer to the question *what do we say about a year the legislator has not spoken about yet* would
be one too many.

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
| The IVA deduction share falls back to the IRPF one, never to 0 | `COALESCE(t."VatDeductionPercent", t."DeductionPercent", 0)` in `vw_FiscalQuarterly`; `??` and never `\|\|` in `computeFiscalFields()` | A NULL read as a zero strips the input VAT of every row written before the column existed — casilla 29 of every already filed quarter |
| A place that copies one deduction share copies both | `deductionSharesOf()` feeds both to all seven `computeFiscalFields()` call sites; `confirmOccurrence()` stamps both onto the generated movement | The copy keeps the IRPF share and silently re-inherits it for IVA: a home-supply expense deducts input VAT again, in a row that looks correctly coded |
| An asset's purchase is skipped by the IRPF models only | `getAssetTransactionIds()`, applied in Modelo 130/100 and the projection | Skipped nowhere: the asset is deducted twice. Skipped everywhere: its input VAT vanishes from an already filed 303 |
| An asset with no linked purchase says so | `getUnlinkedFixedAssets()` + `getAssetPurchaseCandidates()`, rendered by `UnlinkedPurchaseNotice` on every asset whose `TransactionID` is null | **The asset is deducted twice** — the purchase stays a period expense *and* the dotación is deducted on top — silently, and for as long as the schedule runs |
| A candidate purchase is offered, never linked | The route is GET-only; linking is `PUT /api/fiscal/assets/:id` with `{ transactionId }`, confirmed by the user | A wrong link is worse than none: a real purchase stops being deducted while the impostor keeps being, and neither says anything |
| The IRPF figures of a year are looked up, never edited | `IRPF_YEAR_FIGURES` keyed by fiscal year; `getIrpfFigures()` falls back and `isIrpfScaleConfirmed()` says so | Updating a flat constant for a new Ley de Presupuestos rewrites the projection of every year already filed |
| A dotación is never a `Transactions` row | `FixedAssets` is its own table | The purchase is double-counted and every balance, summary view and cash-flow chart is falsified |
| With a group declared, rate ≤ tabla × 2 | `coefficientFitsGroup()`, re-run by PUT against the merged row | An over-fast rate over-deducts — the exact error this module exists to prevent |
| A fracción's split is read from ANEXO I, never divided out of the total | `CreateDeferralSchema` stores the rows as read and only checks them against the totals row | The remainder AEAT loads onto the last fracción is lost: every instalment off by up to three cents |
| The three parts of a fracción are three rows, never one | `DeferralPart` + one movement per non-zero part | The interés is never deducted, or the principal is deducted as if it were an expense |
| Only the interés is deductible, at 100 %, into casilla 0203 | `DEFERRAL_PART_DEDUCTION_PERCENT`, `DEFERRAL_INTEREST_CASILLA` | A non-deductible recargo (art. 15.c LIS) or the tax itself enters the base |
| `Importe total deuda (1+2)` is never stored as the principal | `PrincipalCents` and `SurchargeCents` are separate columns; `TotalDeudaCents` is not stored at all | Recargo de apremio disappears into a figure treated as tax paid — 416,24 € on one real letter |
| The tipo reaches the verification as printed (4,062, not 4,0625) | `accrualToleranceCents()` is derived from the printed rate's ulp | Either false findings on every long fracción, or a tolerance wide enough to hide a real one |
| Cancelling a deferral never rewrites a **paid** fracción | The UPDATE matches `Status = 'pending'` only; the guard is in the statement, not in a pre-check | A real, already deducted interés vanishes from a filed 130 — and two concurrent cancellations both claim the same fracción |
| A deferral's state is derived from its movements, never stored | `DEFERRAL_STATUS` is computed on read | A stale flag says *cancelled* while instalments keep falling due, or the reverse |
| A `'paid'` invoice with no linked movement is never reported as uncollected | `classifyCrossQuarter()` reads `"Invoices"."Status"` | A bookkeeping defect reads as a fiscal alarm, and the `declared-in-earlier-period` list is silently incomplete |
| A cross-quarter finding qualifies a deadline, never creates one | `withCrossQuarterNotes()` only annotates what `computeDeadlines()` produced | An invented obligation enters the filing calendar and the status machine |
| The art. 80.Cuatro clock is entered only through the fail-closed gate | `resolveBadDebtExclusion()`: cuota repercutida > 0 **and** recipient established; unknown closes it | The app invites a modelo 952 that declares something false (art. 24.2.a).2.º RIVA), or a rectificativa that recovers 0,00 € |

---

## Known gaps

Open items, in the order they matter. **The two findings of the original fiscal audit are closed**:
the 036 affectation was filed on 18-ago-2026 (25 % of 102 m²), and the single deduction share that
drove both IRPF and IVA is now two columns (§ The two deduction shares). They were blocked on each
other and were closed together, as planned. The split is closed **end to end**: the pair is stored,
resolved once in the view, marked on `/fiscal` on the rows where the two disagree, and settable on
the recurring rules that generate exactly those rows (§ The two deduction shares).

1. **Modelo 100 casilla map covers only what has been used.** Every category that has ever carried a
   deductible expense is now assigned; the rest are personal categories left unmapped on purpose. A
   new one falls through to `C0202` and is reported in `unmappedCents`, so the gap is visible rather
   than silent.
2. **Amortization is recorded, but not policed.** The schedule, the tabla, the ERD doubling, the two
   Modelo 100 boxes and the detection of an asset whose purchase is not linked are implemented
   (§ Amortización del inmovilizado). What is still manual:
   - **The 300 € threshold is not suggested either way.** Nothing flags a 250 € purchase registered
     as an asset, nor a 4.000 € one left as a period expense, nor the 25.000 €/year ceiling of
     art. 12.3.e) LIS.
   - **No bajas.** Selling, scrapping or dis-affecting an asset before its base is exhausted should
     stop the schedule and settle the pending value; today the dotación simply keeps accruing.
   - **No historical assets.** Only what has been registered amortises. Anything bought before this
     module existed was deducted in full in its year and is not restated.
3. **Cross-quarter invoices: what is detected, and the one thing that cannot be.** The alert now
   names four cases — the lost link among them — and rides the 303/130 deadline of its quarter
   instead of waiting to be visited (§ Devengo vs. caja). What remains open is deliberate, in both
   entries below. Do not "complete" either without reading the reasoning:
   - **Professional income typed straight into `Transactions` is not detected, and cannot be.** The
     detection reads `"Invoices"`, and it works by comparing two dates. A hand-typed income row —
     every 2023 import, for one — **has no issue date at all**: there is no second date to disagree
     with the payment date, so no disagreement exists to compute. This is *unknowable*, not
     unimplemented, and inferring an issue date from a description or a category would be
     manufacturing the very figure the alert exists to protect. Those rows are booked on their cash
     date, and the only real fix is upstream — invoice them through the invoice module.
   - **The alert warns; it does not enforce.** Nothing stops a modelo being recorded with the bank
     figure anyway. That is the scope of the whole document: the app computes what goes in AEAT's
     forms and makes a disagreement visible, and a filed modelo outranks a recomputation.
   - **Recovering the IVA of an uncollected invoice is a clock, not an action.** The art. 80.Cuatro
     module detects windows and lists the formalities; it generates no rectificativa and files no
     952 (§ Créditos incobrables). For this portfolio it is expected to be **empty** — the article
     does not reach invoices with no Spanish output VAT — and that is the correct answer, not a gap.
     What *is* a gap: the detection is covered by 24 tests, but **the route, the hook and the card
     are not**. The untested behaviour that will run on the live database every single time is
     precisely the emptiest one — the excluded list expanding itself and naming the reason when
     `tracked` is empty — so it is the one worth pinning first.
4. **Deferrals: booked, cancellable, and deliberately not accrued day by day.** The resolution, the
   three-way split, the verification and the cancellation are implemented (§ Aplazamientos y
   fraccionamientos). Four things are **decisions**, not omissions:
   - **A fracción's interés is booked whole on its vencimiento, on purpose.** AEAT liquidates the
     interest *per fracción* and it falls due at that vencimiento (art. 53 RGR), so booking it there
     is defensible and standard. A strict devengo reading would spread it over the days it accrues —
     a fracción due in January 2027 accrues from July 2026 — and on the live data that would move
     roughly **20 €** between the 2026 and the 2027 Renta. Which treatment is better is genuinely
     arguable, the amount is small, and the letter's own calendar is what the user is paying.
     **Leave the behaviour alone** unless the argument itself has been settled.
   - **No matching of a bank charge back to a fracción, because there is no bank feed.** The app
     ingests no statements; there is nothing to match against. Marking a pending movement paid
     already works and is the whole mechanism. Building a matcher would mean building an importer
     first, which is a different product.
   - **One deferred modelo per resolution.** All three of the user's letters carry exactly one, and a
     multi-liquidación letter has never occurred. Generalising the model for a case nobody has seen
     would complicate the import, the verification and the ANEXO I rebuild against a guess about
     what such a letter looks like. Today one is transcribed in full but comes back with
     `liquidacionNumber: null` and a capped confidence, for a human to sort out — which is the right
     behaviour for something unverified.
   - **No recalculation after apremio.** Missing an instalment sends the remaining deuda to the
     período ejecutivo and voids the calendar; AEAT then issues its own new figures. The app has no
     way to derive them, so the answer is to cancel the resolution and import what AEAT actually
     sent. The letter is a snapshot of what was granted, not a live plan.
5. **Madrid only.** Adding a comunidad means an entry in `IRPF_REGION` plus its bracket table in
   the `regionalScale` of every year of `IRPF_YEAR_FIGURES`; nothing else in the code assumes a
   single region.

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
| Modificación de la base imponible por créditos incobrables: plazos, requisitos y exclusiones | Art. 80.Cuatro y 80.Cinco Ley 37/1992, redacción del art. 77 Ley 31/2022 (vigente 1-1-2023) |
| Volumen de operaciones — the PYME six-month option | Art. 121 Ley 37/1992; umbral 6.010.121,04 € |
| Devengo en prestaciones de servicios (what `InvoiceDate` approximates) | Art. 75.Uno.2.º y 75.Dos Ley 37/1992 |
| Comunicación a la AEAT de la modificación: un mes, vía electrónica, documentación | Art. 24 RD 1624/1992 (RIVA), redacción del RD 1171/2023 (vigente 1-1-2024) — **modelo 952**, procedimiento AEAT G416 |
| Expedición de la factura rectificativa | Art. 15 RD 1619/2012 (Reglamento de facturación) |
| «Cualquier otro medio que acredite fehacientemente la reclamación» — qué exige | DGT V0206-23, de 09-02-2023 (y V0209-23, V0212-23) |
| Prueba de la remisión de la rectificativa al destinatario | STS 371/2025, de 31 de marzo (ECLI:ES:TS:2025:1614) |
| Los requisitos del 80.Cuatro son sustantivos, y compatibles con el art. 90 de la Directiva 2006/112/CE | TEAC 00/05698/2023, de 13-05-2025 (sobre la redacción anterior) |
| Plazos por meses, de fecha a fecha, y el mes sin día equivalente | Art. 5.1 Código Civil |
| Deduction of input VAT, affectation | Art. 95 Ley 37/1992; consulta V2554-23; TEAC 6654/2022 |
| Compensation quotas expire after four years | Art. 99.5 Ley 37/1992 |
| A deadline on a día inhábil runs to the next working day | Art. 30.5 Ley 39/2015 |
| Recargo de apremio is not a deductible expense | Art. 15.c Ley 27/2014 (LIS) |
| Intereses de demora tributarios are a **financial** expense, and deductible | DGT V4080-15; STS 150/2021, de 8 de febrero |
| Interés de demora: tipo = interés legal × 1,25, fixed by the Ley de Presupuestos | Art. 26.6 Ley 58/2003 (LGT) |
| Cálculo de intereses de un fraccionamiento, fracción by fracción | Art. 53 RD 939/2005 (RGR) |
| Vencimientos of a fraccionamiento fall on the 5th or the 20th | Art. 45.2 RD 939/2005 (RGR) |

---

## Related documentation

- [DATA_MODELS.md](DATA_MODELS.md) — the tables, views and TypeScript types named above
- [API_REFERENCE.md](API_REFERENCE.md) — the fiscal endpoints and their payloads
- [ARCHITECTURE.md](ARCHITECTURE.md) — where the fiscal module sits in the app
