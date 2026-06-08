# Auditoría UX/UI — BudgetGuard

Resultado consolidado de la auditoría UX/UI por módulos de BudgetGuard. Cada módulo se ha revisado con los skills de critique, audit, harden, clarify, onboard y polish, contrastando contra DESIGN.md (lenguaje de color, tokens, accesibilidad) y las reglas del proyecto (i18n obligatoria, dinero en céntimos). Esta página resume severidades, prioriza los arreglos de mayor impacto y recoge los patrones que se repiten en toda la app.

## Resumen por módulo

| Módulo | 🔴 Crítico | 🟠 Alto | 🟡 Medio | 🟢 Bajo | Total | Informe |
|--------|:---------:|:-------:|:--------:|:-------:|:-----:|---------|
| Dashboard | 1 | 3 | 6 | 4 | 14 | [dashboard](./dashboard.md) |
| Movimientos / Transacciones | 1 | 3 | 4 | 4 | 12 | [movements](./movements.md) |
| Facturas (Invoices) | 2 | 3 | 4 | 4 | 13 | [invoices](./invoices.md) |
| Fiscal | 0 | 3 | 6 | 5 | 14 | [fiscal](./fiscal.md) |
| Skydiving | 2 | 3 | 5 | 4 | 14 | [skydiving](./skydiving.md) |
| Bonos (Vouchers) | 1 | 2 | 5 | 3 | 11 | [vouchers](./vouchers.md) |
| Categorías | 1 | 4 | 6 | 5 | 16 | [categories](./categories.md) |
| Ajustes (Settings) | 2 | 3 | 5 | 3 | 13 | [settings](./settings.md) |
| Gastos recurrentes | 2 | 5 | 6 | 3 | 16 | [recurring-expenses](./recurring-expenses.md) |
| Viajes (Trips) | 0 | 2 | 5 | 5 | 12 | [trips](./trips.md) |
| Documentos | 1 | 3 | 4 | 3 | 11 | [documents](./documents.md) |
| Crypto | 2 | 3 | 5 | 4 | 14 | [crypto](./crypto.md) |
| **TOTALES** | **15** | **37** | **61** | **47** | **160** | — |

## Top 10 quick wins de toda la app

Los 10 arreglos de mayor impacto y menor esfuerzo, transversales a todos los módulos. Cada uno cita la evidencia real del informe correspondiente.

