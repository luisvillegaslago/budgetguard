# BudgetGuard API Reference

## Overview

BudgetGuard uses a REST API built with Next.js 16 App Router. All endpoints follow consistent patterns for requests and responses.

### Base URL
```
/api
```

### Response Format

All endpoints return JSON with this structure:

```typescript
// Success response
{
  "success": true,
  "data": { ... },
  "meta": { ... }  // Optional metadata (pagination, counts)
}

// Error response (error values are i18n keys, translated client-side)
{
  "success": false,
  "error": "api-error.not-found.transaction",  // i18n key from API_ERROR constants
  "errors": {      // Validation errors (optional)
    "fieldName": ["validation.category-required"]  // i18n keys from VALIDATION_KEY constants
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 404 | Not Found |
| 409 | Conflict (referential integrity violation) |
| 500 | Internal Server Error |

### Money Handling Convention

All monetary values follow a **euros-in, cents-stored, cents-out** convention:

| Direction | Format | Example |
|-----------|--------|---------|
| **API Input** (request body) | Euros as decimal | `"amount": 419.28` |
| **Storage** (database) | Integer cents | `AmountCents = 41928` |
| **API Output** (response) | Integer cents | `"amountCents": 41928` |

To convert output back to euros: `amountCents / 100`. See [Money Handling](#money-handling) for details.

### Shared Expense Convention

Transactions and recurring expenses support **shared expenses** (split between two people). When `isShared` is `true`:

- The full amount is converted to cents, then halved using `Math.ceil()` (rounding up to ensure the user's portion covers rounding)
- `sharedDivisor` is set to `2` (vs `1` for personal)
- `originalAmountCents` stores the full amount before halving
- `amountCents` stores the effective halved amount

Example: `amount: 101.00` with `isShared: true` results in `amountCents: 5050` (not 5100), `originalAmountCents: 10100`, `sharedDivisor: 2`.

---

## Endpoints

### Categories

#### `GET /api/categories`

List all categories, optionally filtered by type. Supports flat or hierarchical (tree) output.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `type` | `income` \| `expense` | No | all | Filter by transaction type |
| `hierarchical` | `true` \| `false` | No | `false` | Return as tree (parents with nested `subcategories[]`) |
| `includeInactive` | `true` \| `false` | No | `false` | Include deactivated categories |

**Example Request (flat):**
```bash
GET /api/categories?type=expense
```

**Example Response (flat):**
```json
{
  "success": true,
  "data": [
    {
      "categoryId": 1,
      "name": "Vivienda",
      "type": "expense",
      "icon": "home",
      "color": "#4F46E5",
      "sortOrder": 1,
      "isActive": true,
      "parentCategoryId": null,
      "defaultShared": false
    },
    {
      "categoryId": 10,
      "name": "Alquiler",
      "type": "expense",
      "icon": "key",
      "color": "#6366F1",
      "sortOrder": 1,
      "isActive": true,
      "parentCategoryId": 1,
      "defaultShared": true
    }
  ]
}
```

**Example Request (hierarchical):**
```bash
GET /api/categories?type=expense&hierarchical=true
```

**Example Response (hierarchical):**
```json
{
  "success": true,
  "data": [
    {
      "categoryId": 1,
      "name": "Vivienda",
      "type": "expense",
      "icon": "home",
      "color": "#4F46E5",
      "sortOrder": 1,
      "isActive": true,
      "parentCategoryId": null,
      "defaultShared": false,
      "subcategories": [
        {
          "categoryId": 10,
          "name": "Alquiler",
          "type": "expense",
          "icon": "key",
          "color": "#6366F1",
          "sortOrder": 1,
          "isActive": true,
          "parentCategoryId": 1,
          "defaultShared": true
        }
      ]
    }
  ]
}
```

---

#### `GET /api/categories/:id`

Get a single category by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Category ID |

**Example Response:**
```json
{
  "success": true,
  "data": {
    "categoryId": 1,
    "name": "Vivienda",
    "type": "expense",
    "icon": "home",
    "color": "#4F46E5",
    "sortOrder": 1,
    "isActive": true,
    "parentCategoryId": null,
    "defaultShared": false
  }
}
```

---

#### `POST /api/categories`

Create a new category. Supports subcategories via `parentCategoryId`.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Category name (1-100 chars) |
| `type` | `income` \| `expense` | Yes | - | Transaction type |
| `icon` | string \| null | No | `null` | Lucide icon name (max 50 chars) |
| `color` | string \| null | No | `null` | Hex color (e.g., `#4F46E5`) |
| `sortOrder` | number | No | `0` | Display order |
| `parentCategoryId` | number \| null | No | `null` | Parent category ID (creates a subcategory) |
| `defaultShared` | boolean | No | `false` | Whether transactions in this category default to shared |
| `defaultVatPercent` | number \| null | No | `null` | Default VAT percentage for transactions in this category (0-100). Used by fiscal module |
| `defaultDeductionPercent` | number \| null | No | `null` | Default tax deduction percentage for transactions in this category (0-100). Used by fiscal module |

**Example Request:**
```json
{
  "name": "Alquiler",
  "type": "expense",
  "icon": "key",
  "color": "#6366F1",
  "sortOrder": 1,
  "parentCategoryId": 1,
  "defaultShared": true
}
```

**Example Response (201):**
```json
{
  "success": true,
  "data": {
    "categoryId": 10,
    "name": "Alquiler",
    "type": "expense",
    "icon": "key",
    "color": "#6366F1",
    "sortOrder": 1,
    "isActive": true,
    "parentCategoryId": 1,
    "defaultShared": true
  }
}
```

---

#### `PUT /api/categories/:id`

Update an existing category. All fields are optional. Note: `type` and `parentCategoryId` are immutable after creation.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Category ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Category name (1-100 chars) |
| `icon` | string \| null | No | Lucide icon name |
| `color` | string \| null | No | Hex color |
| `sortOrder` | number | No | Display order |
| `isActive` | boolean | No | Activate/deactivate the category |
| `defaultShared` | boolean | No | Default shared status |
| `defaultVatPercent` | number \| null | No | Default VAT percentage (0-100) |
| `defaultDeductionPercent` | number \| null | No | Default tax deduction percentage (0-100) |

**Example Request:**
```json
{
  "name": "Vivienda (actualizado)",
  "defaultShared": true
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "categoryId": 1,
    "name": "Vivienda (actualizado)",
    "type": "expense",
    "icon": "home",
    "color": "#4F46E5",
    "sortOrder": 1,
    "isActive": true,
    "parentCategoryId": null,
    "defaultShared": true
  }
}
```

---

#### `DELETE /api/categories/:id`

Delete a category (hard delete). Fails with `409 Conflict` if the category has existing transactions or subcategories.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Category ID |

**Success Response:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

**Error Response (409 - has transactions):**
```json
{
  "success": false,
  "error": "has-transactions",
  "count": 5
}
```

**Error Response (409 - has subcategories):**
```json
{
  "success": false,
  "error": "has-subcategories",
  "count": 3
}
```

---

### Transactions

#### `GET /api/transactions`

List transactions for a specific month. Each transaction includes joined `category` and `parentCategory` objects.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `month` | string | No | Current month | Month in `YYYY-MM` format |
| `type` | `income` \| `expense` | No | all | Filter by transaction type |
| `categoryId` | number | No | all | Filter by category |

**Example Request:**
```bash
GET /api/transactions?month=2025-01&type=expense
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "transactionId": 1,
      "categoryId": 10,
      "category": {
        "categoryId": 10,
        "name": "Alquiler",
        "type": "expense",
        "icon": "key",
        "color": "#6366F1",
        "sortOrder": 0,
        "isActive": true,
        "parentCategoryId": 1,
        "defaultShared": false
      },
      "parentCategory": {
        "categoryId": 1,
        "name": "Vivienda"
      },
      "amountCents": 41928,
      "description": "Alquiler enero",
      "transactionDate": "2025-01-01",
      "type": "expense",
      "sharedDivisor": 2,
      "originalAmountCents": 83856,
      "recurringExpenseId": 3,
      "transactionGroupId": null,
      "createdAt": "2025-01-01T10:00:00.000Z",
      "updatedAt": "2025-01-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "month": "2025-01",
    "count": 1
  }
}
```

**Transaction Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `transactionId` | number | Unique ID |
| `categoryId` | number | Category FK |
| `category` | object | Joined category details |
| `parentCategory` | object \| null | Parent category (if subcategory), contains `categoryId` and `name` |
| `amountCents` | number | Effective amount in cents (halved if shared) |
| `description` | string \| null | Description text |
| `transactionDate` | string | ISO date (`YYYY-MM-DD`) |
| `type` | `income` \| `expense` | Transaction type |
| `sharedDivisor` | number | `1` = personal, `2` = shared |
| `originalAmountCents` | number \| null | Full amount before halving (null if personal) |
| `recurringExpenseId` | number \| null | FK to RecurringExpenses (if created from a recurring rule) |
| `transactionGroupId` | number \| null | FK to TransactionGroups (if part of a group) |
| `tripId` | number \| null | FK to Trips (if part of a trip) |
| `tripName` | string \| null | Trip name (joined from Trips table) |
| `createdAt` | string | ISO datetime |
| `updatedAt` | string | ISO datetime |

