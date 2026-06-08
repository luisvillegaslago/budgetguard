# Auditoría UX/UI — Dashboard

> Skills aplicados: critique (jerarquía/IA/resonancia), audit (a11y/responsive/theming), clarify (microcopy/labels), harden (resiliencia/i18n/overflow), onboard (primera experiencia/empty states), polish (alineación/detalle)
> Archivos revisados:
> - src/app/(auth)/dashboard/page.tsx:30-134
> - src/components/dashboard/BalanceCards.tsx:36-195
> - src/components/dashboard/charts/CategoryDistributionCard.tsx:50-187
> - src/components/dashboard/charts/ChartCard.tsx:27-62
> - src/components/dashboard/charts/CashFlowTrendChart.tsx:24-126
> - src/components/dashboard/charts/YtdBalanceCard.tsx:36-95
> - src/components/dashboard/charts/CategoryTrendsCard.tsx:21-102
> - src/components/dashboard/charts/PeriodSelector.tsx:21-44
> - src/components/dashboard/charts/MonthTransactionsModal.tsx:37-136
> - src/components/dashboard/charts/TypeTransactionsModal.tsx:22-51
> - src/components/dashboard/charts/chartConfig.ts:34-53
> - src/components/dashboard/charts/useTrendBars.ts:88-135
> - src/components/dashboard/widgets/FixedVsVariableCard.tsx:53-117
> - src/components/dashboard/widgets/TopVendorsWidget.tsx:52-142
> - src/components/dashboard/widgets/FiscalSummaryCard.tsx:40-116
> - src/components/dashboard/widgets/VouchersWidget.tsx:39-197
> - src/components/dashboard/CategoryBreakdown.tsx:30-269
> - src/components/ui/SummaryCard.tsx:30-124
> - src/components/ui/MonthPicker.tsx:18-194
> - src/components/ui/AnimatedHeight.tsx:29-76
> - src/hooks/useFormattedSummary.ts:16-93
> - src/hooks/useDashboardUrlSync.ts:18-76
> - src/messages/es.json / en.json (paridad verificada)

## Resumen ejecutivo

El Dashboard es sólido y maduro: estados loading/empty/error consistentes vía ChartCard/EmptyState/ErrorState, paridad i18n completa (todas las claves t() verificadas existen en es.json y en.json), dinero siempre en céntimos con formatCurrency, y respeto de prefers-reduced-motion a nivel global. La jerarquía de KPIs es buena y los drill-down a transacciones añaden profundidad. Los problemas principales son de accesibilidad (gráficos Recharts no operables por teclado ni con alternativa textual, donut sin tooltip accesible) y de microcopy/semántica financiera (el "Gasto medio diario" divide siempre entre los días del mes completo, falseando meses en curso o futuros; la "Tasa de ahorro" no aplica el color verde/rojo del lenguaje de marca). El resto son afinados de consistencia visual y resiliencia ante textos largos.

## Hallazgos

### 🔴 Crítico

- **Severidad**: 🔴 Crítico
- **Categoría**: Accesibilidad
- **Ubicación**: src/components/dashboard/charts/CashFlowTrendChart.tsx:64-124; YtdBalanceCard.tsx:55-92; CategoryTrendsCard.tsx:62-99; CategoryDistributionCard.tsx:95-121
- **Problema**: Todos los gráficos Recharts (barras de flujo de caja, área de balance acumulado, área apilada de categorías y donut) renderizan SVG sin nombre accesible, sin `role`/`aria-label`, sin alternativa textual y sin operabilidad por teclado. Para un usuario con lector de pantalla o que navega solo con teclado, el bloque central de analítica financiera es totalmente invisible/inalcanzable. El donut además solo se interpreta vía tooltip hover (CategoryDistributionCard.tsx:113), inaccesible en táctil y teclado. Choca con DESIGN.md §Accessibility ("Keyboard-accessible", "WCAG AA").
- **Recomendación**: Aportar alternativa textual ya presente en el código: la tabla/ranking de categorías (CategoryDistributionCard.tsx:124-172) ya es accesible y puede declararse como alternativa del donut; para los charts de tendencia, exponer los datos como tabla visualmente oculta o un `aria-label` resumen en el contenedor (p. ej. "Flujo de caja: ingresos X, gastos Y por mes"). Añadir `role="img"` + `aria-label` al `ResponsiveContainer` wrapper como mínimo viable. Reutilizar el patrón de `tabular-nums` y formatEuroValue para construir el resumen.

