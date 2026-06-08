# Plan de Remediación UX/UI — BudgetGuard

> Derivado de la auditoría en [`docs/ux-audit/`](./README.md) (160 hallazgos: 15🔴 / 37🟠 / 61🟡 / 47🟢).
> Estrategia: agrupar por **causa raíz transversal**, no módulo a módulo. La mayoría de críticos comparten 4 patrones; resolverlos como workstream evita repetir la solución 6 veces.
> Orden = riesgo financiero/confianza primero, pulido al final. Cada ítem cita `archivo:línea` real del informe correspondiente.

---

## Fase 0 — Fundaciones compartidas (habilitan el resto)

Antes de las fases que dependen de "feedback" y "confirmaciones", hay que crear/confirmar dos piezas reutilizables. **Sin esto, las fases 1 y 3 no tienen dónde apoyarse.**

| # | Tarea | Estado actual | Acción |
|---|-------|---------------|--------|
| F0.1 | **Sistema de toasts** | ❌ NO existe (0 matches `toast/sonner/notify` en `src/`). Múltiples informes lo daban por hecho. | Introducir un provider de notificaciones (p.ej. `sonner` o uno propio en `src/components/ui/`) + hook `useToast()`. Claves i18n `common.toast.*`. Es prerequisito de Fases 1 y 3. |
| F0.2 | **Wrapper de estado de datos** | Parcial: `ConfirmDialog`, `ErrorState`, `EmptyState`, `LoadingSpinner` ya existen; `ChartCard` ya implementa `isLoading/isError/onRetry`. | Extraer un `DataState`/`QueryBoundary` (`isLoading → spinner`, `isError → ErrorState+refetch`, `isEmpty → EmptyState`, `data → children`) reutilizable. Base de la Fase 1. |

`ConfirmDialog` **ya soporta** `variant="danger"` e `isLoading` (`ConfirmDialog.tsx:28-38`) — no hay que construir nada para la Fase 3, solo migrar.

---

## Fase 1 — "Vacío engañoso": fallo de red disfrazado de lista vacía 🔴

Patrón transversal más peligroso: vistas que solo leen `isLoading`/`data` y nunca `isError`. Un fallo de red pinta el empty state → el usuario cree que sus datos (fiscales, financieros) no existen y puede recrearlos (duplicados). Aplicar el wrapper de F0.2.

| Sev | Módulo | Ubicación | Arreglo |
|-----|--------|-----------|---------|
| 🔴 | Crypto | `CryptoEventsTable.tsx:80-86` | Añadir rama `events.isError` → `ErrorState` + `refetch()` |
| 🔴 | Crypto | `CryptoDisposalsTable.tsx:53-57` | Idem (datos fiscales → Renta Web; crítico no confundir "0" con error) |
| 🔴 | Skydiving | `JumpLogTable.tsx:82-128` | Rama `isError` (hoy muestra "No hay saltos registrados") |
| 🔴 | Skydiving | `TunnelSessionTable.tsx:75-121` | Idem |
| 🔴 | Documentos | `documents/page.tsx:120,202-226` | Desestructurar `isError` de `useFiscalDocuments` (`useFiscalDocuments.ts:34-40`) → `ErrorState` |
| 🟠 | Crypto | `CryptoModelo100Section.tsx:38-47`, `CryptoAeatGuide.tsx:72-73` | Distinguir `isError` de "sin datos"; `AeatGuide` no debe `return null` ante error |
| 🟡 | Documentos | `FiscalDocumentList.tsx:59-134` | `LinkedTransactionDetail`/`LinkedGroupDetail`: migrar `fetchApi+useEffect` a `useQuery`; no usar `common.error` como contenido de "lista vacía" |

---

## Fase 2 — Datos financieros mostrados incorrectamente 🔴 (quick wins de alto impacto)

Bugs visibles de signo/color/cálculo de dinero. Bajo esfuerzo, alto impacto en confianza. Casi todos son el Top de quick wins del README.