---

#### `POST /api/transactions`

Create a new transaction.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `categoryId` | number | Yes | - | Category ID |
| `amount` | number | Yes | - | Amount in **euros** (e.g., `419.28`) |
| `description` | string | No | `""` | Description (max 255 chars) |
| `transactionDate` | string | Yes | - | Date in ISO format |
| `type` | `income` \| `expense` | Yes | - | Transaction type |
| `isShared` | boolean | No | `false` | If true, amount is halved (ceil) for storage |
| `vatPercent` | number \| null | No | `null` | VAT percentage applied to this transaction (0-100). Used by fiscal module |
| `deductionPercent` | number \| null | No | `null` | Tax deduction percentage for this transaction (0-100). Used by fiscal module |
| `vendorName` | string \| null | No | `null` | Vendor/supplier name for fiscal tracking (max 255 chars) |
| `invoiceNumber` | string \| null | No | `null` | Invoice or receipt reference number (max 100 chars) |

**Example Request (personal):**
```json
{
  "categoryId": 2,
  "amount": 45.50,
  "description": "Compra semanal",
  "transactionDate": "2025-01-15",
  "type": "expense"
}
```

**Example Response (201):**
```json
{
  "success": true,
  "data": {
    "transactionId": 42,
    "categoryId": 2,
    "category": {
      "categoryId": 2,
      "name": "Supermercado",
      "type": "expense",
      "icon": "shopping-cart",
      "color": "#10B981",
      "sortOrder": 0,
      "isActive": true,
      "parentCategoryId": null,
      "defaultShared": false
    },
    "parentCategory": null,
    "amountCents": 4550,
    "description": "Compra semanal",
    "transactionDate": "2025-01-15",
    "type": "expense",
    "sharedDivisor": 1,
    "originalAmountCents": null,
    "recurringExpenseId": null,
    "transactionGroupId": null,
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**Example Request (shared):**
```json
{
  "categoryId": 1,
  "amount": 838.56,
  "description": "Alquiler enero",
  "transactionDate": "2025-01-01",
  "type": "expense",
  "isShared": true
}
```

**Example Response (201, shared):**
```json
{
  "success": true,
  "data": {
    "transactionId": 43,
    "categoryId": 1,
    "amountCents": 41928,
    "originalAmountCents": 83856,
    "sharedDivisor": 2,
    "..."
  }
}
```

**Important:** Send `amount` in euros. The API converts to cents. When `isShared` is true, `amountCents = Math.ceil(eurosToCents(amount) / 2)`.

---

#### `GET /api/transactions/:id`

Get a single transaction by ID. Returns the same full object shape as the list endpoint.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Transaction ID |

**Example Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": 1,
    "categoryId": 10,
    "category": { "..." },
    "parentCategory": { "categoryId": 1, "name": "Vivienda" },
    "amountCents": 41928,
    "description": "Alquiler enero",
    "transactionDate": "2025-01-01",
    "type": "expense",
    "sharedDivisor": 2,
    "originalAmountCents": 83856,
    "recurringExpenseId": 3,
    "transactionGroupId": null,
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-01-01T10:00:00.000Z"
  }
}
```

---

#### `PUT /api/transactions/:id`

Update an existing transaction. All fields are optional. Shared expense logic is recalculated when `amount` or `isShared` changes.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Transaction ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categoryId` | number | No | Category ID |
| `amount` | number | No | Amount in **euros** |
| `description` | string | No | Description |
| `transactionDate` | string | No | Date in ISO format |
| `type` | `income` \| `expense` | No | Transaction type |
| `isShared` | boolean | No | Shared flag (recalculates amount) |
| `vatPercent` | number \| null | No | VAT percentage (0-100) |
| `deductionPercent` | number \| null | No | Tax deduction percentage (0-100) |
| `vendorName` | string \| null | No | Vendor/supplier name |
| `invoiceNumber` | string \| null | No | Invoice or receipt reference |

**Shared Update Behavior:**

- If `amount` is provided with `isShared`, the new amount is halved
- If only `isShared` changes (no new `amount`), the existing base amount (`originalAmountCents` or `amountCents`) is used to recalculate

**Example Request:**
```json
{
  "amount": 450.00,
  "description": "Alquiler enero (actualizado)"
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": 1,
    "categoryId": 10,
    "amountCents": 45000,
    "description": "Alquiler enero (actualizado)",
    "transactionDate": "2025-01-01",
    "type": "expense",
    "sharedDivisor": 1,
    "originalAmountCents": null,
    "recurringExpenseId": null,
    "transactionGroupId": null,
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-01-02T15:30:00.000Z",
    "..."
  }
}
```

---

#### `DELETE /api/transactions/:id`

Delete a transaction. If the transaction belongs to a transaction group, and that group becomes empty after deletion, the orphaned group row is automatically cleaned up.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Transaction ID |

**Example Response:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

**Orphan Cleanup:** When the deleted transaction had a `transactionGroupId`, the API checks if any other transactions still reference that group. If none remain, the `TransactionGroups` row is deleted automatically.

---

### Transaction Groups

Transaction groups allow creating multiple linked transactions in a single atomic operation. All transactions in a group share the same `TransactionGroupID`, description, date, and type. Each item targets a different subcategory.

#### `POST /api/transaction-groups`

Create a group of linked transactions. Uses a database transaction for atomicity.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `description` | string | Yes | - | Shared description for all transactions (1-255 chars) |
| `transactionDate` | string | Yes | - | Date in ISO format |
| `type` | `income` \| `expense` | Yes | - | Transaction type (all items share this) |
| `isShared` | boolean | No | `false` | If true, each item's amount is halved |
| `parentCategoryId` | number | Yes | - | Parent category ID (logical grouping) |
| `items` | array | Yes | - | 1-20 items, each with `categoryId` and `amount` |

**Items Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categoryId` | number | Yes | Subcategory ID for this line item |
| `amount` | number | Yes | Amount in **euros** for this line item |

**Balanced Rounding (shared groups):** When `isShared` is true and there are multiple items, each item is individually halved with `Math.ceil()`. This can cause the sum of halved items to exceed the halved total. The last item absorbs the rounding difference so that `sum(amountCents) == Math.ceil(totalFullCents / 2)`.

**Example Request:**
```json
{
  "description": "Cena restaurante",
  "transactionDate": "2025-01-20",
  "type": "expense",
  "isShared": true,
  "parentCategoryId": 4,
  "items": [
    { "categoryId": 11, "amount": 18.50 },
    { "categoryId": 12, "amount": 7.30 },
    { "categoryId": 13, "amount": 3.20 }
  ]
}
```

**Example Response (201):**
```json
{
  "success": true,
  "data": [
    {
      "transactionId": 100,
      "categoryId": 11,
      "category": { "categoryId": 11, "name": "Comida", "..." },
      "parentCategory": { "categoryId": 4, "name": "Restaurantes" },
      "amountCents": 925,
      "description": "Cena restaurante",
      "transactionDate": "2025-01-20",
      "type": "expense",
      "sharedDivisor": 2,
      "originalAmountCents": 1850,
      "transactionGroupId": 7,
      "..."
    },
    {
      "transactionId": 101,
      "categoryId": 12,
      "amountCents": 365,
      "originalAmountCents": 730,
      "transactionGroupId": 7,
      "..."
    },
    {
      "transactionId": 102,
      "categoryId": 13,
      "amountCents": 160,
      "originalAmountCents": 320,
      "transactionGroupId": 7,
      "..."
    }
  ]
}
```

---

#### `PATCH /api/transaction-groups/:id`

Update a transaction group's description and/or date. Changes propagate to all transactions in the group.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Transaction Group ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | New description (1-255 chars) |
| `transactionDate` | string | No | New date in ISO format |

**Example Request:**
```json
{
  "description": "Cena restaurante (corregido)",
  "transactionDate": "2025-01-21"
}
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "transactionId": 100,
      "description": "Cena restaurante (corregido)",
      "transactionDate": "2025-01-21",
      "transactionGroupId": 7,
      "..."
    },
    {
      "transactionId": 101,
      "description": "Cena restaurante (corregido)",
      "transactionDate": "2025-01-21",
      "transactionGroupId": 7,
      "..."
    }
  ]
}
```

---

#### `DELETE /api/transaction-groups/:id`

Delete an entire transaction group and all its transactions atomically (uses SQL transaction).

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Transaction Group ID |

**Example Response:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

### Recurring Expenses

Recurring expenses define rules for expenses that repeat on a schedule. The system generates "occurrences" that users can confirm (creating a real transaction) or skip.

#### `GET /api/recurring-expenses`

List recurring expense rules, optionally filtered by active status.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `isActive` | `true` \| `false` | No | all | Filter by active status |

**Example Request:**
```bash
GET /api/recurring-expenses?isActive=true
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "recurringExpenseId": 1,
      "categoryId": 10,
      "category": {
        "categoryId": 10,
        "name": "Alquiler",
        "type": "expense",
        "icon": "key",
        "color": "#6366F1",
        "sortOrder": 0,
        "isActive": true,
        "parentCategoryId": 1,
        "defaultShared": false
      },
      "amountCents": 41928,
      "description": "Alquiler mensual",
      "frequency": "monthly",
      "dayOfWeek": null,
      "dayOfMonth": 1,
      "monthOfYear": null,
      "startDate": "2025-01-01",
      "endDate": null,
      "isActive": true,
      "sharedDivisor": 2,
      "originalAmountCents": 83856,
      "createdAt": "2025-01-01T10:00:00.000Z",
      "updatedAt": "2025-01-01T10:00:00.000Z"
    }
  ],
  "meta": { "count": 1 }
}
```