### 🟠 Alto

- **Severidad**: 🟠 Alto
- **Categoría**: Copy / Usabilidad (semántica financiera)
- **Ubicación**: src/components/dashboard/BalanceCards.tsx:108-110, 181-187
- **Problema**: `dailyAverageCents` divide el gasto del mes entre `getMonthDateRange(selectedMonth).end.getDate()` (días totales del mes) SIEMPRE. En el mes en curso (p. ej. día 8 de un mes de 30) el "Gasto medio diario" se infravalora ~73%, y en meses futuros vacíos muestra 0,00 €. El usuario lee un KPI etiquetado como "medio diario" que es engañoso justo para el mes que más le importa (el actual). Viola el principio "Data first" y "Instant clarity" de DESIGN.md.
- **Recomendación**: Para el mes en curso, dividir entre los días transcurridos hasta hoy (no entre los días del mes). Para meses futuros sin datos, mostrar "—" como ya se hace en savingsRate (BalanceCards.tsx:175). Centralizar el cálculo en utils/helpers para mantener DRY.

- **Severidad**: 🟠 Alto
- **Categoría**: Visual / Accesibilidad (lenguaje de color de marca)
- **Ubicación**: src/components/dashboard/BalanceCards.tsx:173-179
- **Problema**: La tarjeta "Tasa de ahorro" usa siempre `SUMMARY_COLORS.violet` independientemente del valor. Una tasa de ahorro negativa (gastas más de lo que ingresas) se muestra en el mismo violeta neutro que una positiva. El lenguaje de color de DESIGN.md (§Color language: Emerald=positivo, Rose=negativo) pide señalar lo favorable/desfavorable, y el resto de KPIs (income/expense/balance) sí lo hacen vía DeltaBadge. Inconsistencia que oculta una señal financiera relevante.
- **Recomendación**: Aplicar tono condicional como en la tarjeta Balance (BalanceCards.tsx:160): `SUMMARY_COLORS.success` si savingsRate ≥ 0, `SUMMARY_COLORS.danger` si < 0, manteniendo el indicador secundario (el % ya es texto, cumple "más allá del color"). Reutilizar el patrón ya existente en el mismo archivo.

