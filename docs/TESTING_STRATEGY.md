# Testing Strategy (Hybrid Approach)

**Hybrid approach: Contract tests first, implementation, then integration tests.**

## 🎯 Philosophy: Hybrid Testing Approach

BudgetGuard uses a **hybrid approach** that balances development speed with code quality:

1. **Define Contracts First** (Zod Schemas, Types, Interfaces)
2. **Implement Functionality** (Components, Services, APIs)
3. **Validate with Integration Tests** (Complete end-to-end flows)

### Why Hybrid is Better

✅ **Perfect balance between speed and quality**
- Define clear contracts first (interfaces, types, Zod schemas)
- Implement without losing momentum
- Validate integration at the end

✅ **Leverages existing architecture**
- **Zod schemas** = Automatic contract tests
- **Constants** = Single source of truth
- Only integration tests are missing

---

## 📊 Test Distribution by Type

| Priority | Test Type | Effort | When to Use |
|----------|-----------|--------|-------------|
| 🥇 | Integration Tests | 60% | API → Service → DB flows |
| 🥈 | Unit Tests | 25% | Pure functions, complex logic |
| 🥉 | Component Tests | 10% | Critical UI logic |
| 🏅 | E2E Tests | 5% | Critical user flows only |

---

## 🥇 Priority 1: Integration Tests (60% effort)

**Cover:** API → Service → DB → Response

**When to use:**
- ✅ Features with multiple layers (API + Service + DB)
- ✅ Transactions and data persistence
- ✅ Complete data flows

**Example:**
```typescript
describe('Transaction API Integration', () => {
  it('should create transaction and update summary', async () => {
    const response = await POST({
      categoryId: 1,
      amountCents: 10000,
      description: 'Test',
      transactionDate: '2025-01-15',
      type: 'expense'
    });

    expect(response.status).toBe(201);

    // Verify summary is updated
    const summary = await getSummary('2025-01');
    expect(summary.expenseCents).toBeGreaterThan(0);
  });
});
```

---

## 🥈 Priority 2: Unit Tests (25% effort)

**Cover:** Isolated business logic, pure functions

**When to use:**
- ✅ Complex isolated logic
- ✅ Pure functions with edge cases
- ✅ Transformation algorithms

**Example:**
```typescript
describe('Money Utils', () => {
  describe('eurosToCents', () => {
    it('should convert euros to cents correctly', () => {
      expect(eurosToCents(419.28)).toBe(41928);
    });

    it('should handle zero', () => {
      expect(eurosToCents(0)).toBe(0);
    });
  });
});
```

---

## 🥉 Priority 3: Component Tests (10% effort)

**Cover:** Critical UI logic, conditional states

**When to use:**
- ✅ Components with complex conditional logic
- ✅ Validation of critical states
- ✅ Important user interactions

**Example:**
```typescript
describe('BalanceCard', () => {
  it('should show positive balance in green', () => {
    render(<BalanceCard variant="balance" value={1000} />);
    expect(screen.getByText('10,00 €')).toHaveClass('text-guard-success');
  });

  it('should show negative balance in red', () => {
    render(<BalanceCard variant="balance" value={-1000} />);
    expect(screen.getByText('-10,00 €')).toHaveClass('text-guard-danger');
  });
});
```

---

## 🏅 Priority 4: E2E Tests (5% effort)

**Cover:** Complete user flows

**When to use:**
- ✅ Critical business flows
- ✅ Smoke tests for deploys

---

## 📁 Folder Structure

```
src/
├── __tests__/
│   ├── api/                    # API integration tests
│   │   └── version.test.ts
│   ├── components/             # Component tests
│   │   ├── ErrorPage.test.tsx
│   │   └── NotFoundPage.test.tsx
│   ├── providers/              # Provider tests
│   │   └── SessionProvider.test.tsx
│   └── utils/                  # Unit tests
│       └── staticTranslations.test.ts
```

---

## 🚀 Commands

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- staticTranslations

# Run tests in watch mode
npm test -- --watch
```

---

## 🚨 Anti-Patterns to Avoid

### ❌ Over-Mocking
```typescript
// ❌ WRONG - Too many mocks
jest.mock('@/services/database');
jest.mock('@/hooks/useTranslations');
// ... 10 more mocks
```

### ✅ Better Approach
```typescript
// ✅ CORRECT - Minimal mocking
// Only mock external dependencies, let internal services run
```

### ❌ Testing Implementation Details
```typescript
// ❌ WRONG
expect(component.state.isLoading).toBe(true);
```

### ✅ Better Approach
```typescript
// ✅ CORRECT - Test observable behavior
expect(screen.getByText('Loading...')).toBeInTheDocument();
```

---

## ⚡ Quick Reference

| Situation | Integration | Unit | Component | E2E |
|-----------|-------------|------|-----------|-----|
| Saving to DB | ✅ CRITICAL | ⚠️ Optional | ❌ No | ⚠️ 1 smoke |
| Complex logic | ⚠️ Optional | ✅ CRITICAL | ❌ No | ❌ No |
| UI interactions | ❌ No | ❌ No | ✅ CRITICAL | ⚠️ Optional |
| Utility function | ❌ No | ✅ CRITICAL | ❌ No | ❌ No |

---

**Last updated:** 2026-02-07
