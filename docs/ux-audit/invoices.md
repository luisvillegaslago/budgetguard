# Auditoría UX/UI — Facturas (Invoices)
> Skills aplicados: critique (jerarquía/IA/resonancia, base) · harden (resiliencia/errores/i18n/overflow) · clarify (microcopy/errores/labels) · audit (a11y/responsive/theming)
> Archivos revisados: src/app/(auth)/invoices/page.tsx:35-92 · src/app/(auth)/invoices/[id]/page.tsx:30-599 · src/components/invoices/InvoiceList.tsx:22-93 · src/components/invoices/InvoiceForm.tsx:34-547 · src/hooks/useInvoices.ts:245-345 · src/components/ui/ModalBackdrop.tsx:18-58 · src/utils/money.ts:35-48 · src/utils/helpers.ts:35-59 · src/messages/es.json:1300-1385 · src/messages/en.json:1300-1385 · src/constants/finance.ts:648-665 · src/components/transactions/TransactionGroupForm.tsx:241-263 (patrón de referencia)

## Resumen ejecutivo

El módulo de Facturas está bien construido a nivel de datos (dinero en céntimos, máquina de estados completa, invalidaciones de caché correctas) y la paridad i18n es/en es total para las claves del namespace `invoices`. Sin embargo, el formulario de creación/edición **no tiene validación cliente activa** (define un esquema Zod pero nunca conecta `zodResolver`), por lo que los bloques `errors.*` son código muerto y se puede enviar una factura sin cliente, sin serie ni fecha. Además, las cinco modales de la página de detalle están hechas a mano sin `ModalBackdrop`, perdiendo focus-trap, Escape, bloqueo de scroll y semántica `role="dialog"`. El feedback de errores en acciones críticas (finalizar, descargar PDF) es silencioso. La jerarquía visual y el lenguaje de color cumplen DESIGN.md (estados con texto, no solo color).

## Hallazgos

- **Severidad**: 🔴 Crítico
- **Categoría**: Flujo / Usabilidad
- **Ubicación**: src/components/invoices/InvoiceForm.tsx:151-159 (y esquema 34-40)
- **Problema**: `useForm<InvoiceFormValues>({ defaultValues })` se instancia **sin** `resolver: zodResolver(InvoiceFormSchema)`. El esquema `InvoiceFormSchema` (líneas 34-40) está definido pero nunca se conecta. Consecuencia: RHF no registra ninguna regla, `errors.companyId`, `errors.prefixId`, `errors.invoiceDate` (renderizados en 331/354/362) **nunca se pueblan**, y `onSubmit` se ejecuta con `prefixId: 0` / `companyId: 0`. El usuario puede pulsar "Crear" con el formulario vacío y solo recibe el error del backend (round-trip innecesario) o un fallo poco claro. Las otras 13 formas del proyecto sí usan `zodResolver`.
- **Recomendación**: Conectar `resolver: zodResolver(InvoiceFormSchema)` como en `RecurringExpenseForm.tsx:97` / `TransactionForm.tsx:9`. Añadir mensaje a `lineItems.min(1, VALIDATION_KEY...)` y validar que cada línea tenga importe > 0.

- **Severidad**: 🔴 Crítico
- **Categoría**: Copy / Accesibilidad
- **Ubicación**: src/components/invoices/InvoiceForm.tsx:331, 354, 362
- **Problema**: Aunque se active la validación, los errores se renderizan como `{errors.companyId.message}` — es decir, la clave cruda `validation.select-client` en pantalla, no el texto traducido. El patrón canónico del proyecto es `{t(errors.field.message ?? '')}` (ver `TransactionGroupForm.tsx:241,263`). El usuario vería literalmente "validation.select-client".
- **Recomendación**: Envolver con `t()` los tres mensajes y añadir `role="alert"` (como en `TransactionForm.tsx:311`) para anuncio por lector de pantalla.