| Sev | Módulo | Ubicación | Arreglo |
|-----|--------|-----------|---------|
| 🔴 | Movimientos | `TransactionGroupRow.tsx:103,165,288,305` · `TripGroupRow.tsx:72,119,211,228` | Signo/icono invertido: replicar patrón correcto `TransactionList.tsx:91-97` (`isIncome ? ArrowDownLeft : ArrowUpRight` y `+`/`-`) |
| 🔴 | Categorías | `CategoryHistoryStats.tsx:24` · `CategoryHistoryMonths.tsx:52-53,113-115` | Historial todo en `text-guard-danger` fijo: derivar de `category.type` (success/danger) + signo `+`/`−` |
| 🟠 | Dashboard | `BalanceCards.tsx:173-179` | "Tasa de ahorro" siempre violeta: aplicar success/danger por signo (patrón ya en `:160`) |
| 🟠 | Dashboard | `BalanceCards.tsx:108-110` | "Gasto medio diario" divide por días del mes completo → infravalora el mes en curso. Dividir por días transcurridos; "—" en meses futuros |
| 🟠 | Fiscal | `Modelo303Card.tsx:51` · `Modelo390Card.tsx:50` | Cero tratado distinto entre modelos (verde vs rojo). Helper único de clasificación con estado neutro `=== 0` |
| 🟠 | Bonos | `VoucherDetailModal.tsx:108-113` · `VouchersWidget.tsx:71-76` | Consumos son gastos pero se pintan neutros: tratar como gasto (color+indicador) |
| 🟢 | Movimientos | `TransactionForm.tsx:476-482` | Saldo de bono con `Math.max(0,…)` oculta sobreconsumo |
| 🟡 | Bonos | `VoucherDetailModal.tsx:54-58` · `VouchersWidget.tsx:41-45` | Barra `Math.min(100,…)` oculta saldo negativo: estado "Excedido" explícito |

---

## Fase 3 — Validación y feedback de formularios 🔴

### 3a. Validación rota / claves i18n crudas en pantalla
| Sev | Módulo | Ubicación | Arreglo |
|-----|--------|-----------|---------|
| 🔴 | Facturas | `InvoiceForm.tsx:151-159` | Falta `resolver: zodResolver(InvoiceFormSchema)`: validación cliente muerta. Conectar (2 líneas) |
| 🔴 | Facturas | `InvoiceForm.tsx:331,354,362` | Errores sin `t()`: se ve `validation.select-client`. Envolver con `t()` + `role="alert"` |
| 🔴 | Settings | `BillingProfileForm.tsx:98,105` · `CompanyFormModal.tsx:149` | `{errors.x.message}` crudo. Patrón canónico `t(errors.field.message ?? '')` de `TransactionGroupForm.tsx:241` |
| 🔴 | Settings | `BinanceCredentialsForm.tsx:98,123` · `schemas/crypto.ts:19-20` | Zod sin mensaje → inglés técnico ("String must contain…"). Añadir `VALIDATION_KEY` + `t()` |
| 🟠 | Viajes | `TripCreateForm.tsx:153-157` · `TripEditForm.tsx:153-157` · `TripExpenseForm.tsx:254-260` | Mostrar `mutation.errorMessage` (ya traducido) en vez de literal estático |
| 🟠 | Facturas | `useInvoices.ts:307-345` | `useFinalizeInvoice` con `useMutation` crudo: migrar a `useApiMutation` y pintar `errorMessage` (acción fiscal crítica) |

### 3b. Formularios manuales → migrar a RHF+Zod (estándar del proyecto)
| Sev | Módulo | Ubicación |
|-----|--------|-----------|
| 🟠 | Fiscal | `ModeloDocumentUpload.tsx:36-81` (acepta negativos/`NaN`; default estado `FILED` peligroso) |
| 🟡 | Documentos | `FiscalExtractionConfirm.tsx:49,127` (`parseFloat('')→NaN`) |

### 3c. Fallos silenciosos en acciones
| Sev | Módulo | Ubicación | Arreglo |
|-----|--------|-----------|---------|
| 🔴 | Bonos | `VoucherDetailModal.tsx:38-49` | `catch (_error) {}` traga el fallo de borrado: renderizar `deleteVoucher.errorMessage` (bloque `role="alert"` de `VoucherFormModal.tsx:226`) |
| 🟠 | Skydiving | `JumpLogTable.tsx:73-80` (handleDelete) | `mutateAsync` sin try/catch: `errorMessage` + reset `deletingId` en `finally` |
| 🟠 | Facturas | `[id]/page.tsx:112-150` | `handleDownloadPdf` con `catch {}` vacío: toast de error |
| 🟠 | Fiscal | `ModeloDocumentUpload.tsx:228` | Copy de error de subida reutiliza `fiscal.errors.load` ("Error al cargar el informe"): clave dedicada |

