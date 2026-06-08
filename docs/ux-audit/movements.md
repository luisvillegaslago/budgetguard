# Auditoría UX/UI — Movimientos / Transacciones

> Skills aplicados: critique (jerarquía/IA/resonancia), audit (a11y/responsive/theming), harden (resiliencia/i18n/overflow), clarify (microcopy/errores), polish (consistencia/detalle)
> Archivos revisados: src/app/(auth)/movements/page.tsx:1-194; src/components/transactions/TransactionList.tsx:54-595; src/components/transactions/TransactionForm.tsx:35-694; src/components/transactions/TransactionGroupRow.tsx:39-319; src/components/transactions/TransactionGroupForm.tsx:48-410; src/components/transactions/TripGroupRow.tsx:26-248; src/components/transactions/QuickExpenseActions.tsx:22-69; src/components/transactions/PendingTransactionsBanner.tsx:19-120; src/components/transactions/CategorySelector.tsx:27-381; src/components/movements/CategoryBrowser.tsx:32-147; src/components/movements/MovementDetail.tsx:38-224; src/components/movements/CompanyMovementDetail.tsx:30-133; src/components/ui/DeleteButton.tsx:21-50; src/schemas/transaction.ts:33-78; src/utils/helpers.ts:168-170; src/messages/es.json + en.json (paridad 1356/1356)

## Resumen ejecutivo

El módulo está maduro: paridad i18n perfecta (1356 claves en ambos idiomas, 0 huérfanas), uso correcto de céntimos vía `formatCurrency`, estados loading/empty/error/search cubiertos, y tokens de diseño bien aplicados (cards, radius, transición 200ms, `tabular-nums` en importes). El problema transversal más serio es de **integridad del lenguaje de color/signo**: los grupos y los viajes (`TransactionGroupRow`, `TripGroupRow`) renderizan SIEMPRE el icono `ArrowUpRight` y el signo `-` con texto en `guard-danger`, incluso cuando el grupo es de tipo ingreso, contradiciendo la regla de DESIGN.md "ingreso/gasto con indicador más allá del color" y mostrando un signo monetario incorrecto. Le siguen acciones masivas sin confirmación ni feedback agregado (banner de pendientes), búsqueda de categorías sin normalización de acentos (incoherente con el resto), e inconsistencias de estados de error (markup inline vs `ErrorState`). El resto son detalles de pulido y hardening de bordes (fechas futuras, importes sin tope, affordance de acciones en hover).

## Hallazgos

- **Severidad**: 🔴 Crítico
- **Categoría**: Accesibilidad / Visual
- **Ubicación**: src/components/transactions/TransactionGroupRow.tsx:103,165,288,305 y src/components/transactions/TripGroupRow.tsx:72,119,211,228
- **Problema**: Las filas de grupo y de viaje calculan `isIncome = group.type === TRANSACTION_TYPE.INCOME` y conmutan el color del importe a `guard-success`, pero el icono está hardcodeado como `<ArrowUpRight />` y el importe se prefija siempre con `-`. Para un grupo/viaje de tipo ingreso, el usuario ve texto verde con un signo menos y flecha hacia arriba-derecha (gasto). El indicador secundario al color (el requisito de DESIGN.md §Accessibility "Income/expense must have secondary indicators beyond color") queda invertido respecto al color, y el signo monetario es directamente incorrecto. Para daltónicos el único dato fiable (el signo/flecha) miente.
- **Recomendación**: Replicar el patrón ya correcto de `TransactionRow` (TransactionList.tsx:91-97): `isIncome ? <ArrowDownLeft/> : <ArrowUpRight/>` y `isIncome ? '+' : '-'`. Aplicarlo tanto en la cabecera del grupo como en cada línea del desglose (líneas 288, 305 / 211, 228).

- **Severidad**: 🟠 Alto
- **Categoría**: Flujo / Usabilidad
- **Ubicación**: src/components/transactions/PendingTransactionsBanner.tsx:41-45,104-114
- **Problema**: `handleMarkAllAsPaid` recorre los pendientes y dispara una mutación `updateStatus.mutate(...)` independiente por cada transacción, sin confirmación previa ni feedback agregado. En una acción financiera irreversible-percibida ("marcar todo como pagado"), no hay diálogo de confirmación (el proyecto tiene `ConfirmDialog`), no hay barra de progreso/contador, y si una de las N mutaciones falla el usuario no se entera (el banner simplemente se va encogiendo a medida que algunas resuelven). Contradice DESIGN.md principio "Calma sobre alarma" y "Eficiencia respetuosa" al no dar control ni cierre.
- **Recomendación**: Pedir confirmación con `ConfirmDialog` (mostrando importe total `formatCurrency(totalCents)` y nº afectados), y exponer un estado de error agregado. Idealmente, un único endpoint/mutación batch en vez de N requests; mientras tanto, deshabilitar el botón mientras `updateStatus.isPending` (ya se hace en línea 108) y mostrar un toast de resultado.