**Recurring Expense Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `recurringExpenseId` | number | Unique ID |
| `categoryId` | number | Category FK |
| `category` | object | Joined category details |
| `amountCents` | number | Effective amount in cents (halved if shared) |
| `description` | string \| null | Description text |
| `frequency` | `weekly` \| `monthly` \| `yearly` | Recurrence frequency |
| `dayOfWeek` | number \| null | 0-6 (Sun-Sat), required for `weekly` |
| `dayOfMonth` | number \| null | 1-31, required for `monthly` and `yearly` |
| `monthOfYear` | number \| null | 1-12, required for `yearly` |
| `startDate` | string | ISO date when the rule starts |
| `endDate` | string \| null | ISO date when the rule ends (null = indefinite) |
| `isActive` | boolean | Whether the rule is active |
| `sharedDivisor` | number | `1` = personal, `2` = shared |
| `originalAmountCents` | number \| null | Full amount before halving |
| `createdAt` | string | ISO datetime |
| `updatedAt` | string | ISO datetime |

---

#### `GET /api/recurring-expenses/:id`

Get a single recurring expense by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Recurring Expense ID |

**Example Response:**
```json
{
  "success": true,
  "data": {
    "recurringExpenseId": 1,
    "categoryId": 10,
    "category": { "..." },
    "amountCents": 41928,
    "description": "Alquiler mensual",
    "frequency": "monthly",
    "dayOfMonth": 1,
    "..."
  }
}
```

---

#### `POST /api/recurring-expenses`

Create a new recurring expense rule. Conditional validation applies based on frequency.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `categoryId` | number | Yes | - | Category ID |
| `amount` | number | Yes | - | Amount in **euros** |
| `description` | string | No | `""` | Description (max 255 chars) |
| `frequency` | `weekly` \| `monthly` \| `yearly` | Yes | - | Recurrence frequency |
| `dayOfWeek` | number \| null | Conditional | `null` | 0-6 (Sun-Sat). **Required for `weekly`** |
| `dayOfMonth` | number \| null | Conditional | `null` | 1-31. **Required for `monthly` and `yearly`** |
| `monthOfYear` | number \| null | Conditional | `null` | 1-12. **Required for `yearly`** |
| `startDate` | string | Yes | - | Start date in ISO format |
| `endDate` | string \| null | No | `null` | End date in ISO format (null = indefinite) |
| `isShared` | boolean | No | `false` | If true, amount is halved |

**Frequency Validation Rules:**

| Frequency | Required Fields |
|-----------|----------------|
| `weekly` | `dayOfWeek` |
| `monthly` | `dayOfMonth` |
| `yearly` | `dayOfMonth` + `monthOfYear` |

**Example Request:**
```json
{
  "categoryId": 10,
  "amount": 838.56,
  "description": "Alquiler mensual",
  "frequency": "monthly",
  "dayOfMonth": 1,
  "startDate": "2025-01-01",
  "isShared": true
}
```

**Example Response (201):**
```json
{
  "success": true,
  "data": {
    "recurringExpenseId": 1,
    "categoryId": 10,
    "category": { "..." },
    "amountCents": 41928,
    "description": "Alquiler mensual",
    "frequency": "monthly",
    "dayOfWeek": null,
    "dayOfMonth": 1,
    "monthOfYear": null,
    "startDate": "2025-01-01",
    "endDate": null,
    "isActive": true,
    "sharedDivisor": 2,
    "originalAmountCents": 83856,
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-01-01T10:00:00.000Z"
  }
}
```

---

#### `PUT /api/recurring-expenses/:id`