- **Severidad**: 🟠 Alto
- **Categoría**: Accesibilidad / Usabilidad
- **Ubicación**: src/app/(auth)/invoices/[id]/page.tsx:428-474, 480-505, 508-538, 541-567, 570-596
- **Problema**: Las 5 modales de la página de detalle (selector de categoría + 4 confirmaciones) son `<div className="fixed inset-0 ...">` hechas a mano. No usan `ModalBackdrop` (que sí aporta focus-trap vía `useFocusTrap`, cierre con Escape, bloqueo de scroll de fondo y `role="dialog"`/`aria-modal`/`aria-labelledby`). Resultado: no se puede cerrar con Escape, el foco se escapa al contenido de fondo, y el fondo sigue scrolleando. Existe además un componente `ConfirmDialog` reutilizable sin usar.
- **Recomendación**: Migrar las confirmaciones a `ConfirmDialog` (src/components/ui/ConfirmDialog.tsx) y el selector de categoría a `ModalBackdrop`, igual que ya hace `InvoiceForm.tsx:311`.

- **Severidad**: 🟠 Alto
- **Categoría**: Flujo / Usabilidad
- **Ubicación**: src/hooks/useInvoices.ts:307-345 + src/app/(auth)/invoices/[id]/page.tsx:80-83, 205-211
- **Problema**: `useFinalizeInvoice` usa `useMutation` crudo, no `useApiMutation`, por lo que **no expone `errorMessage` traducido**. Si la emisión falla (p. ej. error de PDF/blob), la promesa rechaza, el `finally` no existe y la UI no muestra ningún mensaje: el botón vuelve a su estado sin explicación. La acción es fiscalmente crítica (genera documento fiscal). Mismo problema implícito en `handleFinalize` (page 80-83): no hay try/catch ni feedback de error.
- **Recomendación**: Migrar a `useApiMutation` (como el resto de mutaciones del hook) y renderizar `finalizeInvoice.errorMessage` en la modal de confirmación, junto al patrón `{mutation.errorMessage && <p className="text-sm text-guard-danger">...}` ya usado en `InvoiceForm.tsx:532`.

- **Severidad**: 🟠 Alto
- **Categoría**: Flujo / Resiliencia
- **Ubicación**: src/app/(auth)/invoices/[id]/page.tsx:112-150
- **Problema**: `handleDownloadPdf` captura cualquier error con `catch {}` vacío y hace fallback a `window.open(...)`. Si el fallback también falla (popup bloqueado, 500), el usuario no recibe ningún aviso: el spinner desaparece (`finally`) y aparenta éxito. Tampoco se distingue entre "factura sin número" y error real.
- **Recomendación**: Mostrar un toast/mensaje de error traducido en el `catch` (clave nueva `invoices.errors.pdf-download`, añadir a es/en) en lugar de fallar en silencio.

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad / Onboard
- **Ubicación**: src/app/(auth)/invoices/[id]/page.tsx:448-461
- **Problema**: El selector de categoría para "Marcar como pagada" itera `categories?.map(...)`. Si el usuario no tiene categorías de ingreso, la lista queda vacía y la modal se convierte en un callejón sin salida (solo input de comisión + botón Cancelar), sin explicar por qué no puede continuar.
- **Recomendación**: Añadir estado vacío con `EmptyState`/mensaje + enlace a crear categoría de ingreso (clave i18n nueva en ambos idiomas).

- **Severidad**: 🟡 Medio
- **Categoría**: Responsive
- **Ubicación**: src/components/invoices/InvoiceList.tsx:65-89
- **Problema**: El header de columnas es `hidden sm:grid`; en móvil cada fila colapsa a `grid` de una columna con valores apilados (número, cliente, fecha, total, badge) **sin etiquetas**. El usuario móvil ve cuatro líneas de texto sin saber cuál es la fecha y cuál el total, y el importe pierde su alineación a la derecha. La fila completa además no tiene rol/affordance de lista clara.
- **Recomendación**: En `<sm`, renderizar una tarjeta con etiqueta+valor (patrón "label: value") o al menos número + total destacados y fecha/estado secundarios. Mantener `formatCurrency` con alineación coherente.

