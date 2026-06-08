# Auditoría UX/UI — Bonos (Vouchers) — embebido

> Skills aplicados: critique (jerarquía/IA/resonancia), onboard (empty states/descubribilidad), harden (resiliencia/errores/overflow), clarify (microcopy/labels), audit (a11y/theming/responsive), polish (alineación/detalle)
>
> Archivos revisados:
> - src/components/dashboard/widgets/VouchersWidget.tsx:39-101, 103-197
> - src/components/vouchers/VoucherFormModal.tsx:30-259
> - src/components/vouchers/VoucherDetailModal.tsx:32-203
> - src/components/skydiving/SkydiveVoucherSelect.tsx:25-91
> - src/components/transactions/TransactionForm.tsx:47-122, 137-211, 449-518
> - src/components/transactions/TransactionList.tsx:128-135, 240-245, 356-363, 585
> - src/hooks/useVouchers.ts:107-168
> - src/hooks/useSkydiveVouchers.ts:12-22
> - src/schemas/voucher.ts:16-33
> - src/components/ui/ModalBackdrop.tsx:18-58
> - src/components/ui/EmptyState.tsx:13-22
> - src/app/(auth)/dashboard/page.tsx:120
> - src/messages/es.json (vouchers.*, transactions.form.fields.voucher*, skydiving.voucher.*)
> - src/messages/en.json (idem)

## Resumen ejecutivo

El módulo de Bonos está bien construido a nivel técnico: paridad i18n completa (todas las claves `t('...')` existen en es.json y en.json), modales con focus-trap y Escape (ModalBackdrop), uso correcto de céntimos (`formatCurrency`, `centsToEuros`) y tokens de diseño (`guard-primary`, `card`, `rounded-lg`, transición 200ms). Los problemas principales son de descubribilidad (el módulo no tiene página propia y su único punto de entrada es un widget al fondo de la sección "Histórico" del dashboard), de feedback ante errores destructivos (el borrado puede fallar en silencio) y de semántica de color del dinero: las barras de progreso y los importes de consumo usan indigo/neutro sin el indicador secundario de "gasto" que exige DESIGN.md. También hay fricción de onboarding (empty state sin CTA) y un riesgo de barra de progreso que no comunica el sobreconsumo.

## Hallazgos

### 1. El borrado de un bono puede fallar en silencio
- **Severidad**: 🔴 Crítico
- **Categoría**: Flujo / Usabilidad
- **Ubicación**: src/components/vouchers/VoucherDetailModal.tsx:38-49, 182-197
- **Problema**: `handleDelete` hace `try { await deleteVoucher.mutateAsync(...) } catch (_error) {}` y solo se apoya en `deleteVoucher.isPending` para deshabilitar el botón. No se renderiza en ningún sitio `deleteVoucher.isError` ni `deleteVoucher.errorMessage`. Si el backend rechaza el borrado (p. ej. el bono tiene consumos vinculados / conflicto), el usuario pulsa "Confirmar", el spinner desaparece y no pasa nada: cero feedback. En un módulo financiero, una acción destructiva que "no responde" destruye la confianza y puede llevar a reintentos a ciegas.
- **Recomendación**: Mostrar un bloque de error igual al del formulario (VoucherFormModal.tsx:226-232, `role="alert"` con `bg-guard-danger/10`). `useApiMutation` ya expone `errorMessage` traducido (patrón documentado en CLAUDE.md); renderizar `deleteVoucher.errorMessage` bajo los botones de acción. Añadir clave `vouchers.delete.error` en ambos messages.

### 2. Importes de consumo y barra de progreso no marcan "gasto" (color sin indicador secundario)
- **Severidad**: 🟠 Alto
- **Categoría**: Accesibilidad / Visual
- **Ubicación**: VoucherDetailModal.tsx:108-113, 163-165; VouchersWidget.tsx:71-76
- **Problema**: Los consumos de un bono SON gastos (transacciones de tipo `expense`), pero se muestran en color neutro `text-foreground` sin signo ni icono (`{formatCurrency(tx.amountCents)}`). Además la barra de progreso de "consumido" se pinta con `bg-guard-primary` (indigo = acción), no con rose ni con ningún indicador secundario. DESIGN.md (líneas 19, 45-46) es explícito: "ingreso/gasto siempre con indicador secundario, nunca solo color". Un usuario daltónico no distingue saldo restante de saldo consumido más allá de la longitud de la barra, y los consumos parecen importes neutros, no salidas de dinero.
- **Recomendación**: Para los consumos, alinear con el patrón de TransactionList (que sí usa color+icono para gasto): mostrar el importe como gasto con su tratamiento estándar (`text-guard-danger` + signo/indicador), o al menos un prefijo/icono. Para la barra, mantener indigo como "tinta de marca" pero añadir el `%` consumido como texto (ya hay `consumedPct` calculado) para no depender solo del color/longitud.