- **Severidad**: 🟠 Alto
- **Categoría**: Usabilidad / Responsive
- **Ubicación**: src/components/transactions/TransactionList.tsx:185-217 y TransactionGroupRow.tsx:105-141, TripGroupRow.tsx:74-98
- **Problema**: En escritorio las acciones (marcar pagado / editar / borrar) viven dentro de un contenedor `overflow-hidden max-w-0 ... group-hover:max-w-[96px]`, es decir están totalmente ocultas hasta el hover del ratón. En dispositivos táctiles con viewport ancho (tablet en horizontal, que es uno de los usos declarados en DESIGN.md "laptop/tablet") no hay hover: el usuario no puede editar ni borrar una transacción individual desde la rama de escritorio. Existe `group-focus-within` para teclado, pero el patrón táctil-ancho queda sin affordance.
- **Recomendación**: Mostrar al menos un affordance permanente de baja prominencia (p. ej. icono de tres puntos / acciones visibles a baja opacidad como ya hace `DeleteButton` con `sm:opacity-100` en la rama móvil) o detectar `(hover: none)` para no colapsar las acciones. Reutilizar el patrón móvil de dos filas con acciones siempre visibles también en breakpoints anchos sin hover.

- **Severidad**: 🟠 Alto
- **Categoría**: Usabilidad / Copy
- **Ubicación**: src/components/movements/CategoryBrowser.tsx:39,47-48 (vs src/utils/helpers.ts:168-170 y TransactionList.tsx:333-340)
- **Problema**: La búsqueda de categorías filtra con `c.name.toLowerCase().includes(term)`, sin normalizar acentos. Hay un helper `normalizeForSearch` (NFD + quita diacríticos) que `TransactionList` y `matchesSearch` SÍ usan. Resultado incoherente: buscar "tunel" no encuentra "Túnel de viento" en el navegador de categorías, pero sí en la lista de transacciones. El español tiene acentos frecuentes (Túnel, Nómina, Préstamo), así que el fallo es habitual.
- **Recomendación**: Sustituir `term`/`.toLowerCase()` por `normalizeForSearch(search)` y comparar también `normalizeForSearch(c.name)` / `normalizeForSearch(sub.name)`, igual que en `matchesSearch`. Mantiene consistencia y restricción de patrón (DESIGN.md principio 5).

- **Severidad**: 🟡 Medio
- **Categoría**: Visual / Flujo
- **Ubicación**: src/components/movements/MovementDetail.tsx:111-122 y src/components/movements/CompanyMovementDetail.tsx:65-76
- **Problema**: Ambos componentes renderizan su estado de error con markup inline (`AlertCircle` + `<p>` + botón `btn-ghost` "retry") en lugar del componente reutilizable `ErrorState` que sí usa `TransactionList` (línea 486). Inconsistencia visual y de mantenimiento: el copy, el tamaño del icono y la disposición difieren de los demás errores del módulo, rompiendo "Consistent restraint" (DESIGN.md principio 5).
- **Recomendación**: Reemplazar ambos bloques por `<ErrorState message={...} onRetry={() => refetch()} />` para unificar el tratamiento de error del módulo.

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad / Flujo
- **Ubicación**: src/components/transactions/TransactionForm.tsx:322-332 y src/schemas/transaction.ts:37
- **Problema**: El input de fecha (`<input type="date">`) y el esquema `z.coerce.date()` no acotan el rango: se pueden crear transacciones con fecha futura arbitraria (p. ej. 2031) sin ningún aviso. Para una app de "entender dónde fue el dinero" (DESIGN.md §Users) una fecha futura distorsiona los resúmenes mensuales sin que el usuario reciba feedback. Tampoco hay tope superior en `amount` (línea 294-309, sólo `min="0.01"`), permitiendo importes accidentalmente enormes que rompen el layout de `min-w-[90px]`.
- **Recomendación**: Añadir `max={today}` (o un margen razonable) al input de fecha y un mensaje de validación si la fecha es futura; opcionalmente un tope de cordura al importe en el schema. Coherente con el principio "datos primero" y con harden de edge cases.

- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad
- **Ubicación**: src/components/ui/DeleteButton.tsx:38-48 (usado en TransactionList, TransactionGroupRow, TripGroupRow)
- **Problema**: El estado de confirmación de borrado se comunica visualmente SOLO por color (fondo `guard-danger`) y por cambio de `aria-label`; el icono sigue siendo el mismo `Trash2` sin etiqueta de texto visible. Un usuario daltónico vidente no distingue "primer clic" de "confirmar" — sólo ve el icono y un cambio de tono. DESIGN.md exige indicadores más allá del color para señales de acción.
- **Recomendación**: En estado `showConfirm`, añadir un microtexto visible ("Confirmar") junto al icono, o cambiar el glifo (p. ej. `Trash2` → `Check`/`AlertTriangle`), de modo que el cambio no dependa únicamente del color.

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad
- **Ubicación**: src/app/(auth)/movements/page.tsx:130-155 y src/components/transactions/TransactionList.tsx:527-545
- **Problema**: El módulo mensual ofrece filtro por estado (todos/pagados/pendientes/cancelados) dentro de la lista, pero el filtro por tipo (ingreso/gasto, `FILTER_TYPE`) sólo se puede activar desde `BalanceCards` del dashboard (la lista lo lee de `filters.type` pero no lo expone aquí). En la página de Movimientos, donde el usuario llega a revisar movimientos, no hay control visible para alternar ingreso/gasto: queda como estado "fantasma" heredado. Genera confusión si el filtro venía activo desde otra vista (la lista aparece filtrada sin control que lo explique).
- **Recomendación**: Exponer un control de tipo (segmented `Todos/Ingresos/Gastos`) junto al filtro de estado en `TransactionList`, o al menos mostrar un chip "filtrando: gastos ✕" para que el filtro heredado sea visible y desactivable.

- **Severidad**: 🟢 Bajo
- **Categoría**: Copy
- **Ubicación**: src/components/transactions/TransactionGroupRow.tsx:75-77,173-175
- **Problema**: El recuento de líneas de un grupo se construye con `t('common.records', { count }).split(' ').slice(1).join(' ')`, troceando la cadena traducida para descartar el número y quedarse con el sustantivo. Es frágil: depende de que la traducción tenga la forma "<número> <palabra(s)>" en todos los idiomas/plurales; si una traducción antepone el sustantivo o usa puntuación, el resultado se corrompe.
- **Recomendación**: Crear una clave i18n dedicada al sustantivo (p. ej. `transactions.groups.item-count` con interpolación `{count}`) en vez de manipular la cadena de `common.records` con `split`.

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual / Responsive
- **Ubicación**: src/components/transactions/TransactionForm.tsx:79-99 (importe) y TransactionList.tsx:82 (`min-w-[90px]`)
- **Problema**: El importe usa `min-w-[90px]` con `tabular-nums` (bien), pero no hay `max-w` ni truncado para importes muy grandes (p. ej. 1.234.567,89 €). En la fila de escritorio, junto a badges y acciones en hover, un importe largo puede empujar el layout. Es un edge case (cifras altas), pero la app es financiera y debe tolerarlas.
- **Recomendación**: Verificar el comportamiento con importes de 7+ dígitos; considerar `whitespace-nowrap` garantizado y, si procede, una abreviatura/tooltip para cifras extremas. Edge case de harden.

- **Severidad**: 🟢 Bajo
- **Categoría**: Usabilidad
- **Ubicación**: src/components/transactions/TransactionForm.tsx:476-482
- **Problema**: En el selector de bono, las opciones muestran `formatCurrency(Math.max(0, v.remainingCents))`. El `Math.max(0, …)` enmascara un saldo negativo (sobreconsumo) mostrándolo como "0,00 €". El usuario no percibe que el bono está sobregirado, lo que puede llevar a registrar consumos sobre un bono agotado sin aviso.
- **Recomendación**: Mostrar el saldo real (o un indicador "agotado/sobregirado") en lugar de truncar a 0, para que el estado del bono sea honesto. Coherente con "datos primero".

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual
- **Ubicación**: src/components/movements/CategoryBrowser.tsx:78 y MovementDetail.tsx:49
- **Problema**: Los colores de fallback de categoría usan literales hex distintos del lenguaje de marca: `'#6366F1'` (indigo-500) en CategoryBrowser/MovementDetail, mientras DESIGN.md define `guard-primary = #4F46E5`. Pequeña deriva de tokens; el color de acción/categoría por defecto no coincide con el indigo de marca.
- **Recomendación**: Centralizar el color de fallback en una constante alineada con `--guard-primary` (#4F46E5) o el token correspondiente, evitando literales dispersos.

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. Corregir signo e icono de importe en `TransactionGroupRow` y `TripGroupRow` para que respeten `isIncome` (copiar el patrón ya correcto de `TransactionRow`). Arregla un error de datos visible y de accesibilidad.
2. Cambiar la búsqueda de `CategoryBrowser` a `normalizeForSearch` para que encuentre categorías con acentos (Túnel, Nómina), igual que ya hace la lista de transacciones.
3. Sustituir el markup de error inline de `MovementDetail` y `CompanyMovementDetail` por el componente `ErrorState` ya existente, unificando los estados de error del módulo.

## Top 2 mejoras estructurales

1. Acciones masivas seguras: añadir confirmación (`ConfirmDialog` con importe total) y feedback agregado al "marcar todo como pagado", y migrar de N mutaciones individuales a una mutación batch única para consistencia transaccional y manejo de errores.
2. Affordance de acciones por fila independiente del hover: rediseñar el cluster editar/borrar/marcar-pagado para que sea accesible en táctil-ancho (tablet horizontal) y por teclado de forma consistente, en lugar de colapsarlo tras `group-hover`, alineando escritorio y móvil bajo un mismo patrón.