Update an existing recurring expense rule. All fields are optional.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Recurring Expense ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categoryId` | number | No | Category ID |
| `amount` | number | No | Amount in **euros** |
| `description` | string \| null | No | Description |
| `frequency` | `weekly` \| `monthly` \| `yearly` | No | Recurrence frequency |
| `dayOfWeek` | number \| null | No | 0-6 (Sun-Sat) |
| `dayOfMonth` | number \| null | No | 1-31 |
| `monthOfYear` | number \| null | No | 1-12 |
| `startDate` | string | No | Start date |
| `endDate` | string \| null | No | End date |
| `isShared` | boolean | No | Shared flag (recalculates amount when `amount` also provided) |
| `isActive` | boolean | No | Activate/deactivate the rule |

**Example Request:**
```json
{
  "amount": 900.00,
  "isShared": true
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "recurringExpenseId": 1,
    "amountCents": 45000,
    "originalAmountCents": 90000,
    "sharedDivisor": 2,
    "..."
  }
}
```

---

#### `DELETE /api/recurring-expenses/:id`

Soft-delete a recurring expense (sets `isActive = false`). The rule and its history are preserved.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Recurring Expense ID |

**Example Response:**
```json
{
  "success": true
}
```

---

#### `GET /api/recurring-expenses/pending`

Get all pending occurrences. This endpoint is retroactive: it calculates expected dates for all active rules from their `startDate` to the current month, creates `pending` occurrence records for any missing dates, and returns all pending occurrences grouped by month.

**Example Request:**
```bash
GET /api/recurring-expenses/pending
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "months": [
      {
        "month": "2025-01",
        "occurrences": [
          {
            "occurrenceId": 1,
            "recurringExpenseId": 1,
            "occurrenceDate": "2025-01-01",
            "status": "pending",
            "transactionId": null,
            "modifiedAmountCents": null,
            "processedAt": null,
            "recurringExpense": {
              "recurringExpenseId": 1,
              "categoryId": 10,
              "category": { "..." },
              "amountCents": 41928,
              "description": "Alquiler mensual",
              "frequency": "monthly",
              "..."
            }
          }
        ],
        "totalPendingCents": 41928,
        "count": 1
      },
      {
        "month": "2025-02",
        "occurrences": [ "..." ],
        "totalPendingCents": 41928,
        "count": 1
      }
    ],
    "totalCount": 2
  }
}
```

**Occurrence Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `occurrenceId` | number | Unique occurrence ID |
| `recurringExpenseId` | number | FK to the recurring expense rule |
| `occurrenceDate` | string | ISO date of this occurrence |
| `status` | `pending` \| `confirmed` \| `skipped` | Current status |
| `transactionId` | number \| null | FK to created transaction (when confirmed) |
| `modifiedAmountCents` | number \| null | Overridden amount (if changed during confirmation) |
| `processedAt` | string \| null | ISO datetime when confirmed/skipped |
| `recurringExpense` | object | Full recurring expense object with category |

---

#### `POST /api/recurring-expenses/occurrences/:id/confirm`

Confirm a pending occurrence, creating a real transaction. Optionally override the amount.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Occurrence ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `modifiedAmount` | number | No | Override amount in **euros** (if different from rule) |

**Example Request (use default amount):**
```json
{}
```

**Example Request (override amount):**
```json
{
  "modifiedAmount": 450.00
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "occurrenceId": 1,
    "recurringExpenseId": 1,
    "occurrenceDate": "2025-01-01",
    "status": "confirmed",
    "transactionId": 55,
    "modifiedAmountCents": null,
    "processedAt": "2025-01-15T08:30:00.000Z",
    "recurringExpense": { "..." }
  }
}
```

**Behavior:** Creates a transaction with the recurring expense's category, description, shared settings, and links it via `recurringExpenseId`. The occurrence status is updated to `confirmed` with the created transaction's ID.

**Errors:**
- `500` if occurrence not found or not in `pending` status

---

#### `POST /api/recurring-expenses/occurrences/:id/skip`

Skip a pending occurrence. No transaction is created.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Occurrence ID |

**Request Body:** None (empty body or `{}`)

**Example Response:**
```json
{
  "success": true
}
```

**Error Response (404 - not found or already processed):**
```json
{
  "success": false,
  "error": "Ocurrencia no encontrada o ya procesada"
}
```

---

### Trips

Trips allow multi-day, multi-category travel expense tracking. Trip expenses are regular transactions linked to a trip via `TripID`. Categories for trip expenses come from subcategories of the "Viajes" parent category.

#### `GET /api/trips`

List all trips with aggregated summary data (expense count, total, date range, category breakdown).

**Example Request:**
```bash
GET /api/trips
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "tripId": 1,
      "name": "Sierra Nevada 2025",
      "createdAt": "2025-10-01T10:00:00.000Z",
      "updatedAt": "2025-10-01T10:00:00.000Z",
      "expenseCount": 4,
      "totalCents": 21250,
      "startDate": "2025-10-15",
      "endDate": "2025-10-17",
      "categorySummary": [
        {
          "categoryId": 15,
          "categoryName": "Hotel",
          "categoryIcon": "bed",
          "categoryColor": "#8B5CF6",
          "totalCents": 12000,
          "count": 1
        },
        {
          "categoryId": 16,
          "categoryName": "Gasolina",
          "categoryIcon": "fuel",
          "categoryColor": "#F59E0B",
          "totalCents": 4500,
          "count": 1
        }
      ]
    }
  ]
}
```

**Trip Display Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `tripId` | number | Unique trip ID |
| `name` | string | Trip name |
| `expenseCount` | number | Number of expenses in this trip |
| `totalCents` | number | Sum of all expense `amountCents` |
| `startDate` | string \| null | Earliest expense date (ISO date) |
| `endDate` | string \| null | Latest expense date (ISO date) |
| `categorySummary` | array | Breakdown by category with totals |

---

#### `POST /api/trips`

Create a new trip.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Trip name (1-100 chars) |

**Example Request:**
```json
{
  "name": "Sierra Nevada 2025"
}
```

**Example Response (201):**
```json
{
  "success": true,
  "data": {
    "tripId": 1,
    "name": "Sierra Nevada 2025",
    "createdAt": "2025-10-01T10:00:00.000Z",
    "updatedAt": "2025-10-01T10:00:00.000Z"
  }
}
```

---

#### `GET /api/trips/:id`

Get a single trip with full expense details and category summary.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Trip ID |

**Example Response:**
```json
{
  "success": true,
  "data": {
    "tripId": 1,
    "name": "Sierra Nevada 2025",
    "createdAt": "2025-10-01T10:00:00.000Z",
    "updatedAt": "2025-10-01T10:00:00.000Z",
    "expenses": [
      {
        "transactionId": 100,
        "categoryId": 15,
        "category": { "..." },
        "parentCategory": { "categoryId": 5, "name": "Viajes" },
        "amountCents": 12000,
        "description": "Hotel 2 noches",
        "transactionDate": "2025-10-15",
        "type": "expense",
        "sharedDivisor": 1,
        "tripId": 1,
        "tripName": "Sierra Nevada 2025",
        "..."
      }
    ],
    "categorySummary": [
      {
        "categoryId": 15,
        "categoryName": "Hotel",
        "categoryIcon": "bed",
        "categoryColor": "#8B5CF6",
        "totalCents": 12000,
        "count": 1
      }
    ],
    "totalCents": 21250,
    "expenseCount": 4
  }
}
```

---

#### `PATCH /api/trips/:id`

Update a trip's name.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Trip ID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | New trip name (1-100 chars) |

**Example Request:**
```json
{
  "name": "Sierra Nevada 2025 (updated)"
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "tripId": 1,
    "name": "Sierra Nevada 2025 (updated)",
    "createdAt": "2025-10-01T10:00:00.000Z",
    "updatedAt": "2025-10-15T08:30:00.000Z"
  }
}
```

---

#### `DELETE /api/trips/:id`

Delete a trip and all its linked transactions atomically (uses SQL transaction).

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Trip ID |

**Example Response:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

#### `POST /api/trips/:id/expenses`

Add an expense to a trip. All trip expenses are always of type `expense`.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Trip ID |

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `categoryId` | number | Yes | - | Category ID (typically a "Viajes" subcategory) |
| `amount` | number | Yes | - | Amount in **euros** |
| `description` | string | No | `""` | Description (max 255 chars) |
| `transactionDate` | string | Yes | - | Date in ISO format |
| `isShared` | boolean | No | `false` | If true, amount is halved |

**Example Request:**
```json
{
  "categoryId": 15,
  "amount": 120.00,
  "description": "Hotel 2 noches",
  "transactionDate": "2025-10-15",
  "isShared": false
}
```

**Example Response (201):**
```json
{
  "success": true,
  "data": {
    "transactionId": 100,
    "categoryId": 15,
    "category": { "..." },
    "parentCategory": { "categoryId": 5, "name": "Viajes" },
    "amountCents": 12000,
    "description": "Hotel 2 noches",
    "transactionDate": "2025-10-15",
    "type": "expense",
    "sharedDivisor": 1,
    "originalAmountCents": null,
    "tripId": 1,
    "tripName": "Sierra Nevada 2025",
    "..."
  }
}
```

---

#### `PUT /api/trips/:id/expenses/:expenseId`

Update a trip expense. All fields are optional.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Trip ID |
| `expenseId` | number | Transaction ID |

**Request Body:** Same as `POST /api/trips/:id/expenses` (all fields optional).

---

#### `DELETE /api/trips/:id/expenses/:expenseId`

Delete a trip expense.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Trip ID |
| `expenseId` | number | Transaction ID |

**Example Response:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

#### `GET /api/trips/categories`

Get subcategories under the "Viajes" parent category. Used to populate the trip expense form category selector.

**Example Request:**
```bash
GET /api/trips/categories
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "categoryId": 15,
      "name": "Hotel",
      "type": "expense",
      "icon": "bed",
      "color": "#8B5CF6",
      "sortOrder": 0,
      "isActive": true,
      "parentCategoryId": 5,
      "defaultShared": false
    },
    {
      "categoryId": 16,
      "name": "Gasolina",
      "type": "expense",
      "icon": "fuel",
      "color": "#F59E0B",
      "sortOrder": 1,
      "isActive": true,
      "parentCategoryId": 5,
      "defaultShared": false
    }
  ]
}
```

---

### Fiscal

Fiscal reports provide quarterly tax data for Spanish tax models (Modelo 303 for VAT and Modelo 130 for income tax). The endpoint aggregates transaction-level fiscal fields (`vatPercent`, `deductionPercent`, `vendorName`, `invoiceNumber`) into quarterly summaries.

#### `GET /api/fiscal`

Get fiscal report for a specific year and quarter. Returns Modelo 303 (VAT) summary, Modelo 130 (income tax) summary, deductible expenses, and invoiced transactions.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `year` | number | Yes | - | Fiscal year (e.g., `2025`) |
| `quarter` | number | Yes | - | Quarter number (1-4) |

**Example Request:**
```bash
GET /api/fiscal?year=2025&quarter=1
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "year": 2025,
    "quarter": 1,
    "modelo303": {
      "vatCollected": 152375,
      "vatDeductible": 89200,
      "vatBalance": 63175
    },
    "modelo130": {
      "grossIncome": 297500,
      "deductibleExpenses": 189200,
      "netIncome": 108300,
      "taxableBase": 108300,
      "taxAmount": 21660
    },
    "expenses": [
      {
        "transactionId": 42,
        "categoryId": 2,
        "categoryName": "Supermercado",
        "amountCents": 4550,
        "vatPercent": 21,
        "vatAmountCents": 955,
        "deductionPercent": 100,
        "deductibleAmountCents": 4550,
        "vendorName": "Mercadona",
        "invoiceNumber": "INV-2025-001",
        "transactionDate": "2025-01-15"
      }
    ],
    "invoices": [
      {
        "transactionId": 42,
        "vendorName": "Mercadona",
        "invoiceNumber": "INV-2025-001",
        "amountCents": 4550,
        "vatPercent": 21,
        "transactionDate": "2025-01-15"
      }
    ]
  }
}
```

**Fiscal Report Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `year` | number | Fiscal year |
| `quarter` | number | Quarter (1-4) |
| `modelo303` | object | VAT summary (collected, deductible, balance in cents) |
| `modelo130` | object | Income tax summary (gross, deductible, net, taxable base, tax amount in cents) |
| `expenses` | array | Deductible expense transactions with computed fiscal fields |
| `invoices` | array | Transactions that have an `invoiceNumber` set |

**Modelo 303 Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `vatCollected` | number | Total VAT collected on income transactions (cents) |
| `vatDeductible` | number | Total deductible VAT on expense transactions (cents) |
| `vatBalance` | number | Net VAT position: collected - deductible (cents) |

**Modelo 130 Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `grossIncome` | number | Total income for the quarter (cents) |
| `deductibleExpenses` | number | Total deductible expenses (cents) |
| `netIncome` | number | Gross income - deductible expenses (cents) |
| `taxableBase` | number | Base for 20% tax calculation (cents) |
| `taxAmount` | number | Estimated tax: 20% of taxable base (cents) |

---

### Summary

#### `GET /api/summary`

Get monthly summary with totals by category. Data comes from pre-calculated SQL views (`vw_MonthlyBalance` and `vw_MonthlySummary`) for optimal performance.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `month` | string | No | Current month | Month in `YYYY-MM` format |

**Example Request:**
```bash
GET /api/summary?month=2025-01
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "month": "2025-01",
    "incomeCents": 297500,
    "expenseCents": 152375,
    "balanceCents": 145125,
    "byCategory": [
      {
        "categoryId": 1,
        "categoryName": "Vivienda",
        "categoryIcon": "home",
        "categoryColor": "#4F46E5",
        "type": "expense",
        "totalCents": 41928,
        "transactionCount": 1
      },
      {
        "categoryId": 6,
        "categoryName": "Supermercado",
        "categoryIcon": "shopping-cart",
        "categoryColor": "#10B981",
        "type": "expense",
        "totalCents": 23491,
        "transactionCount": 4
      }
    ]
  }
}
```

**Conversion:**
- `incomeCents / 100` = Income in euros
- `expenseCents / 100` = Expenses in euros
- `balanceCents / 100` = Balance in euros (can be negative)

---

#### `GET /api/summary/subcategories`

Get subcategory breakdown for a specific parent category in a given month. Uses the `vw_SubcategorySummary` SQL view.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `month` | string | No | Current month | Month in `YYYY-MM` format |
| `categoryId` | number | Yes | - | Parent category ID to drill into |

**Example Request:**
```bash
GET /api/summary/subcategories?month=2025-01&categoryId=4
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "parentCategoryId": 4,
      "subcategoryId": 11,
      "subcategoryName": "Comida",
      "subcategoryIcon": "utensils",
      "subcategoryColor": "#F59E0B",
      "isSubcategory": true,
      "totalCents": 18500,
      "transactionCount": 3
    },
    {
      "parentCategoryId": 4,
      "subcategoryId": 12,
      "subcategoryName": "Bebidas",
      "subcategoryIcon": "wine",
      "subcategoryColor": "#EC4899",
      "isSubcategory": true,
      "totalCents": 7300,
      "transactionCount": 2
    }
  ]
}
```

**Subcategory Summary Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `parentCategoryId` | number | The parent category being drilled into |
| `subcategoryId` | number | Subcategory ID |
| `subcategoryName` | string | Subcategory name |
| `subcategoryIcon` | string \| null | Lucide icon name |
| `subcategoryColor` | string \| null | Hex color |
| `isSubcategory` | boolean | Whether this is a true subcategory (vs parent-level transactions) |
| `totalCents` | number | Total amount in cents for this subcategory |
| `transactionCount` | number | Number of transactions |

---

### Version

#### `GET /api/version`

Get application version and build information. Useful for debugging and deployment verification.

**Example Request:**
```bash
GET /api/version
```

**Example Response:**
```json
{
  "name": "budgetguard",
  "version": "0.0.1",
  "environment": "development",
  "gitHash": "a1b2c3d",
  "buildDate": "2025-02-07T12:00:00.000Z",
  "node": "v22.12.0"
}
```

### Companies

Companies represent clients and providers used across invoicing, fiscal documents, and transaction tracking. Each company has a `role` (`COMPANY_ROLE.CLIENT` or `COMPANY_ROLE.PROVIDER`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies` | List companies (supports `?isActive=true`, `?role=client\|provider`) |
| POST | `/api/companies` | Create company (full form or quick create with name only) |
| GET | `/api/companies/[id]` | Get single company |
| PUT | `/api/companies/[id]` | Update company |
| DELETE | `/api/companies/[id]` | Soft-delete company |
| GET | `/api/companies/[id]/transactions` | Get company transaction history (supports `?range=1y\|6m\|3m\|all`) |