1. **Corregir signo e icono de importe en grupos y viajes** — Movimientos: `TransactionGroupRow.tsx:103,165,288,305` y `TripGroupRow.tsx:72,119,211,228`. Las filas de grupo/viaje hardcodean `<ArrowUpRight/>` y prefijo `-` incluso para ingresos; replicar el patrón correcto de `TransactionList.tsx:91-97` (`isIncome ? ArrowDownLeft : ArrowUpRight` y `+`/`-`). Arregla un signo monetario erróneo visible.
2. **Color del importe según tipo en el historial de categorías** — Categorías: `CategoryHistoryStats.tsx:24`, `CategoryHistoryMonths.tsx:52-53,113-115`. Hoy todo se pinta en `text-guard-danger` fijo, mostrando ingresos en rojo de gasto; derivar de `category.type` (success/danger) y añadir signo `+`/`−`.
3. **Tono condicional en "Tasa de ahorro"** — Dashboard: `BalanceCards.tsx:173-179`. Usa siempre `SUMMARY_COLORS.violet`; aplicar success/danger según signo reutilizando el patrón ya existente en la tarjeta Balance (`BalanceCards.tsx:160`). Una línea.
4. **Conectar `zodResolver` y envolver mensajes con `t()` en InvoiceForm** — Facturas: `InvoiceForm.tsx:151-159` (sin resolver) y `:331,354,362` (claves crudas en pantalla). Restaura toda la validación cliente con dos líneas y evita mostrar `validation.select-client` literal.
5. **Envolver todos los `errors.*.message` con `t()` en Settings** — Ajustes: `BillingProfileForm.tsx:98,105` y `CompanyFormModal.tsx:149`. El usuario ve claves crudas como `validation.full-name-required`; aplicar el patrón canónico `t(errors.field.message ?? '')` de `TransactionGroupForm.tsx:241,263`.
6. **Manejar `isError` con `ErrorState` + reintento en Documentos** — Documentos: `documents/page.tsx:120,202-226`. El hook expone `isError` (`useFiscalDocuments.ts:34-40`) pero la página solo lee `data`/`isLoading`, disfrazando un fallo de red como "lista vacía". Distinguir vacío de error.
7. **Añadir estado de error a las dos tablas de Skydiving** — Skydiving: `JumpLogTable.tsx:82-128` y `TunnelSessionTable.tsx:75-121`. Solo manejan `isLoading`; un fallo muestra "No hay saltos registrados" y puede inducir duplicados. Consultar `isError` y renderizar `ErrorState` con `refetch`.
8. **Mostrar el error de borrado en VoucherDetailModal** — Bonos: `VoucherDetailModal.tsx:38-49,182-197`. El `catch (_error) {}` traga el fallo y el borrado falla en silencio; renderizar `deleteVoucher.errorMessage` con el bloque `role="alert"` ya usado en `VoucherFormModal.tsx:226-232`.
9. **Corregir el copy de error de subida de modelo fiscal** — Fiscal: `ModeloDocumentUpload.tsx:228`. Reutiliza `fiscal.errors.load` ("Error al cargar el informe fiscal") para un fallo de subida; usar una clave de subida o exponer `uploadMutation.errorMessage`. Una línea.
10. **Traducir `eventType` y contraprestación crudos en Crypto** — Crypto: `CryptoEventsTable.tsx:314` (`{eventType}` técnico) y `CryptoDisposalsTable.tsx:102` (letra `F`/`N` cruda). Las claves `crypto.events.type.*` ya existen en ambos idiomas; cambiar a `t(...)` mejora claridad sin tocar lógica.

## Top 5 mejoras estructurales de toda la app

Las 5 intervenciones de mayor calado, con evidencia por módulo.

1. **Estado de datos consistente (loading / error / vacío) en todas las tablas y secciones.** Varias superficies disfrazan un fallo de red como "sin datos", lo más grave en datos financieros/fiscales: Crypto Movimientos/Transmisiones/Modelo 100 (`CryptoEventsTable.tsx:80-86`, `CryptoDisposalsTable.tsx:53-57`, `CryptoModelo100Section.tsx:38-47`), Skydiving (`JumpLogTable.tsx:82-128`, `TunnelSessionTable.tsx:75-121`) y Documentos (`documents/page.tsx:120`). Normalizar a un wrapper `isLoading/isError/isEmpty/data` con `ErrorState`+`refetch`, como ya hace `ChartCard.tsx:53-54`.
2. **Unificar confirmaciones destructivas y feedback de éxito sobre `ConfirmDialog` + toasts.** Conviven `window.confirm` (Recurring `RecurringExpenseList.tsx:65-69`, Settings `BinanceCredentialsForm.tsx:54-57`), modales ad-hoc (Settings `DbSyncPanel.tsx:435-489`, Documentos `FiscalDocumentList.tsx:504-558`) y doble-clic inline (Skydiving `JumpLogTable.tsx:73-80`, Bonos `VoucherDetailModal.tsx:36`, Categorías `CategoryHistoryMonths.tsx:73-91`), casi siempre sin toast de éxito (Categorías `useCategories.ts:169-207`, Recurring `RecurringPendingPanel.tsx:40-59`, Documentos `FiscalExtractionConfirm.tsx:145`). Consolidar en el `ConfirmDialog` reutilizable y el sistema de toasts del proyecto.
3. **Accesibilidad de gráficos y superficies de datos interactivas.** Los 4 charts Recharts del Dashboard carecen de nombre accesible/alternativa textual (`CashFlowTrendChart.tsx:64-124`, `YtdBalanceCard.tsx:55-92`, `CategoryTrendsCard.tsx:62-99`, `CategoryDistributionCard.tsx:95-121`); en Crypto la fila expandible no es operable por teclado (`CryptoEventsTable.tsx:186`) y el detalle de precio/P&L vive solo en tooltips de canvas (`CryptoPriceChart.tsx:741-801`). Introducir patrón `role="img"`+`aria-label`/tabla `sr-only` para charts y controles de teclado reales (`aria-expanded`, `onKeyDown`) para filas.
4. **Acciones batch transaccionales con feedback parcial en flujos financieros.** El "confirmar/marcar todo" dispara N mutaciones paralelas sin transacción ni reporte: Recurring `Promise.all` en `usePendingOccurrences.ts:106-119` (riesgo de dobles cargos) y Movimientos `PendingTransactionsBanner.tsx:41-45,104-114` (sin confirmación ni error agregado). Migrar a endpoint batch atómico (o `Promise.allSettled` + feedback "X de N") con `ConfirmDialog` mostrando importe total.
5. **Saneado del lenguaje de color/tokens frente a DESIGN.md.** Hex y colores fuera de paleta dispersos: Dashboard (`FixedVsVariableCard.tsx:21-22`, `TopVendorsWidget.tsx:24`, `CategoryBreakdown.tsx:32`), Skydiving cyan/amber (`SkydiveStatsCards.tsx:97-98,107,111`), Recurring badges azul/morado/teal (`RecurringExpenseList.tsx:82-93`), Viajes Violet inline `TRIP_COLOR` (`finance.ts:209`), Crypto hex de chart (`CryptoPriceChart.tsx:61-64`). Centralizar en `chartConfig`/tokens `guard-*`, documentar `guard-warning` y el acento de Viajes en DESIGN.md, y evitar `style` inline para color de marca.