### 3. Descubribilidad: el módulo solo vive en un widget al fondo del dashboard
- **Severidad**: 🟠 Alto
- **Categoría**: Flujo / IA (Arquitectura de información)
- **Ubicación**: src/app/(auth)/dashboard/page.tsx:120 (último elemento de la sección "Histórico", tras CashFlowTrendChart, YtdBalanceCard y CategoryTrendsCard)
- **Problema**: El módulo no tiene página propia; su única superficie es `VouchersWidget`, colocado como último hijo de la sección histórica del dashboard, debajo de gráficos de tendencias. Un saldo prepago es un activo financiero que el usuario querrá consultar y al que vincular gastos con frecuencia; enterrarlo al final exige scroll y no hay enlace de navegación. Principio "claridad instantánea en 2s" (DESIGN.md:54) no se cumple para esta función.
- **Recomendación**: Subir el widget a la zona principal del dashboard (junto a los widgets de resumen, no al final del bloque "Histórico"), o crear una entrada de navegación / página `/bonos` reutilizando `VouchersWidget` a pantalla completa. Mínimo: reubicarlo por encima de los charts de tendencia para que sea visible sin scroll en laptop/tablet (público objetivo, DESIGN.md:5-6).

### 4. Empty state sin CTA — primera experiencia friccionada
- **Severidad**: 🟡 Medio
- **Categoría**: Flujo / Usabilidad (onboard)
- **Ubicación**: VouchersWidget.tsx:148-149
- **Problema**: Cuando no hay bonos, se muestra `EmptyState` con título y subtítulo pero sin acción. `EmptyState` soporta `action` (EmptyState.tsx:7,19) y no se aprovecha. El usuario debe localizar el discreto enlace "+ Nuevo bono" del header (texto pequeño `text-sm`, VouchersWidget.tsx:132-139) para empezar. Es la primera experiencia del módulo y carece de un CTA primario claro.
- **Recomendación**: Pasar `action` al EmptyState con un botón primario (`bg-guard-primary`, mismo estilo que el submit del formulario) que abra `setCreateOpen(true)`. Reutiliza la clave existente `vouchers.widget.new`.

### 5. La barra de progreso se satura al 100% y oculta el sobreconsumo
- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad / Visual (harden)
- **Ubicación**: VoucherDetailModal.tsx:54-58, 104; VouchersWidget.tsx:41-45, 67
- **Problema**: `consumedPct` está limitado con `Math.min(100, ...)` y el saldo restante con `Math.max(0, voucher.remainingCents)`. Si `consumedCents > totalAmountCents` (sobreconsumo, posible al vincular gastos manuales que exceden el saldo), la UI muestra barra llena al 100% y "0,00 €" restante, ocultando que el bono está en negativo. En finanzas, ocultar un saldo negativo es engañoso.
- **Recomendación**: Detectar `remainingCents < 0` y mostrar un estado explícito (texto "Excedido" con `guard-warning`/`guard-danger` + icono, no solo color) y/o el importe real negativo. Reutilizar el patrón de estado "Caducado" ya presente (VouchersWidget.tsx:91-92).

### 6. La fila del bono es un `<button>` con bloques anidados — semántica y line-clamp frágiles
- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad / Responsive
- **Ubicación**: VouchersWidget.tsx:52-100
- **Problema**: Toda la fila es un único `<button>` que envuelve título, barra, unidades e indicador de caducidad. El nombre accesible del botón será la concatenación de todo su texto (p. ej. "Bono túnel · 120,00 € · 5/15 min de 300,00 € caduca en 12 d"), largo y poco claro para lectores de pantalla. Además, con descripciones largas el `truncate` (línea 58) corta el título pero el importe (`flex-shrink-0`, línea 63) compite por el espacio; en móvil (sin breakpoint específico, el widget no define `sm:`) el bloque de unidades + total + caducidad de la línea 78-98 puede desbordar al apilar mucho texto.
- **Recomendación**: Añadir `aria-label` explícito al botón (p. ej. "Ver detalle del bono {nombre}, saldo {restante}") y dejar el contenido como `aria-hidden` decorativo, o usar un patrón de card con un botón "Ver" interno. Verificar overflow con etiquetas de unidad largas (`unitLabel` admite hasta 20 chars, schema:21) y nombres largos en viewport estrecho.

### 7. Categoría bloqueada por el bono: el cambio es silencioso y sin deshacer claro
- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad / Copy
- **Ubicación**: src/components/transactions/TransactionForm.tsx:198-211, 341-351
- **Problema**: Al seleccionar un bono en el formulario de transacción, `handleVoucherChange` sobreescribe `categoryId` con la categoría del bono (línea 209) y el selector de categoría se reemplaza por una caja deshabilitada con el texto "(categoría del bono)". El usuario que ya había elegido otra categoría la pierde sin aviso. El microcopy `voucher-locked-category` ("categoría del bono" / "voucher category") explica el qué pero no el porqué ni cómo revertir (hay que desmarcar el checkbox del bono).
- **Recomendación**: Añadir un texto de ayuda breve ("La categoría se fija a la del bono mientras esté vinculado") y, si se sobreescribe una categoría previa, dejarlo claro. Aprovechar `Tooltip`/microcopy existente. Clave nueva en ambos messages.