#### `GET /api/companies`

List all companies, optionally filtered by active status and role.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `isActive` | `true` \| `false` | No | all | Filter by active status |
| `role` | `client` \| `provider` | No | all | Filter by company role |

**Example Request:**
```bash
GET /api/companies?role=client&isActive=true
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "companyId": 1,
      "name": "Acme Corp",
      "tradingName": null,
      "taxId": "B12345678",
      "address": "Calle Mayor 1",
      "city": "Madrid",
      "postalCode": "28001",
      "country": "Spain",
      "invoiceLanguage": "es",
      "role": "client",
      "isActive": true,
      "createdAt": "2025-03-01T10:00:00.000Z"
    }
  ]
}
```

#### `POST /api/companies`

Create a new company. Supports two modes:
- **Full create**: All fields validated via `CreateCompanySchema`
- **Quick create**: Body with only `{ name: "..." }` — uses `findOrCreateByName()` to deduplicate

**Request Body (full create):**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Company name (1-150 chars) |
| `tradingName` | string \| null | No | null | Trading/commercial name |
| `taxId` | string \| null | No | null | Tax identification number (NIF/CIF) |
| `address` | string \| null | No | null | Street address |
| `city` | string \| null | No | null | City |
| `postalCode` | string \| null | No | null | Postal code |
| `country` | string \| null | No | null | Country |
| `invoiceLanguage` | string \| null | No | null | Language code for invoices (e.g., `"es"`, `"en"`) |
| `role` | `COMPANY_ROLE.CLIENT` \| `COMPANY_ROLE.PROVIDER` | No | `COMPANY_ROLE.CLIENT` | Company role |

**Example Request (quick create):**
```json
{ "name": "Acme Corp" }
```

**Example Request (full create):**
```json
{
  "name": "Acme Corp",
  "taxId": "B12345678",
  "address": "Calle Mayor 1",
  "city": "Madrid",
  "postalCode": "28001",
  "country": "Spain",
  "role": "client"
}
```

**Response:** `201 Created` with company object.

#### `GET /api/companies/[id]`

Get a single company by ID.

**Example Response:**
```json
{
  "success": true,
  "data": {
    "companyId": 1,
    "name": "Acme Corp",
    "taxId": "B12345678",
    "role": "client",
    "isActive": true
  }
}
```

#### `PUT /api/companies/[id]`

Update a company. All fields are optional.

**Request Body:** Same fields as `POST` but all optional, plus:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `isActive` | boolean | No | Activate/deactivate company |

#### `DELETE /api/companies/[id]`

Soft-delete a company. Returns the number of transactions referencing this company.

**Example Response:**
```json
{
  "success": true,
  "data": { "deleted": true, "usageCount": 5 }
}
```

#### `GET /api/companies/[id]/transactions`

Get transaction history for a company within a date range, grouped by month.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `range` | `3m` \| `6m` \| `1y` \| `all` | No | `1y` | Date range preset (`DATE_RANGE_PRESET`) |

**Example Request:**
```bash
GET /api/companies/1/transactions?range=6m
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "company": { "companyId": 1, "name": "Acme Corp" },
    "dateFrom": "2025-09-14",
    "dateTo": "2026-03-14",
    "summary": {
      "totalCents": 150000,
      "transactionCount": 12
    },
    "months": [
      {
        "month": "2026-03",
        "totalCents": 25000,
        "transactionCount": 2,
        "transactions": [
          {
            "transactionId": 42,
            "amountCents": 15000,
            "description": "Monthly service",
            "transactionDate": "2026-03-01"
          }
        ]
      }
    ]
  }
}
```

---

### Billing Profile

Manages the user's billing profile used as the biller/sender on generated invoices. Supports a single profile per user (upsert semantics).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing-profile` | Get current user's billing profile |
| PUT | `/api/billing-profile` | Create or update billing profile (upsert) |

#### `GET /api/billing-profile`

Get the current user's billing profile. Returns `null` data if no profile exists.

**Example Response:**
```json
{
  "success": true,
  "data": {
    "profileId": 1,
    "fullName": "Luis Garcia",
    "nif": "12345678A",
    "address": "Calle Mayor 1, 28001 Madrid",
    "phone": "+34612345678",
    "paymentMethod": "bank_transfer",
    "bankName": "CaixaBank",
    "iban": "ES1234567890123456789012",
    "swift": "CAIXESBB",
    "bankAddress": null,
    "defaultHourlyRateCents": 5000
  }
}
```

#### `PUT /api/billing-profile`

Create or update the billing profile (upsert). If a profile exists, it is updated; otherwise, a new one is created.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fullName` | string | Yes | Full legal name (1-150 chars) |
| `nif` | string | Yes | Tax ID / NIF (1-30 chars) |
| `address` | string \| null | No | Full address |
| `phone` | string \| null | No | Phone number |
| `paymentMethod` | `PAYMENT_METHOD.BANK_TRANSFER` \| `PAYMENT_METHOD.PAYPAL` \| `PAYMENT_METHOD.OTHER` | Yes | Payment method |
| `bankName` | string \| null | No | Bank name |
| `iban` | string \| null | No | IBAN (max 34 chars) |
| `swift` | string \| null | No | SWIFT/BIC code (max 11 chars) |
| `bankAddress` | string \| null | No | Bank address |
| `defaultHourlyRateCents` | number \| null | No | Default hourly rate in cents for invoice line items |

**Example Request:**
```json
{
  "fullName": "Luis Garcia",
  "nif": "12345678A",
  "address": "Calle Mayor 1, 28001 Madrid",
  "paymentMethod": "bank_transfer",
  "bankName": "CaixaBank",
  "iban": "ES1234567890123456789012",
  "swift": "CAIXESBB",
  "defaultHourlyRateCents": 5000
}
```

---

### Invoices

Full invoicing module with status machine: `INVOICE_STATUS.DRAFT` -> `INVOICE_STATUS.FINALIZED` -> `INVOICE_STATUS.PAID` (or `INVOICE_STATUS.CANCELLED`). Finalizing generates a PDF and saves it as a fiscal document. Marking as paid atomically creates an income transaction.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices` | List invoices (supports `?status=`, `?prefixId=`) |
| POST | `/api/invoices` | Create draft invoice with line items |
| GET | `/api/invoices/[id]` | Get invoice with line items |
| PUT | `/api/invoices/[id]` | Edit draft invoice (date, line items, notes) |
| PATCH | `/api/invoices/[id]` | Update invoice status |
| DELETE | `/api/invoices/[id]` | Delete draft invoice |
| POST | `/api/invoices/[id]/finalize` | Finalize invoice, generate PDF, save as fiscal document |
| GET | `/api/invoices/[id]/pdf` | Download invoice PDF |

#### `GET /api/invoices`