- **Severidad**: 🟡 Medio
- **Categoría**: Responsive
- **Ubicación**: src/app/(auth)/invoices/page.tsx:67-83
- **Problema**: La barra de filtros (5 pestañas: Todas/Borrador/Emitida/Pagada/Cancelada) es `flex gap-1` sin manejo de overflow. En pantallas estrechas con etiquetas en español ("Borrador", "Cancelada") las pestañas pueden desbordar o comprimirse y romper la línea base inferior (`border-b`).
- **Recomendación**: Añadir `overflow-x-auto` con scroll horizontal y `whitespace-nowrap`, patrón habitual de tab-bars móviles.

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad
- **Ubicación**: src/app/(auth)/invoices/[id]/page.tsx:435-446, 86
- **Problema**: El input de comisión bancaria es `type="number"` con `placeholder="0,00"` (coma decimal). Los inputs `number` nativos no aceptan coma en muchos locales/navegadores; el usuario que escriba "12,50" puede ver el campo rechazado o vaciado antes de que `parseFloat(...replace(',', '.'))` (línea 86) lo procese. Inconsistente con el placeholder que sugiere coma.
- **Recomendación**: Usar `inputMode="decimal"` con `type="text"` y validar/normalizar al blur, o cambiar el placeholder a `0.00` para coincidir con el separador que el input `number` realmente acepta.

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual / Consistencia
- **Ubicación**: src/components/invoices/InvoiceForm.tsx:515-519 vs src/utils/money.ts:35-48
- **Problema**: El total del formulario se formatea a mano con `Intl.NumberFormat('es-ES', ...) + ' €'` en lugar de reutilizar `formatCurrency`. Igual ocurre con `formatRate` en detail (page 157-160). DRY: el proyecto tiene utilidad central de dinero.
- **Recomendación**: Como el cálculo es en euros (no céntimos), exponer/usar un helper de euros equivalente o convertir a céntimos y pasar por `formatCurrency` para garantizar formato idéntico (símbolo, signo) en toda la app.

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual / Consistencia
- **Ubicación**: src/app/(auth)/invoices/page.tsx:53 · [id]/page.tsx:163 · DESIGN.md:39
- **Problema**: DESIGN.md fija contenedor `max-w-7xl`. La lista usa `max-w-5xl` y el detalle `max-w-4xl`. Aunque el ancho reducido tiene sentido para la sensación "documento", la divergencia no está documentada y rompe la "restricción consistente" (principio 5).
- **Recomendación**: Documentar la excepción de ancho del módulo o alinear con un token compartido para facturas.

- **Severidad**: 🟢 Bajo
- **Categoría**: Accesibilidad
- **Ubicación**: src/app/(auth)/invoices/[id]/page.tsx:52-58
- **Problema**: El spinner de carga (`Loader2 animate-spin`) no tiene texto alternativo ni `role="status"`/`aria-label`; un lector de pantalla no anuncia "cargando". Mismo patrón en los spinners inline de botones (que sí están junto a texto, aceptable).
- **Recomendación**: Envolver el estado de carga de página con `role="status"` + texto visualmente oculto `t('common.loading')`, o usar el componente `LoadingSpinner` del design system.

- **Severidad**: 🟢 Bajo
- **Categoría**: Copy
- **Ubicación**: src/components/invoices/InvoiceForm.tsx:500 vs 472/445
- **Problema**: Inconsistencia de placeholders: importe usa `"0.00"` (punto), comisión bancaria usa `"0,00"` (coma), horas/tarifa usan `"-"`. El usuario recibe señales mixtas sobre el separador decimal esperado.
- **Recomendación**: Unificar placeholders de campos monetarios al separador que el `input type=number` admite (punto) y mantener coherencia entre formulario y modal de pago.

## Top 3 quick wins (alto impacto / bajo esfuerzo)
1. Conectar `resolver: zodResolver(InvoiceFormSchema)` en `InvoiceForm.tsx:157` y envolver los mensajes con `t(...)` (331/354/362) — restaura toda la validación cliente con dos líneas.
2. Migrar `useFinalizeInvoice` a `useApiMutation` y pintar `errorMessage` en la modal de finalizar — elimina el fallo silencioso de una acción fiscal crítica.
3. Reemplazar el `catch {}` vacío del PDF (page 144-149) por un mensaje de error traducido — evita el "éxito aparente" cuando la descarga falla.

## Top 2 mejoras estructurales
1. Unificar todas las modales del módulo sobre `ModalBackdrop` + `ConfirmDialog` (5 instancias hechas a mano en la página de detalle) para recuperar focus-trap, Escape, scroll-lock y semántica `role="dialog"` de forma consistente con el resto de la app.
2. Rediseñar `InvoiceList` para móvil con un layout de tarjeta etiqueta-valor (hoy las filas colapsan a valores apilados sin etiquetas), garantizando que importe y estado sean legibles y jerarquizados en `<sm`.