### 8. Confirmación de borrado inline en vez del patrón ConfirmDialog del sistema
- **Severidad**: 🟡 Medio
- **Categoría**: Visual / Consistencia
- **Ubicación**: VoucherDetailModal.tsx:36, 38-49, 182-196
- **Problema**: El borrado usa un patrón propio de doble clic (`confirmDelete` cambia el botón de "Eliminar" a "Confirmar"). El proyecto tiene un componente `ConfirmDialog` (src/components/ui/ConfirmDialog.tsx) precisamente para acciones destructivas. El patrón inline no advierte de la consecuencia (¿qué pasa con los consumos vinculados?) y rompe la "restricción consistente" (DESIGN.md:56). Además, si el usuario pulsa una vez y cierra/reabre, el estado se resetea sin rastro.
- **Recomendación**: Sustituir el doble clic por `ConfirmDialog` con título, descripción del impacto (consumos vinculados) y botón destructivo. Garantiza consistencia con el resto de borrados del proyecto.

### 9. Mensaje de error de carga genérico en español hardcodeado en el hook
- **Severidad**: 🟢 Bajo
- **Categoría**: Copy / i18n
- **Ubicación**: src/hooks/useVouchers.ts:23, 30, 38, 45 ('Error al cargar bonos', 'Error desconocido')
- **Problema**: Los fallbacks de error en `fetchVouchers`/`fetchVoucher` son literales en español dentro del código (CLAUDE.md exige i18n y código en inglés; estos textos podrían llegar a UI vía `data.error`). La UI visible usa `t('vouchers.errors.load')` correctamente, pero estos strings son inconsistentes con la convención y no traducibles.
- **Recomendación**: Usar claves de `API_ERROR`/`VALIDATION_KEY` o constantes en inglés como en el resto de request functions; estos `throw new Error(...)` ya son capturados por TanStack Query y la UI muestra el `ErrorState` traducido, así que el literal solo es ruido — pasarlo a inglés o a una constante.

### 10. Microcopy `units-count` ("{consumed}/{total}") ambiguo sin contexto
- **Severidad**: 🟢 Bajo
- **Categoría**: Copy
- **Ubicación**: VouchersWidget.tsx:82-89; es.json `vouchers.units-count` = "{consumed}/{total}"
- **Problema**: En la fila del widget se muestra "5/15 min de 120,00 €". El "5/15" no lleva etiqueta de qué representa (consumido/total) y queda pegado a la etiqueta de unidad y al "de {total}" del importe, mezclando dos magnitudes (unidades y euros) en una misma línea sin separadores claros. Para un vistazo de 2s puede confundir consumido con restante.
- **Recomendación**: Clarificar el formato (p. ej. usar la misma lógica "restantes" que el detalle, `vouchers.units-remaining`) o separar visualmente unidades de euros. Mantener `tabular-nums` (ya presente).

### 11. `onWheel blur` mejora el número pero el spinner del input number persiste
- **Severidad**: 🟢 Bajo
- **Categoría**: Usabilidad / Polish
- **Ubicación**: VoucherFormModal.tsx:148-149, 188; (también TransactionForm)
- **Problema**: Buen detalle el `onWheel={(e)=>e.currentTarget.blur()}` para evitar cambios accidentales con la rueda. Es consistente. Sin observación negativa salvo confirmar que el placeholder de importe usa coma decimal ("0,00") mientras `type=number` espera punto en algunos locales; el usuario podría dudar del separador.
- **Recomendación**: Mantener; opcionalmente alinear placeholder con el separador que el input number acepta en el locale, o documentar. Impacto mínimo.

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. **Mostrar el error de borrado** en VoucherDetailModal renderizando `deleteVoucher.errorMessage` con el mismo bloque `role="alert"` ya usado en el formulario (Hallazgo 1). Una clave i18n + ~5 líneas.
2. **CTA en el empty state** del widget pasando `action` al `EmptyState` con un botón primario que abra el formulario (Hallazgo 4). Reusa `vouchers.widget.new`.
3. **Pasar a inglés/constante los literales de error del hook** `useVouchers.ts` (Hallazgo 9). Cambio mecánico que cumple convención i18n/código.

## Top 2 mejoras estructurales

1. **Elevar la descubribilidad del módulo** (Hallazgo 3): mover `VouchersWidget` a la zona principal del dashboard o crear una página `/bonos` con entrada de navegación, ya que hoy es el único acceso y está enterrado bajo los gráficos de tendencias.
2. **Aplicar la semántica de gasto del sistema a los consumos y barras** (Hallazgos 2 y 5): tratar los importes de consumo como gastos (color + indicador secundario) y dar un estado explícito al sobreconsumo/saldo negativo, alineando el módulo con DESIGN.md y con el resto de superficies financieras (TransactionList).
