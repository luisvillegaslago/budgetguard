---
description: "Audit monetary value handling across the codebase. Detects violations of the money-as-cents pattern: decimal storage, client-side arithmetic on money, missing eurosToCents/centsToEuros conversions. Use when the user says 'money check', 'audit money', 'check cents', or 'validate financial code'."
user-invocable: true
context: fork
agent: Explore
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Money Check — Financial Code Auditor

Scans the BudgetGuard codebase for violations of the money-as-integers (cents) pattern. All monetary values must be stored and transmitted as integers (cents), converted to display units only at the presentation layer.

## Audit Procedure

### 1. Scan for Decimal Money Storage

Search for patterns that suggest money stored as decimals:

```
Grep: amount\s*[:=]\s*\d+\.\d+     (hardcoded decimal amounts)
Grep: parseFloat.*amount             (parsing money as float)
Grep: Number.*amount                 (converting money without cents helper)
Grep: \.toFixed\(2\)                 (formatting that suggests decimal money)
```

Exclude files: `*.test.*`, `*.spec.*`, `node_modules/`, `.next/`

### 2. Scan for Client-Side Money Arithmetic

Search for sum/calculation patterns that should be in SQL Views:

```
Grep: \.reduce\(.*amount              (summing amounts in JS)
Grep: \.reduce\(.*cents               (acceptable only in display formatting)
Grep: amount\s*[+\-*/]\s*            (arithmetic on amount fields)
Grep: Math\.(round|floor|ceil).*amount (rounding money values)
```

Cross-reference with `vw_MonthlySummary` and `vw_MonthlyBalance` — if the calculation exists in a SQL View, it should NOT be duplicated in JavaScript.

### 3. Verify Conversion Usage

Check that `eurosToCents` and `centsToEuros` from `@/utils/money` are used at system boundaries:

**Inbound (user input → DB):** Every form submission or API POST handling money must call `eurosToCents` before saving.
**Outbound (DB → display):** Every money value rendered in UI must pass through `centsToEuros` or `formatCurrency`.

```
Grep: eurosToCents   (should appear in form handlers and API routes)
Grep: centsToEuros   (should appear in display components and hooks)
Grep: formatCurrency  (should appear in UI components)
```

### 4. Verify Database Schema Compliance

Read `database/schema.sql` and check:
- All money columns use `INT` type (not `DECIMAL`, `FLOAT`, or `MONEY`)
- Column names for money include `Cents` suffix (e.g., `AmountCents`)

### 5. Verify Constants Usage

Check that money-related code uses constants from `@/constants/finance.ts`:
```
Grep: 'income'|'expense'   (should use TRANSACTION_TYPE.INCOME / EXPENSE)
Grep: queryKey.*transaction (should use QUERY_KEY.TRANSACTIONS)
```

Exclude: `finance.ts` itself, translation files, test files.

## Output Format

```
MONEY AUDIT REPORT
==================

Violations Found: X

[CRITICAL] src/path/file.ts:42 — Decimal money storage
  Amount stored as float instead of cents integer
  → Use eurosToCents(userInput) before saving

[WARN] src/path/component.tsx:15 — Client-side money sum
  .reduce() calculates total that exists in vw_MonthlySummary
  → Use useMonthlySummary() hook instead

[OK] Conversion helpers properly used at 12 locations
[OK] Database schema uses INT for all money columns
[OK] Constants used for type literals

Summary: X violations, Y warnings, Z files scanned
```
