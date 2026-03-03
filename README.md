# BudgetGuard

A modern family expense and income tracking application that replaces traditional Excel-based budget management with an intuitive web interface.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![SQL Server](https://img.shields.io/badge/SQL%20Server-MSSQL-red)

## Features

### Dashboard
- **Monthly Overview**: View income, expenses, and net balance at a glance
- **Category Breakdown**: Visual progress bars showing spending by category
- **Quick Navigation**: Navigate between months with automatic data prefetching

### Transaction Management
- **CRUD Operations**: Create, read, update, and delete transactions
- **Category Assignment**: 16 predefined categories (13 expenses, 3 income)
- **Date Tracking**: Full date support (not just month-level)
- **Real-time Updates**: Automatic UI refresh after changes

### Financial Accuracy
- **Cent-based Storage**: All amounts stored as integers to avoid floating point errors
- **Server-side Calculations**: Aggregations computed in SQL, not JavaScript
- **Spanish Locale**: Currency formatting with comma decimals (€1.234,56)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 3.4, Fintech Premium Theme |
| State Management | Zustand (UI), TanStack Query (Server) |
| Forms | React Hook Form + Zod Validation |
| Database | SQL Server with Views |
| Code Quality | Biome (Linting + Formatting) |

## Getting Started

### Prerequisites

- Node.js 22.12+
- npm 11+
- SQL Server (local or remote)

### Installation

1. **Clone the repository**
   ```bash
   cd c:\dev\desygner-office\budgetguard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local`:
   ```env
   DB_SERVER=localhost
   DB_NAME=BudgetGuard
   DB_USER=your_user
   DB_PASSWORD=your_password
   NEXTAUTH_SECRET=your-secret-key
   ```

4. **Create database**
   ```sql
   CREATE DATABASE BudgetGuard;
   ```

5. **Run SQL scripts**
   ```bash
   # Using sqlcmd
   sqlcmd -S localhost -E -d BudgetGuard -i database/schema.sql
   sqlcmd -S localhost -E -d BudgetGuard -i database/seed.sql
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

7. **Open browser**
   ```
   http://localhost:3000
   ```

## Project Structure

```
budgetguard/
├── database/
│   ├── schema.sql          # All tables, indexes, views, triggers
│   └── seed.sql            # Initial categories (16 total)
├── src/
│   ├── app/
│   │   ├── api/            # REST API endpoints
│   │   │   ├── categories/
│   │   │   ├── transactions/
│   │   │   ├── summary/
│   │   │   └── version/    # Build info endpoint
│   │   ├── error.tsx       # Error boundary (i18n)
│   │   ├── global-error.tsx # Global error (i18n)
│   │   ├── not-found.tsx   # 404 page (i18n)
│   │   └── (auth)/
│   │       └── dashboard/  # Main dashboard page
│   ├── components/
│   │   ├── dashboard/      # BalanceCards, CategoryBreakdown
│   │   ├── transactions/   # TransactionList, TransactionForm
│   │   └── ui/             # MonthPicker, LoadingSpinner
│   ├── hooks/              # TanStack Query hooks
│   ├── providers/          # QueryProvider, SessionProvider, TranslationProvider
│   ├── stores/             # Zustand store (UI state only)
│   ├── schemas/            # Zod validation schemas
│   ├── services/database/  # SQL Server repositories
│   ├── types/              # TypeScript interfaces
│   └── utils/              # Money utilities, helpers
└── package.json
```

## API Reference

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/categories` | List all categories |
| `GET` | `/api/categories?type=expense` | Filter by type |
| `POST` | `/api/categories` | Create new category |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/transactions?month=2025-01` | List by month |
| `POST` | `/api/transactions` | Create transaction |
| `GET` | `/api/transactions/:id` | Get single transaction |
| `PUT` | `/api/transactions/:id` | Update transaction |
| `DELETE` | `/api/transactions/:id` | Delete transaction |

### Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/summary?month=2025-01` | Monthly summary |

### Version

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/version` | Build info (version, env, git hash) |

## Default Categories

### Income (3)
- Nómina (Salary)
- Reembolsos (Refunds)
- Otros Ingresos (Other Income)

### Expenses (13)
- Vivienda (Housing)
- Blanquita (Pet)
- Trabajo (Work)
- Deporte (Sports)
- Paracaidismo (Skydiving)
- Supermercado (Groceries)
- Transporte (Transport)
- Restaurante (Dining)
- Compras (Shopping)
- Salir (Going Out)
- Gastos Extra (Extra Expenses)
- Viajes (Travel)
- Anuales (Annual Expenses)

## Design System

BudgetGuard uses a Fintech Premium color palette:

| Color | Hex | Usage |
|-------|-----|-------|
| Deep Navy | `#0F172A` | Backgrounds |
| Indigo | `#4F46E5` | Primary actions |
| Emerald | `#10B981` | Income, positive |
| Rose | `#EF4444` | Expenses, alerts |
| Slate | `#64748B` | Secondary text |

## Scripts

```bash
# Development
npm run dev           # Start development server
npm run build         # Build for production
npm run start         # Start production server

# Code Quality
npm run lint          # Run Biome linter
npm run lint:fix      # Fix linting issues
npm run format        # Format code
npm run check-types   # TypeScript type checking
npm run lint-and-types # Both lint and type check

# Testing
npm run test          # Run tests
npm run test:coverage # Run tests with coverage

# Versioning
npm run release          # Smart release (auto-detect patch/minor/major)
npm run release:dry-run  # Preview release without changes
npm run release:patch    # Force patch release (1.0.0 → 1.0.1)
npm run release:minor    # Force minor release (1.0.0 → 1.1.0)
npm run release:major    # Force major release (1.0.0 → 2.0.0)
npm run release:first    # First release (creates v0.0.1)
```

## Versioning System

BudgetGuard uses [Conventional Commits](https://www.conventionalcommits.org/) with automatic semantic versioning.

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Commit Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | **minor** (1.0.0 → 1.1.0) |
| `fix` | Bug fix | **patch** (1.0.0 → 1.0.1) |
| `perf` | Performance improvement | **patch** |
| `docs` | Documentation only | No release |
| `style` | Code style (formatting) | No release |
| `refactor` | Code refactoring | No release |
| `test` | Adding tests | No release |
| `chore` | Maintenance tasks | No release |
| `BREAKING CHANGE` | Breaking change | **major** (1.0.0 → 2.0.0) |

### Examples

```bash
# Feature (minor bump)
git commit -m "feat: add monthly budget limits"

# Bug fix (patch bump)
git commit -m "fix: correct currency formatting for large amounts"

# Breaking change (major bump)
git commit -m "feat!: redesign API response format

BREAKING CHANGE: API responses now use camelCase"

# With scope
git commit -m "fix(dashboard): resolve balance calculation error"

# No version bump
git commit -m "docs: update README with API examples"
git commit -m "chore: update dependencies"
```

### Automatic Release Flow

When pushing to `main` branch:

1. **Pre-push hook** runs type checking and linting
2. **Detects versionable commits** (feat/fix/perf)
3. **Determines release type** (patch/minor/major)
4. **Updates version** in package.json
5. **Generates CHANGELOG.md** entry
6. **Creates git tag** (v1.2.3)
7. **Commits release** with message `chore(release): 1.2.3`

### Tools

| Tool | Purpose |
|------|---------|
| **Husky** | Git hooks manager |
| **Commitlint** | Validates commit message format |
| **commit-and-tag-version** | Bumps version, updates changelog, creates tag |
| **smart-release.js** | Auto-detects appropriate version bump |

## Database Schema

All tables are defined in `schema.sql`:

### Core Tables
- **Categories**: Transaction categorization (income/expense types)
- **Transactions**: All financial movements with amounts in cents

### User Authentication (NextAuth compatible)
- **Users**: User accounts with locale preference (`es`/`en`)
- **Accounts**: OAuth provider connections
- **Sessions**: Active user sessions
- **VerificationTokens**: Email verification

## Architecture Decisions

### Why Cents Instead of Decimals?

JavaScript floating point arithmetic can produce unexpected results:
```javascript
0.1 + 0.2 === 0.30000000000000004  // true!
```

Storing amounts as integers (cents) eliminates this:
```javascript
10 + 20 === 30  // Always correct
```

### Why SQL Views for Aggregations?

- **Performance**: Database engines optimize aggregations better than JavaScript
- **Consistency**: Single source of truth for calculations
- **Scalability**: No client-side processing as data grows

### Why TanStack Query for Server State?

- **Automatic Caching**: Reduces API calls
- **Background Refetch**: Data stays fresh
- **Loading States**: Built-in `isLoading`, `isError`
- **Invalidation**: Easy cache updates after mutations

## Roadmap

### Phase 1 (Current) - MVP
- [x] Transaction CRUD
- [x] Monthly dashboard
- [x] Category breakdown
- [x] Balance cards
- [x] Internationalization (ES/EN)
- [x] Error pages with i18n
- [x] Version API endpoint
- [x] Users database schema

### Phase 1.5 - Authentication
- [ ] NextAuth integration
- [ ] Email/password login
- [ ] User locale persistence
- [ ] Session management

### Phase 2 - Analytics
- [ ] Charts and graphs
- [ ] Month-to-month comparison
- [ ] Export to Excel/CSV

### Phase 3 - Budgeting
- [ ] Budget limits per category
- [ ] Overspend alerts
- [ ] Recurring transactions

### Phase 4 - Multi-user
- [ ] Family accounts
- [ ] User permissions
- [ ] Mobile PWA

## License

Private project - All rights reserved.

## Author

Built with ❤️ for family financial health.
