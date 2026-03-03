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

// Error response
{
  "success": false,
  "error": "Human-readable error message",
  "errors": {      // Validation errors (optional)
    "fieldName": ["Error message 1", "Error message 2"]
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
| 500 | Internal Server Error |

---

## Endpoints

### Categories

#### `GET /api/categories`

List all categories, optionally filtered by type.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | `income` \| `expense` | No | Filter by transaction type |

**Example Request:**
```bash
GET /api/categories?type=expense
```

**Example Response:**
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
      "isActive": true
    },
    {
      "categoryId": 2,
      "name": "Supermercado",
      "type": "expense",
      "icon": "shopping-cart",
      "color": "#10B981",
      "sortOrder": 2,
      "isActive": true
    }
  ]
}
```

---

#### `POST /api/categories`

Create a new category.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Category name (max 100 chars) |
| `type` | `income` \| `expense` | Yes | Transaction type |
| `icon` | string | No | Lucide icon name |
| `color` | string | No | Hex color (e.g., `#4F46E5`) |
| `sortOrder` | number | No | Display order (default: 0) |

**Example Request:**
```json
{
  "name": "Suscripciones",
  "type": "expense",
  "icon": "credit-card",
  "color": "#8B5CF6",
  "sortOrder": 15
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "categoryId": 17,
    "name": "Suscripciones",
    "type": "expense",
    "icon": "credit-card",
    "color": "#8B5CF6",
    "sortOrder": 15,
    "isActive": true
  }
}
```

---

### Transactions

#### `GET /api/transactions`

List transactions for a specific month.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | string | No | Month in `YYYY-MM` format (default: current month) |
| `type` | `income` \| `expense` | No | Filter by transaction type |
| `categoryId` | number | No | Filter by category |

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
      "categoryId": 1,
      "amountCents": 41928,
      "description": "Alquiler enero",
      "transactionDate": "2025-01-01",
      "type": "expense",
      "createdAt": "2025-01-01T10:00:00.000Z",
      "updatedAt": "2025-01-01T10:00:00.000Z",
      "category": {
        "categoryId": 1,
        "name": "Vivienda",
        "icon": "home",
        "color": "#4F46E5"
      }
    }
  ],
  "meta": {
    "month": "2025-01",
    "count": 1
  }
}
```

**Note:** `amountCents` is stored in cents. To display: `amountCents / 100` = euros.

---

#### `POST /api/transactions`

Create a new transaction.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categoryId` | number | Yes | Category ID |
| `amount` | number | Yes | Amount in **euros** (e.g., `419.28`) |
| `description` | string | No | Description (max 255 chars) |
| `transactionDate` | string | Yes | Date in ISO format |
| `type` | `income` \| `expense` | Yes | Transaction type |

**Example Request:**
```json
{
  "categoryId": 1,
  "amount": 419.28,
  "description": "Alquiler enero",
  "transactionDate": "2025-01-01",
  "type": "expense"
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": 1,
    "categoryId": 1,
    "amountCents": 41928,
    "description": "Alquiler enero",
    "transactionDate": "2025-01-01",
    "type": "expense",
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-01-01T10:00:00.000Z"
  }
}
```

**Important:** Send `amount` in euros. The API converts to cents automatically.

---

#### `GET /api/transactions/:id`

Get a single transaction by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Transaction ID |

**Example Request:**
```bash
GET /api/transactions/1
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": 1,
    "categoryId": 1,
    "amountCents": 41928,
    "description": "Alquiler enero",
    "transactionDate": "2025-01-01",
    "type": "expense",
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-01-01T10:00:00.000Z"
  }
}
```

---

#### `PUT /api/transactions/:id`

Update an existing transaction. All fields are optional.

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
    "categoryId": 1,
    "amountCents": 45000,
    "description": "Alquiler enero (actualizado)",
    "transactionDate": "2025-01-01",
    "type": "expense",
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-01-02T15:30:00.000Z"
  }
}
```

---

#### `DELETE /api/transactions/:id`

Delete a transaction.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Transaction ID |

**Example Request:**
```bash
DELETE /api/transactions/1
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

### Summary

#### `GET /api/summary`

Get monthly summary with totals by category. Data comes from pre-calculated SQL views for optimal performance.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | string | No | Month in `YYYY-MM` format (default: current month) |

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

Located in `src/schemas/transaction.ts`:

- **CreateTransactionSchema** - New transaction validation
- **UpdateTransactionSchema** - Partial transaction updates
- **TransactionFiltersSchema** - Query parameter validation
- **CreateCategorySchema** - New category validation

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
eurosToCents(419.28) // → 41928

// Storage to display
centsToEuros(41928)  // → 419.28

// Formatted for UI
formatCurrency(41928) // → "419,28 €"
```

---

## Related Files

| File | Purpose |
|------|---------|
| `src/app/api/*/route.ts` | API endpoints |
| `src/schemas/transaction.ts` | Zod validation schemas |
| `src/types/finance.ts` | TypeScript interfaces |
| `src/constants/finance.ts` | Constants and types |
| `src/services/database/*.ts` | Database repositories |
| `src/utils/money.ts` | Money conversion utilities |