- **Severidad**: 🟠 Alto
- **Categoría**: Accesibilidad
- **Ubicación**: src/components/dashboard/charts/PeriodSelector.tsx:28-41
- **Problema**: El control segmentado de periodo (1A/5A/10A/Todo) usa `aria-pressed` (correcto) pero el estado activo se distingue por `bg-guard-primary text-white`; los inactivos son `text-guard-muted` (slate #64748B) sobre `bg-muted/30`. El texto muted sobre fondo tenue probablemente no alcanza 4.5:1 (texto pequeño `text-xs`). Además no hay focus ring visible declarado, dependiendo del default del navegador que el reset suele neutralizar.
- **Recomendación**: Verificar contraste de los botones inactivos (subir a `text-foreground/70` o similar) y añadir `focus-visible:ring-2 focus-visible:ring-guard-primary` siguiendo DESIGN.md §Accessibility ("visible focus rings"). Mismo patrón aplicable a MonthPicker (los botones de mes/año tampoco declaran focus ring explícito).

### 🟡 Medio

- **Severidad**: 🟡 Medio
- **Categoría**: Flujo / Onboarding (primera experiencia)
- **Ubicación**: src/app/(auth)/dashboard/page.tsx:58-122
- **Problema**: Para un usuario nuevo sin transacciones, la pantalla principal renderiza ~7 cards/widgets cada uno con su propio empty state independiente ("Sin gastos", "Sin proveedores", donut vacío, charts vacíos, fiscal vacío, bonos vacío). El resultado es una pantalla fragmentada de mensajes "vacío" repetidos sin un onboarding unificado ni CTA claro de "añade tu primer movimiento". DESIGN.md §Job to be done pide "feel in control"; un muro de vacíos transmite lo contrario.
- **Recomendación**: Detectar el estado "cuenta sin datos" (income+expense+categorías = 0) y mostrar un empty state global de bienvenida con CTA primario (reutilizar QuickExpenseActions o un botón a /movements) por encima de la rejilla de widgets, colapsando el ruido. Patrón onboard.

- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad / Resiliencia
- **Ubicación**: src/components/dashboard/charts/MonthTransactionsModal.tsx:53-136
- **Problema**: El modal de drill-down usa ModalBackdrop con `labelledBy`, pero no hay evidencia de focus-trap ni de devolución de foco al cerrar dentro de este componente (depende de ModalBackdrop, fuera del módulo). Además, la línea de descripción usa `tx.description || sub || title` (línea 103): si una transacción no tiene descripción ni categoría, cae al `title` genérico ("Gastos"), produciendo filas repetidas e indistinguibles. Con descripciones largas hay `truncate` pero sin tooltip de desbordamiento (existe OverflowTooltip en el design system, no se usa aquí).
- **Recomendación**: Confirmar focus-trap/return en ModalBackdrop; usar `OverflowTooltip` para descripciones y secundarios truncados; para filas sin descripción, mostrar la fecha como identificador primario en vez de repetir el título.

- **Severidad**: 🟡 Medio
- **Categoría**: Visual / Consistencia (tokens)
- **Ubicación**: src/components/dashboard/widgets/FixedVsVariableCard.tsx:21-22; TopVendorsWidget.tsx:24; CategoryBreakdown.tsx:32,127
- **Problema**: Colores hardcodeados como hex literales (`FIXED_COLOR = '#4F46E5'`, `VARIABLE_COLOR = '#F59E0B'`, `VENDOR_COLOR = '#8B5CF6'`, fallback `'#6366F1'`) en vez de derivarse de los tokens guard-*. chartConfig.ts ya centraliza `CHART_COLORS`/`CATEGORY_PALETTE`; duplicar los hex rompe el principio "Consistent restraint" de DESIGN.md y crea deriva (p. ej. el fallback `#6366F1` no es ninguno de los colores de marca de la tabla). 
- **Recomendación**: Consumir `CHART_COLORS.balance`, `CATEGORY_PALETTE` y un token de warning desde chartConfig.ts en todos los widgets; eliminar los hex sueltos. Quick win de bajo riesgo.

- **Severidad**: 🟡 Medio
- **Categoría**: Visual / Accesibilidad (color-only)
- **Ubicación**: src/components/dashboard/charts/CashFlowTrendChart.tsx:96-120; CategoryTrendsCard.tsx:84-96
- **Problema**: En las series de los charts, ingreso/gasto/balance y las categorías apiladas se diferencian SOLO por color (barras verde/roja, áreas de colores). DESIGN.md §Accessibility exige "Income/expense must have secondary indicators beyond color" y considerar daltonismo. La leyenda ayuda pero las propias series superpuestas (áreas apiladas semitransparentes, fillOpacity 0.5) son difíciles de distinguir para un usuario con deuteranopía.
- **Recomendación**: En el área apilada, considerar patrones/dash o un orden estable con etiquetas; para barras income/expense, el icono de la leyenda ya distingue pero conviene asegurar etiqueta textual en el tooltip (ya presente) y verificar contraste de las opacidades. Documentar la decisión si se acepta el riesgo.

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad / Consistencia
- **Ubicación**: src/components/dashboard/widgets/FiscalSummaryCard.tsx:48-54, 78-88
- **Problema**: `useInvoices({ status: FINALIZED })` se usa para "facturas pendientes de cobro" sumando `inv.totalCents` de TODAS las facturas finalizadas (sin filtrar por trimestre/mes del dashboard), mientras IVA 303 e IRPF 130 SÍ derivan del trimestre seleccionado. El usuario ve dos métricas con scope temporal distinto en la misma card sin que el copy lo aclare; "T{quarter} {year}" en la cabecera (línea 63) sugiere que todo es del trimestre. Confunde el alcance de "Facturas pendientes".
- **Recomendación**: Clarificar el microcopy (etiqueta "Facturas pendientes (total)" o un subtítulo) o filtrar las facturas por el periodo de la card para coherencia de scope.

- **Severidad**: 🟡 Medio
- **Categoría**: Resiliencia / Responsive (overflow números grandes)
- **Ubicación**: src/components/ui/SummaryCard.tsx:47-48; src/components/dashboard/widgets/FixedVsVariableCard.tsx:93
- **Problema**: El valor del KPI usa `whitespace-nowrap` + `text-2xl` para mantener el símbolo en una línea. En la rejilla `grid-cols-2` en móvil (page/BalanceCards.tsx:115), un importe grande (p. ej. "1.234.567,89 €") en una columna estrecha hará overflow horizontal del texto nowrap (no hay truncate ni reducción de tamaño). Mismo riesgo en el total de FixedVsVariable (`text-2xl tabular-nums`).
- **Recomendación**: Aplicar truncado con OverflowTooltip o escalado responsivo del tamaño de fuente para importes largos en móvil; alternativamente usar formato compacto (formatEuroAxis ya existe para "1,2M €") en pantallas pequeñas. Verificar con valores de 7+ dígitos.

### 🟢 Bajo

- **Severidad**: 🟢 Bajo
- **Categoría**: Copy
- **Ubicación**: src/messages/es.json → dashboard.widgets.due-in-days ("vence en {days} d"); dashboard.widgets.next-model ("Modelo {model}")
- **Problema**: La abreviatura "d" para días en "vence en {days} d" es críptica en español (mejor "días" o "d."). Menor, pero el espacio entre número y "d" se ve descuidado frente al resto de microcopy cuidado.
- **Recomendación**: Usar "vence en {days} días" (con pluralización si el sistema i18n lo soporta) o "{days} d.".

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual / Consistencia
- **Ubicación**: src/components/dashboard/charts/CategoryTrendsCard.tsx:62 ("h-72") vs CashFlowTrendChart.tsx:64 / YtdBalanceCard.tsx:55 ("min-h-[18rem]")
- **Problema**: Los charts usan alturas mínimas inconsistentes: `h-72` (altura fija) en categorías vs `min-h-[18rem]` en los otros dos. `h-72` = 18rem también, pero al ser fija (no min) impide que el chart crezca, mientras los hermanos sí. Inconsistencia de tokens de layout.
- **Recomendación**: Unificar a `min-h-[18rem]` (o un token compartido) para coherencia vertical entre charts de la misma sección.

- **Severidad**: 🟢 Bajo
- **Categoría**: Accesibilidad
- **Ubicación**: src/components/dashboard/BalanceCards.tsx:175; CategoryDistributionCard.tsx:117-120
- **Problema**: El placeholder "—" (em dash) para savings rate sin datos y el total superpuesto en el centro del donut (`pointer-events-none`) no tienen contexto para lector de pantalla; "—" se lee como guion sin significado y el total del donut compite con el `aria` inexistente del chart.
- **Recomendación**: Añadir `aria-label` descriptivo al valor "—" (p. ej. "Sin datos suficientes") y `sr-only` al total central del donut.

- **Severidad**: 🟢 Bajo
- **Categoría**: Usabilidad
- **Ubicación**: src/components/dashboard/widgets/VouchersWidget.tsx:91-97
- **Problema**: La barra de progreso de bono consumido usa `bg-guard-primary` (indigo) tanto activa como neutral; el aviso "expira pronto" usa `text-guard-warning`. La barra de progreso de consumo no señala visualmente cuando el bono está casi agotado (solo cambia a muted cuando ya está a 0). Pierde una señal preventiva.
- **Recomendación**: Considerar tono de advertencia en la barra cuando consumedPct supere un umbral (p. ej. ≥85%), reutilizando guard-warning, con su etiqueta textual de remaining ya presente como indicador secundario.

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. **Tono condicional en "Tasa de ahorro"** (BalanceCards.tsx:173-179): aplicar success/danger según signo, reutilizando el patrón ya existente en la tarjeta Balance. Una línea de lógica, alinea con el lenguaje de color de marca.
2. **Corregir el "Gasto medio diario" del mes en curso** (BalanceCards.tsx:108-110): dividir entre días transcurridos y mostrar "—" en meses futuros. Elimina un KPI engañoso en la pantalla más visitada.
3. **Eliminar hex hardcodeados** (FixedVsVariableCard.tsx:21-22, TopVendorsWidget.tsx:24, CategoryBreakdown.tsx:32): consumir CHART_COLORS/CATEGORY_PALETTE desde chartConfig.ts. Refuerza la consistencia del design system sin cambios visuales.

## Top 2 mejoras estructurales

1. **Accesibilidad de los gráficos**: introducir un patrón reutilizable (wrapper con `role="img"` + `aria-label` resumen y/o tabla `sr-only`) para los 4 charts Recharts, declarando además las rankings/leyendas existentes como alternativa textual del donut. Resuelve el hallazgo crítico de forma sistemática y evita repetir la solución por chart.
2. **Onboarding unificado de cuenta vacía**: detectar el estado "sin datos" a nivel de página y sustituir el muro de empty states fragmentados por una pantalla de bienvenida con CTA primario (añadir primer movimiento). Mejora drásticamente la primera experiencia y el principio "feel in control" de DESIGN.md.