List all invoices, optionally filtered by status and prefix.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | `draft` \| `finalized` \| `paid` \| `cancelled` | No | all | Filter by invoice status (`INVOICE_STATUS`) |
| `prefixId` | number | No | all | Filter by invoice prefix ID |

**Example Request:**
```bash
GET /api/invoices?status=draft
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "invoiceId": 1,
      "invoiceNumber": "INV-001",
      "prefixId": 1,
      "companyId": 3,
      "companyName": "Acme Corp",
      "invoiceDate": "2025-03-01",
      "status": "draft",
      "totalCents": 150000,
      "lineItemCount": 2,
      "createdAt": "2025-03-01T10:00:00.000Z"
    }
  ],
  "meta": { "count": 1 }
}
```

#### `POST /api/invoices`

Create a new invoice in `INVOICE_STATUS.DRAFT` status. The `totalCents` is calculated server-side from line items.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prefixId` | number | Yes | Invoice prefix ID (determines numbering series) |
| `invoiceDate` | date | Yes | Invoice date |
| `companyId` | number | Yes | Client company ID |
| `lineItems` | array | Yes | 1-50 line items |
| `notes` | string \| null | No | Additional notes (max 2000 chars) |

**Line Item Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | Yes | Line item description (1-500 chars) |
| `hours` | number \| null | No | Number of hours worked |
| `hourlyRateCents` | number \| null | No | Rate per hour in cents |
| `amountCents` | number | Yes | Total amount in cents (must equal `Math.round(hours * hourlyRateCents)` if both provided) |

**Example Request:**
```json
{
  "prefixId": 1,
  "invoiceDate": "2025-03-01",
  "companyId": 3,
  "lineItems": [
    {
      "description": "Web development - March 2025",
      "hours": 20,
      "hourlyRateCents": 5000,
      "amountCents": 100000
    },
    {
      "description": "Server maintenance",
      "amountCents": 50000
    }
  ],
  "notes": "Payment due within 30 days"
}
```

**Response:** `201 Created` with invoice object including generated `invoiceNumber`.

#### `GET /api/invoices/[id]`

Get a single invoice with its line items.

**Example Response:**
```json
{
  "success": true,
  "data": {
    "invoiceId": 1,
    "invoiceNumber": "INV-001",
    "status": "draft",
    "invoiceDate": "2025-03-01",
    "totalCents": 150000,
    "companyId": 3,
    "companyName": "Acme Corp",
    "notes": "Payment due within 30 days",
    "lineItems": [
      {
        "lineItemId": 1,
        "description": "Web development - March 2025",
        "hours": 20,
        "hourlyRateCents": 5000,
        "amountCents": 100000
      },
      {
        "lineItemId": 2,
        "description": "Server maintenance",
        "hours": null,
        "hourlyRateCents": null,
        "amountCents": 50000
      }
    ]
  }
}
```

#### `PUT /api/invoices/[id]`

Edit a draft invoice. Only `invoiceDate`, `lineItems`, and `notes` can be updated. Prefix and company are locked after creation. Only drafts can be edited.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `invoiceDate` | date | Yes | Updated invoice date |
| `lineItems` | array | Yes | Replacement line items (1-50) |
| `notes` | string \| null | No | Updated notes |

#### `PATCH /api/invoices/[id]`

Update invoice status. Used for status transitions in the invoice state machine.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | `INVOICE_STATUS.DRAFT` \| `INVOICE_STATUS.FINALIZED` \| `INVOICE_STATUS.PAID` \| `INVOICE_STATUS.CANCELLED` | Yes | Target status |
| `categoryId` | number | Required when `INVOICE_STATUS.PAID` | Income category for the auto-created transaction |

**Example Request (mark as paid):**
```json
{
  "status": "paid",
  "categoryId": 7
}
```

**Status Transitions:**

| From | To | Effect |
|------|----|--------|
| `draft` | `finalized` | Use `/finalize` endpoint instead for PDF generation |
| `finalized` | `paid` | Creates income transaction with today's date |
| `finalized` | `cancelled` | Deletes FiscalDocument + blob |
| `finalized` | `draft` | Deletes FiscalDocument + blob, invoice becomes editable |
| `paid` | `cancelled` | Deletes income transaction + FiscalDocument + blob |
| `cancelled` | `draft` | Reverts to draft for re-editing (no cleanup needed) |

#### `DELETE /api/invoices/[id]`

Delete an invoice. Only draft invoices can be deleted.

**Example Response:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

#### `POST /api/invoices/[id]/finalize`

Finalize a draft invoice: locks the invoice number, snapshots biller/client data, generates a PDF, and saves it as a fiscal document. Returns the PDF binary.

**Response:** Binary PDF with `Content-Type: application/pdf` and `Content-Disposition: attachment` headers.

#### `GET /api/invoices/[id]/pdf`

Download the PDF for a finalized or paid invoice. Generates the PDF on-the-fly from stored invoice data.

**Response:** Binary PDF with `Content-Type: application/pdf` and `Content-Disposition: attachment` headers.

---

### Invoice Prefixes

Invoice prefixes define numbering series for invoices (e.g., `INV`, `PROJ`). Each prefix tracks its own `nextNumber` counter, which auto-increments when invoices are created.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices/prefixes` | List all prefixes |
| POST | `/api/invoices/prefixes` | Create a new prefix |
| PUT | `/api/invoices/prefixes/[id]` | Update prefix (description, nextNumber) |
| DELETE | `/api/invoices/prefixes/[id]` | Delete prefix (409 if has invoices) |

#### `GET /api/invoices/prefixes`

List all invoice prefixes for the current user.

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "prefixId": 1,
      "prefix": "INV",
      "description": "General invoices",
      "nextNumber": 5,
      "companyId": null,
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "count": 1 }
}
```

#### `POST /api/invoices/prefixes`

Create a new invoice prefix.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prefix` | string | Yes | - | Prefix code (1-10 chars, auto-uppercased) |
| `description` | string \| null | No | null | Human-readable description |
| `nextNumber` | number | No | 1 | Starting invoice number |
| `companyId` | number \| null | No | null | Optional company to scope the prefix |

**Example Request:**
```json
{
  "prefix": "INV",
  "description": "General invoices",
  "nextNumber": 1
}
```

**Response:** `201 Created` with prefix object.

#### `PUT /api/invoices/prefixes/[id]`

Update an existing prefix. The `prefix` code itself is immutable.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string \| null | No | Updated description |
| `nextNumber` | number | No | Manually set next invoice number (min 1) |
| `companyId` | number \| null | No | Update scoped company |

#### `DELETE /api/invoices/prefixes/[id]`

Delete an invoice prefix. Returns `409 Conflict` if the prefix has existing invoices.

**Example Response (success):**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

**Example Response (conflict):**
```json
{
  "success": false,
  "error": "Cannot delete prefix with existing invoices"
}
```

---

### Fiscal Documents