---

## Fase 4 — Acciones destructivas y batch transaccional 🔴/🟠

Consolidar TODA confirmación destructiva en `ConfirmDialog` (ya soporta `variant`/`isLoading`) + toast de éxito (F0.1). Hoy conviven `window.confirm`, doble-clic inline y modales ad-hoc.

| Sev | Módulo | Ubicación | Patrón actual → arreglo |
|-----|--------|-----------|--------------------------|
| 🔴 | Recurring | `usePendingOccurrences.ts:106-119` | `Promise.all` "confirmar todos" crea transacciones a medias si una falla → **dobles cargos**. Endpoint batch atómico, o `allSettled` + "X de N" |
| 🔴 | Recurring | `RecurringExpenseList.tsx:65-69` | `window.confirm` → `ConfirmDialog` (danger) |
| 🔴 | Skydiving | `JumpLogTable.tsx:73-80,177-192` · `TunnelSessionTable.tsx:66-73,162-177` | Doble-clic sin texto ni timeout → `ConfirmDialog` |
| 🟠 | Movimientos | `PendingTransactionsBanner.tsx:41-45,104-114` | "Marcar todo pagado": N mutaciones sin confirmación/feedback agregado → `ConfirmDialog` con importe total + estado de error |
| 🟠 | Settings | `BinanceCredentialsForm.tsx:54-57` · `DbSyncPanel.tsx:435-489` | `window.confirm` + `ConfirmModal` ad-hoc → `ConfirmDialog` |
| 🟠 | Categorías | `CategoryHistoryMonths.tsx:73-91` | Doble-clic con reset `onBlur` → `ConfirmDialog` |
| 🟠 | Bonos | `VoucherDetailModal.tsx:36-49` | Doble-clic inline → `ConfirmDialog` |
| 🟠 | Documentos | `FiscalDocumentList.tsx:504-558` | Modal a mano sin `disabled` durante `isPending` (riesgo doble borrado) → `ConfirmDialog` |
| 🟠 | Categorías | `useCategories.ts:169-207` (+ Recurring, Documentos) | **Ausencia total de toast de éxito** tras crear/editar/borrar → añadir en `onSuccess` (depende F0.1) |