## Patrones transversales

- **Fallo silencioso = "vacío engañoso".** Repetido en Crypto, Skydiving y Documentos: las vistas no leen `isError` y un fallo de red se renderiza como empty state, induciendo a recrear datos ya existentes (duplicados) — especialmente peligroso en datos fiscales.
- **Confirmaciones destructivas fragmentadas y sin feedback de éxito.** `window.confirm`, modales ad-hoc y doble-clic inline coexisten con el `ConfirmDialog` del sistema sin usar; los borrados/altas rara vez emiten toast, dejando al usuario sin cierre (Bonos, Skydiving, Categorías, Recurring, Settings, Documentos).
- **Color sin indicador secundario (incumple DESIGN.md "nunca solo color").** Ingreso/gasto comunicados solo por color: grupos y viajes con signo invertido (Movimientos), historial de categorías en rojo fijo, consumos de bonos neutros, "Coste Total" de skydiving en rojo, importes de recurrentes solo rojos, y CTAs rojos usados como acción primaria (Recurring, Viajes).
- **i18n incompleta en los bordes pese a paridad de claves.** Aunque la paridad es/en suele ser perfecta, afloran claves crudas en pantalla (Facturas, Settings), mensajes Zod en inglés técnico (Settings/Binance), `aria-label` en inglés (Fiscal), y literales de error en código (`'Batch failed'`, "Error al cargar bonos/categorias") en Fiscal, Documentos, Bonos y Categorías.
- **Inconsistencia de tokens y anchos de página vs DESIGN.md.** Hex hardcodeados y colores fuera de paleta (Dashboard, Skydiving, Recurring, Viajes, Crypto), y contenedores `max-w-4xl`/`5xl`/`6xl` donde el estándar es `max-w-7xl` (Facturas, Skydiving, Recurring, Viajes) sin documentar la excepción.
- **Accesibilidad de patrones interactivos.** Tabs sin semántica ARIA (`role="tablist"`/`aria-selected`) en Skydiving, Settings y Crypto; acciones de fila ocultas tras `group-hover` inalcanzables en táctil/tablet (Movimientos, Categorías, Recurring, Viajes); y gráficos/canvas sin alternativa por teclado (Dashboard, Crypto).