Fiscal documents store uploaded tax filings, received invoices, and issued invoices. Files are stored in Vercel Blob (private access) and metadata is tracked in the database.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fiscal/documents` | List documents (requires `?year=`, supports `?quarter=`, `?documentType=`) |
| POST | `/api/fiscal/documents` | Upload single document (multipart/form-data) |
| GET | `/api/fiscal/documents/[id]` | Get document metadata |
| PATCH | `/api/fiscal/documents/[id]` | Update document status |
| DELETE | `/api/fiscal/documents/[id]` | Delete document and blob (supports `?deleteTransaction=true`) |
| GET | `/api/fiscal/documents/[id]/download` | Download document file (authenticated proxy) |
| POST | `/api/fiscal/documents/[id]/extract` | Run OCR extraction via Claude Vision |
| POST | `/api/fiscal/documents/[id]/link-transaction` | Create transaction and link to document (atomic) |
| POST | `/api/fiscal/documents/bulk` | Bulk upload multiple documents (multipart/form-data) |

#### `GET /api/fiscal/documents`

List fiscal documents filtered by year, with optional quarter and document type filters.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `year` | number | Yes | - | Fiscal year (2019-2100) |
| `quarter` | number | No | all | Quarter (1-4) |
| `documentType` | `modelo` \| `factura_recibida` \| `factura_emitida` | No | all | Document type (`FISCAL_DOCUMENT_TYPE`) |

**Example Request:**
```bash
GET /api/fiscal/documents?year=2025&quarter=1&documentType=modelo
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "documentId": 1,
      "documentType": "modelo",
      "modeloType": "303",
      "fiscalYear": 2025,
      "fiscalQuarter": 1,
      "status": "filed",
      "fileName": "modelo-303-Q1-2025.pdf",
      "fileSizeBytes": 245000,
      "contentType": "application/pdf",
      "taxAmountCents": 63175,
      "companyId": null,
      "description": null,
      "createdAt": "2025-04-15T10:00:00.000Z"
    }
  ]
}
```

#### `POST /api/fiscal/documents`

Upload a single fiscal document. Uses `multipart/form-data` with a file and JSON metadata.

**Form Data Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | The document file |
| `metadata` | JSON string | Yes | Document metadata (see below) |

**Metadata Fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `documentType` | `FISCAL_DOCUMENT_TYPE.MODELO` \| `FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA` \| `FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA` | Yes | - | Document type |
| `modeloType` | `MODELO_TYPE.M303` \| `MODELO_TYPE.M130` \| `MODELO_TYPE.M390` \| `MODELO_TYPE.M100` \| null | Conditional | null | Required for `modelo` type; must be null for `factura_*` types |
| `fiscalYear` | number | Yes | - | Fiscal year (2019-2100) |
| `fiscalQuarter` | number \| null | Conditional | null | Required for quarterly modelos (`303`, `130`); must be null for annual modelos (`390`, `100`) |
| `status` | `FISCAL_STATUS.PENDING` \| `FISCAL_STATUS.FILED` | No | `FISCAL_STATUS.PENDING` | Filing status |
| `taxAmountCents` | number \| null | No | null | Tax amount in cents |
| `transactionId` | number \| null | No | null | Link to a transaction |
| `transactionGroupId` | number \| null | No | null | Link to a transaction group |
| `companyId` | number \| null | No | null | Link to a company |
| `description` | string \| null | No | null | Description (max 255 chars) |

**Validation Rules:**
- `modeloType` is required when `documentType` is `modelo`, and must be null otherwise
- `fiscalQuarter` is required for quarterly modelos (`303`, `130`) and must be null for annual modelos (`390`, `100`)

**Response:** `201 Created` with document metadata.

#### `GET /api/fiscal/documents/[id]`

Get document metadata by ID. Does not expose the blob URL.

#### `PATCH /api/fiscal/documents/[id]`

Update the filing status of a document.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | `FISCAL_STATUS.PENDING` \| `FISCAL_STATUS.FILED` | Yes | New filing status |

**Example Request:**
```json
{ "status": "filed" }
```

#### `DELETE /api/fiscal/documents/[id]`

Delete a fiscal document and its associated blob from Vercel Blob storage. Optionally delete the linked transaction.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `deleteTransaction` | `true` | No | `false` | Also delete the linked transaction |

**Example Request:**
```bash
DELETE /api/fiscal/documents/5?deleteTransaction=true
```

**Example Response:**
```json
{
  "success": true,
  "data": { "deleted": true, "transactionDeleted": true }
}
```

#### `GET /api/fiscal/documents/[id]/download`

Authenticated download proxy. Streams the document from Vercel Blob without exposing the private blob URL to the client. Uses signed URLs for access.

**Response:** Binary file with appropriate `Content-Type` and `Content-Disposition: attachment` headers. Cached for 1 hour (`Cache-Control: private, max-age=3600`).

#### `POST /api/fiscal/documents/[id]/extract`

Run OCR extraction on a fiscal document using Claude Vision. Downloads the file from Vercel Blob, sends it to the Anthropic API, and returns structured extracted data. Extracted data is **transient** — it is NOT persisted in the database.

After extraction, the endpoint auto-matches the document against existing transactions:
- **Single transaction match**: Finds transactions within ±7 days with matching amount (or original amount for shared expenses)
- **Transaction group match**: Finds groups within ±3 days where member transactions sum to the invoice total

If a match is found, the document is automatically linked and its status set to `filed`.

**Request:** No body required.

**Example Response (with auto-match):**
```json
{
  "success": true,
  "data": {
    "totalAmountCents": 12100,
    "baseAmountCents": 10000,
    "taxAmountCents": 2100,
    "vatPercent": 21,
    "date": "2025-03-01",
    "vendor": "Vodafone",
    "invoiceNumber": "INV-2025-001",
    "description": "Monthly phone service",
    "confidence": 0.95
  },
  "meta": {
    "matchedTransactionId": 42
  }
}
```

**Error Codes (502):**

| Code | Description |
|------|-------------|
| `extraction_failed` | Generic OCR error (blurry, unreadable) |
| `api_credits_exhausted` | Anthropic API quota exceeded |
| `unrecognizable_amount` | OCR could not detect a valid `totalAmountEuros` |

---

#### `POST /api/fiscal/documents/[id]/link-transaction`

Atomically create a transaction and link it to the document. Used after OCR extraction when the user confirms the extracted data (or enters it manually).

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categoryId` | number | Yes | Category for the transaction |
| `amountCents` | number | Yes | Amount in cents |
| `transactionDate` | string | Yes | Date in `YYYY-MM-DD` format |
| `type` | `income` \| `expense` | Yes | Transaction type |
| `description` | string | No | Transaction description |
| `vatPercent` | number | No | VAT percentage (e.g., 21) |
| `deductionPercent` | number | No | Deduction percentage for fiscal reporting |
| `vendorName` | string | No | Vendor name |
| `invoiceNumber` | string | No | Invoice number |
| `companyId` | number | No | Company ID |
| `isShared` | boolean | No | Whether to halve the amount (÷2) |

**Side effects (atomic):**
1. Creates the transaction with all fiscal fields
2. Links the transaction to the document (`TransactionID`)
3. Updates document: `status='filed'`, `taxAmountCents` (original pre-÷2 amount), `fiscalQuarter`, `companyId`

**Example Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": 123,
    "documentId": 5
  }
}
```

---

#### `POST /api/fiscal/documents/bulk`

Bulk upload multiple fiscal documents. Accepts multiple files with optional metadata overrides. Filenames are auto-parsed to detect document type, modelo type, year, and quarter.

**Form Data Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | File[] | Yes | One or more document files |
| `metadata` | JSON string | No | Array of metadata overrides (one per file, by index) |

**Metadata Override Fields (per item):**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `documentType` | `FISCAL_DOCUMENT_TYPE.*` | Auto-detected | from filename | Document type |
| `modeloType` | `MODELO_TYPE.*` \| null | Auto-detected | from filename | Modelo type |
| `fiscalYear` | number | Auto-detected | current year | Fiscal year |
| `fiscalQuarter` | number \| null | Auto-detected | from filename | Quarter |
| `status` | `FISCAL_STATUS.*` | No | `FISCAL_STATUS.FILED` | Filing status |
| `description` | string \| null | No | null | Description |

**Example Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      { "fileName": "modelo-303-Q1-2025.pdf", "success": true, "documentId": 5 },
      { "fileName": "invalid-file.txt", "success": false, "error": "Validation failed" }
    ],
    "total": 2,
    "succeeded": 1,
    "failed": 1
  }
}
```

---

### Fiscal Deadlines

Server-computed AEAT (Spanish tax agency) filing deadlines. All deadline logic runs server-side based on the fiscal year, with filed modelo status tracked from fiscal documents.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fiscal/deadlines` | Get computed deadlines for a year (supports `?year=`, `?active=true`) |
| GET | `/api/fiscal/deadlines/settings` | Get reminder preferences |
| PUT | `/api/fiscal/deadlines/settings` | Update reminder preferences (upsert) |

#### `GET /api/fiscal/deadlines`

Get all AEAT filing deadlines for a given fiscal year. Deadlines are computed server-side and enriched with filing status from fiscal documents.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `year` | number | No | current year | Fiscal year (2020-2100) |
| `active` | `true` | No | all | Return only upcoming/overdue deadlines |

**Example Request:**
```bash
GET /api/fiscal/deadlines?year=2025&active=true
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "303-Q1",
      "modeloType": "303",
      "quarter": 1,
      "description": "Modelo 303 - Q1 2025",
      "dueDate": "2025-04-20",
      "isFiled": false,
      "isOverdue": true,
      "daysUntilDue": -5,
      "isInReminderWindow": true
    }
  ],
  "meta": { "year": 2025, "reminderDaysBefore": 7 }
}
```

#### `GET /api/fiscal/deadlines/settings`

Get the current deadline reminder preferences.

**Example Response:**
```json
{
  "success": true,
  "data": {
    "reminderDaysBefore": 7,
    "postponementReminder": true,
    "isActive": true
  }
}
```

#### `PUT /api/fiscal/deadlines/settings`

Update deadline reminder preferences (upsert).

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `reminderDaysBefore` | number | No | 7 | Days before deadline to start reminding (1-90) |
| `postponementReminder` | boolean | No | true | Show reminders for postponement deadlines |
| `isActive` | boolean | No | true | Enable/disable deadline reminders |

**Example Request:**
```json
{
  "reminderDaysBefore": 14,
  "postponementReminder": true,
  "isActive": true
}
```

---

### Fiscal Annual

Annual fiscal report for Spanish annual tax models (Modelo 390 for annual VAT summary and Modelo 100 for annual income tax).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fiscal/annual` | Get annual fiscal report (Modelo 390 + Modelo 100) |

#### `GET /api/fiscal/annual`

Get the annual fiscal report summarizing VAT and income tax for a full year.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `year` | number | Yes | - | Fiscal year (2020-2100) |

**Example Request:**
```bash
GET /api/fiscal/annual?year=2025
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "fiscalYear": 2025,
    "modelo390": {
      "totalVatCollected": 609500,
      "totalVatDeductible": 356800,
      "annualVatBalance": 252700
    },
    "modelo100": {
      "totalGrossIncome": 1190000,
      "totalDeductibleExpenses": 756800,
      "totalNetIncome": 433200,
      "estimatedAnnualTax": 86640
    }
  }
}
```

---

### Database Sync