> Refactor opcional: extraer `CollapsibleWarningPanel` reutilizable — `PendingTransactionsBanner` y `RecurringPendingPanel` están duplicados (`recurring-expenses.md` mejora estructural #2).

---

## Fase 5 — Accesibilidad 🔴/🟠/🟡

| Sev | Módulo | Ubicación | Arreglo |
|-----|--------|-----------|---------|
| 🔴 | Dashboard | `CashFlowTrendChart.tsx:64-124`, `YtdBalanceCard.tsx:55-92`, `CategoryTrendsCard.tsx:62-99`, `CategoryDistributionCard.tsx:95-121` | 4 charts Recharts sin nombre accesible: `role="img"`+`aria-label` resumen y/o tabla `sr-only` (la ranking del donut ya es alternativa) |
| 🟠 | Crypto | `CryptoEventsTable.tsx:186` | Fila expandible `<tr onClick>` sin teclado: `role="button"`+`tabIndex`+`aria-expanded`+`onKeyDown` (patrón correcto ya en `CryptoDisposalsTable.tsx:82-93`) |
| 🟠 | Crypto | `CryptoPriceChart.tsx:741-801` | P&L solo en tooltip de canvas: promover `TradesList` a tabla navegable |
| 🟠 | Categorías | `ColorPicker.tsx:48-71` | `aria-label={hex}`: nombre i18n por color |
| 🟠 | Categorías | `CategoryDeleteDialog.tsx:129-207` | Foco se queda en botón inexistente al pasar a conflicto: mover foco a acción recomendada |
| 🟡 | Skydiving/Settings/Crypto | `skydiving/page.tsx:74-89` · `settings/page.tsx:85-105` · `crypto/page.tsx:67-87` | Tabs sin `role="tablist"`/`aria-selected` → patrón ARIA Tabs (componente compartido) |
| 🟡 | Movimientos/Categorías/Recurring/Viajes | `TransactionList.tsx:185-217` · `CategoryTree.tsx:121-122` · `RecurringExpenseList.tsx:174` · `TripExpenseRow.tsx:42-44` | Acciones tras `group-hover` inalcanzables en táctil/tablet → visibles por defecto, ocultar solo en `sm:` hover |
| 🟠 | Settings | `BillingProfileForm.tsx:189` etc. | Éxito de guardado sin `role="status"`/`aria-live` + icono `CheckCircle2` |
| 🟡 | Fiscal | `fiscal/page.tsx:101,124` · `FiscalQuarterSelector.tsx:50` | `aria-label` en inglés en UI española → claves i18n |

---

## Fase 6 — Consistencia visual / tokens vs DESIGN.md 🟡/🟢

| Sev | Tema | Ubicaciones |
|-----|------|-------------|
| 🟡 | **Hex hardcodeados fuera de paleta** | Dashboard `FixedVsVariableCard.tsx:21-22`, `TopVendorsWidget.tsx:24`, `CategoryBreakdown.tsx:32` · Skydiving cyan/amber `SkydiveStatsCards.tsx:97-98,107,111` · Recurring badges azul/morado/teal `RecurringExpenseList.tsx:82-93` · Crypto `CryptoPriceChart.tsx:61-64` → centralizar en `chartConfig`/tokens `guard-*` |
| 🟡 | **`max-w` inconsistente** (estándar `max-w-7xl`) | Facturas `max-w-5xl/4xl` · Skydiving `max-w-6xl` · Recurring/Viajes `max-w-4xl` → alinear o documentar excepción |
| 🟢 | **Tokens no documentados** | `guard-warning` (Fiscal/Skydiving/Categorías) y `TRIP_COLOR #8B5CF6` (Viajes, inline `style`) → documentar en DESIGN.md como tokens oficiales o sustituir |
| 🟠 | **CTA primario en rojo** | Recurring `RecurringExpenseForm.tsx:534-553` · Viajes `TripExpenseForm.tsx:263-270` → `bg-guard-primary` (rojo = destructivo) |
| 🟡 | **Botones ad-hoc vs `.btn-primary`** | Crypto `CryptoSyncPanel.tsx:144-178` · radius/card en Settings `BillingProfileForm.tsx:87` |

---

## Fase 7 — Onboarding, microcopy y pulido 🟡/🟢

- **Onboarding cuenta vacía** (Dashboard `page.tsx:58-122`): muro de ~7 empty states → bienvenida unificada con CTA. Bonos/Documentos: `EmptyState` con `action` (CTA primario).
- **Descubribilidad Bonos** (`dashboard/page.tsx:120`): widget enterrado bajo charts → subir o página `/bonos`.
- **Pluralización**: Categorías `CategoryDeleteDialog.tsx:138` ("1 transacciones") · Dashboard "{days} d".
- **Concatenación i18n frágil**: Movimientos `TransactionGroupRow.tsx:75` (`split(' ')`) · Recurring `RecurringPendingPanel.tsx:333` → claves dedicadas con interpolación.
- **Literales de error en código** (es/inglés): `useVouchers.ts:23` · `useCategories.ts:23` · `FiscalBulkUpload.tsx:79` ('Batch failed') → constantes/i18n.
- **Búsqueda sin normalizar acentos**: Movimientos `CategoryBrowser.tsx:39` → `normalizeForSearch` (ya usado en `TransactionList`).
- **Overflow números grandes 7+ dígitos**: `SummaryCard.tsx:47` · varios → `OverflowTooltip`/escalado.

---

## Resumen de secuenciación

```
F0  Fundaciones (toasts + DataState)        ── desbloquea F1, F3, F4
 │
F1  Vacío engañoso (isError)        🔴×5    ── riesgo datos fiscales
F2  Datos financieros incorrectos   🔴×2    ── quick wins, alta confianza
F3  Validación + feedback forms     🔴×5
F4  Destructivas + batch atómico    🔴×3    ── riesgo dobles cargos
 │
F5  Accesibilidad                   🔴×1
F6  Tokens / consistencia visual
F7  Onboarding / microcopy / pulido
```

**Recomendación de arranque**: F0.1 (toasts) + F2 (bugs de dinero, son los quick wins #1-3 del README y no dependen de nada) en paralelo, luego F1. Los 15 críticos quedan cerrados al terminar F1–F5.