Development-only endpoints for bidirectional database synchronization. Returns `403 Forbidden` in production.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/compare` | Compare local and remote databases (dev only) |
| POST | `/api/sync/execute` | Execute sync with SSE progress streaming (dev only) |

#### `GET /api/sync/compare`

Compare local and remote database schemas and data to compute a diff.

**Example Response:**
```json
{
  "success": true,
  "data": {
    "tables": [
      {
        "name": "Transactions",
        "localCount": 150,
        "remoteCount": 148,
        "diff": 2
      }
    ]
  }
}
```

#### `POST /api/sync/execute`

Execute database synchronization. Returns a Server-Sent Events (SSE) stream with progress updates.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `direction` | `SYNC_DIRECTION.PUSH` \| `SYNC_DIRECTION.PULL` | Yes | Sync direction (`push` = local to remote, `pull` = remote to local) |
| `includeDeletes` | boolean | Yes | Whether to propagate deletions |

**Example Request:**
```json
{
  "direction": "push",
  "includeDeletes": false
}
```

**Response:** `text/event-stream` with SSE events:
```
data: {"phase": "syncing", "message": "Processing Transactions..."}

data: {"phase": "syncing", "message": "Synced 50 rows"}

data: {"phase": "done", "message": "{\"tablesProcessed\": 5, \"rowsSynced\": 150}"}
```

**SSE Event Phases:**

| Phase | Description |
|-------|-------------|
| `syncing` | Progress update during sync |
| `done` | Sync completed successfully (message contains JSON result) |
| `error` | Sync failed (message contains error description) |

---

## Validation

All endpoints use Zod schemas for validation. Invalid requests return `400 Bad Request` with field-level errors:

```json
{
  "success": false,
  "errors": {
    "amount": ["El monto debe ser mayor a 0"],
    "categoryId": ["Selecciona una categoria"]
  }
}
```

### Validation Schemas

#### Transaction Schemas (`src/schemas/transaction.ts`)

| Schema | Purpose |
|--------|---------|
| `CreateTransactionSchema` | New transaction validation (amount, categoryId, date, type, isShared, vatPercent, deductionPercent, vendorName, invoiceNumber) |
| `UpdateTransactionSchema` | Extends CreateTransactionSchema.partial() with required transactionId |
| `TransactionFiltersSchema` | Query parameter validation (month, type, categoryId) |
| `CreateCategorySchema` | New category (name, type, icon, color, sortOrder, parentCategoryId, defaultShared, defaultVatPercent, defaultDeductionPercent) |
| `UpdateCategorySchema` | Partial category updates (name, icon, color, sortOrder, isActive, defaultShared, defaultVatPercent, defaultDeductionPercent). Type and parentCategoryId are immutable |
| `CreateTransactionGroupSchema` | Group creation (description, date, type, isShared, parentCategoryId, items[]) |
| `UpdateTransactionGroupSchema` | Group updates (description, transactionDate) |

#### Recurring Expense Schemas (`src/schemas/recurring-expense.ts`)

| Schema | Purpose |
|--------|---------|
| `CreateRecurringExpenseSchema` | New recurring expense with conditional frequency validation |
| `UpdateRecurringExpenseSchema` | Partial recurring expense updates (all fields optional) |
| `ConfirmOccurrenceSchema` | Occurrence confirmation with optional modified amount |

#### Trip Schemas (`src/schemas/trip.ts`)

| Schema | Purpose |
|--------|---------|
| `CreateTripSchema` | New trip (name, 1-100 chars) |
| `UpdateTripSchema` | Partial trip update (name optional) |
| `CreateTripExpenseSchema` | Trip expense (categoryId, amount, date, description, isShared) |
| `UpdateTripExpenseSchema` | Partial trip expense update (all fields optional) |

#### Company Schemas (`src/schemas/company.ts`)

| Schema | Purpose |
|--------|---------|
| `CreateCompanySchema` | New company (name, taxId, address, city, postalCode, country, invoiceLanguage, role) |
| `UpdateCompanySchema` | Partial company updates (all fields optional, plus isActive) |
| `QuickCreateCompanySchema` | Quick create with name only (from inline selector) |

#### Invoice Schemas (`src/schemas/invoice.ts`)

| Schema | Purpose |
|--------|---------|
| `BillingProfileSchema` | Billing profile upsert (fullName, nif, address, paymentMethod, bank details, defaultHourlyRateCents) |
| `CreateInvoicePrefixSchema` | New prefix (prefix code, description, nextNumber, companyId) |
| `UpdateInvoicePrefixSchema` | Partial prefix updates (description, nextNumber, companyId) |
| `CreateInvoiceSchema` | New invoice (prefixId, invoiceDate, companyId, lineItems[], notes) |
| `UpdateInvoiceSchema` | Edit draft invoice (invoiceDate, lineItems[], notes) |
| `UpdateInvoiceStatusSchema` | Status transition (status, optional categoryId for paid) |

#### Fiscal Document Schemas (`src/schemas/fiscal-document.ts`)

| Schema | Purpose |
|--------|---------|
| `FiscalDocumentUploadSchema` | Single document upload metadata (documentType, modeloType, fiscalYear, fiscalQuarter, status, taxAmountCents, links) |
| `FiscalDocumentStatusSchema` | Document status update (pending \| filed) |
| `BulkUploadItemSchema` | Bulk upload item metadata (auto-parsed from filename, with overrides) |
| `FiscalDeadlineSettingsSchema` | Deadline reminder preferences (reminderDaysBefore, postponementReminder, isActive) |
| `FiscalDocumentsFiltersSchema` | Document list filters (year, quarter, documentType) |
| `ExtractedInvoiceRawSchema` | OCR output validation with euro→cents conversion via `.transform()` |
| `LinkTransactionSchema` | Transaction creation + document linking request (categoryId, amountCents, transactionDate, type, fiscal fields) |

#### Sync Schemas (`src/schemas/sync.ts`)

| Schema | Purpose |
|--------|---------|
| `SyncExecuteSchema` | Sync execution params (direction: push \| pull, includeDeletes) |

---

## Money Handling

**Critical:** All monetary values are stored as **integers (cents)** to avoid floating point errors.

| API Input | Storage | API Output |
|-----------|---------|------------|
| `amount: 419.28` (euros) | `amountCents: 41928` | `amountCents: 41928` |

### Conversion Functions

Located in `src/utils/money.ts`:

```typescript
// User input to storage
eurosToCents(419.28) // -> 41928

// Storage to display
centsToEuros(41928)  // -> 419.28

// Formatted for UI
formatCurrency(41928) // -> "419,28 €"
```

### Shared Expense Calculations

```typescript
// Personal: amount stored as-is
eurosToCents(100.00)  // -> 10000 (stored as amountCents)

// Shared: halved with Math.ceil
const full = eurosToCents(101.00)  // -> 10100
Math.ceil(full / 2)                // -> 5050 (stored as amountCents)
// originalAmountCents = 10100, sharedDivisor = 2
```

### Transaction Group Balanced Rounding

When creating a shared transaction group, individual items are halved with `Math.ceil()`. To prevent the sum of halved items from exceeding the halved total:

```
Total: 29.00 EUR = 2900 cents
  Item A: 18.50 EUR -> ceil(1850/2) = 925
  Item B:  7.30 EUR -> ceil(730/2)  = 365
  Item C:  3.20 EUR -> ceil(320/2)  = 160
  Sum of halved items: 1450
  Expected halved total: ceil(2900/2) = 1450
  Difference: 0 (no adjustment needed)

If rounding causes a 1-cent difference, the last item absorbs it.
```

---

## Related Files

| File | Purpose |
|------|---------|
| `src/app/api/*/route.ts` | API endpoints |
| `src/schemas/transaction.ts` | Transaction, category, and group Zod schemas |
| `src/schemas/recurring-expense.ts` | Recurring expense and occurrence Zod schemas |
| `src/schemas/trip.ts` | Trip and trip expense Zod schemas |
| `src/types/finance.ts` | TypeScript interfaces for all domain types |
| `src/constants/finance.ts` | Constants (types, query keys, API endpoints, cache times) |
| `src/services/database/TransactionRepository.ts` | Transaction and group database operations |
| `src/services/database/CategoryRepository.ts` | Category database operations |
| `src/services/database/RecurringExpenseRepository.ts` | Recurring expense and occurrence database operations |
| `src/services/database/TripRepository.ts` | Trip CRUD and trip category database operations |
| `src/services/database/InvoiceRepository.ts` | Invoice, prefix, and billing profile database operations |
| `src/services/database/CompanyRepository.ts` | Company CRUD database operations |
| `src/services/database/FiscalDocumentRepository.ts` | Fiscal document CRUD, deadline settings, and bulk operations |
| `src/services/database/SyncService.ts` | Bidirectional database sync (dev only) |
| `src/schemas/company.ts` | Company Zod schemas |
| `src/schemas/invoice.ts` | Invoice, prefix, and billing profile Zod schemas |
| `src/schemas/fiscal-document.ts` | Fiscal document and deadline settings Zod schemas |
| `src/schemas/sync.ts` | Sync execution Zod schemas |
| `src/utils/money.ts` | Money conversion utilities (eurosToCents, centsToEuros, formatCurrency) |
| `src/utils/recurring.ts` | Recurring date calculation utilities |
| `src/utils/fiscalDeadlines.ts` | Fiscal deadline computation utilities |
| `src/utils/fiscalFileParser.ts` | Fiscal document filename auto-parser |
