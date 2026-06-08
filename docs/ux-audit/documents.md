# Auditoría UX/UI — Documentos

> Skills aplicados: critique (jerarquía/IA/resonancia), audit (a11y/responsive/theming), harden (resiliencia/errores/i18n/overflow), clarify (microcopy/errores), onboard (empty state)
> Archivos revisados:
> - src/app/(auth)/documents/page.tsx:1-235
> - src/components/fiscal/FiscalDocumentList.tsx:1-561
> - src/components/fiscal/FiscalDocumentUpload.tsx:1-306
> - src/components/fiscal/FiscalExtractionConfirm.tsx:1-402
> - src/components/fiscal/FiscalBulkUpload.tsx:1-253
> - src/hooks/useFiscalDocuments.ts:1-247
> - src/components/ui/SummaryCard.tsx:1-124
> - src/components/ui/ConfirmDialog.tsx:1-113
> - src/components/ui/EmptyState.tsx:1-22
> - src/messages/es.json / src/messages/en.json (paridad de claves verificada con script)

## Resumen ejecutivo

El módulo "Documentos" está sólidamente construido: filtros persistidos en URL, paridad i18n completa (todas las claves `t('...')` existen en es.json y en.json), tarjetas resumen con indicador secundario más allá del color y un flujo OCR cuidado con pasos visibles. Sin embargo, hay un agujero importante de resiliencia: el estado de error de la carga de documentos no se maneja (un fallo de red muestra "lista vacía" indistinguible del estado real vacío). Además, varias confirmaciones y feedbacks son silenciosos (sin toasts), el modal de borrado reimplementa `ConfirmDialog` sin focus-trap consistente ni bloqueo durante la mutación, y los detalles de transacción enlazada hacen fetch propio que ante error muestra textos engañosos. La mayoría son arreglos de bajo esfuerzo apoyándose en componentes ya existentes del proyecto.

## Hallazgos

- **Severidad**: 🔴 Crítico
- **Categoría**: Flujo / Usabilidad
- **Ubicación**: src/app/(auth)/documents/page.tsx:120, 202-226
- **Problema**: `useFiscalDocuments` expone `isError`/`error` (useFiscalDocuments.ts:34-40) pero la página solo desestructura `data` e `isLoading`. Si la petición falla (red, 500, sesión caducada), `allDocuments` es `undefined`, `quarterFiltered` cae a `[]` y se renderiza el empty state "No hay documentos" (FiscalDocumentList.tsx:443-450). El usuario cree que no tiene documentos cuando en realidad hubo un error, sin posibilidad de reintentar. Viola el principio "calma con claridad" y rompe la confianza en datos fiscales.
- **Recomendación**: Consumir `isError` del hook y renderizar el componente reutilizable `ErrorState` (src/components/ui/ErrorState.tsx) con acción de reintento (`refetch`), tal como hace el resto de la app. Distinguir siempre "vacío" de "error".

- **Severidad**: 🟠 Alto
- **Categoría**: Usabilidad / Accesibilidad
- **Ubicación**: src/components/fiscal/FiscalDocumentList.tsx:504-558
- **Problema**: El diálogo de borrado está reimplementado a mano dentro de `FiscalDocumentList` en lugar de usar el `ConfirmDialog` ya existente (ConfirmDialog.tsx). Consecuencias: (1) los botones de acción NO se deshabilitan durante `deleteMutation.isPending` y el modal se cierra optimistamente con `setDeleteTarget(null)` (líneas 523-524, 534-535) — si la mutación falla no hay feedback alguno; (2) no hay spinner ni estado de carga; (3) duplica markup y diverge del patrón canónico. Un doble clic puede disparar dos borrados.
- **Recomendación**: Migrar al `ConfirmDialog` (`isLoading`, `variant="danger"`, focus-trap heredado de `ModalBackdrop`). Para el caso "borrar también la transacción enlazada", evaluar un `ConfirmDialog` con acción secundaria o mantener el modal custom pero añadiendo `disabled={deleteMutation.isPending}` y manejo de error.

- **Severidad**: 🟠 Alto
- **Categoría**: Flujo / Resiliencia
- **Ubicación**: src/components/fiscal/FiscalDocumentList.tsx:59-109, 111-134, 78-79
- **Problema**: `LinkedGroupDetail` y `LinkedTransactionDetail` hacen su propio `fetchApi` con `useEffect` + estado local en lugar de TanStack Query, perdiendo caché/dedupe. Peor: en `LinkedGroupDetail`, si la lista llega vacía (líneas 78-79) se muestra `t('common.error')` ("Error") aunque pudo no haber error; y un fallo de fetch real (`.catch(() => {})`, línea 70) se traga el error y también acaba mostrando "Error" sin contexto ni reintento. El usuario ve "Error" sin saber por qué ni cómo recuperarse.
- **Recomendación**: Extraer un hook `useTransaction(id)` / `useTransactionGroup(id)` con `useQuery` (consistente con el resto del módulo) y renderizar estados loading/error/empty diferenciados; no reutilizar `common.error` como contenido de "lista vacía".

- **Severidad**: 🟠 Alto
- **Categoría**: Flujo / Feedback
- **Ubicación**: src/components/fiscal/FiscalDocumentUpload.tsx:99, 113-114; src/components/fiscal/FiscalExtractionConfirm.tsx:145
- **Problema**: Tras una subida exitosa sin OCR (línea 99), tras crear la transacción enlazada (`onSuccess()` línea 145) y tras el bulk upload, el flujo cierra el modal sin ninguna confirmación (toast/snackbar). En una app financiera, crear una transacción a partir de OCR sin feedback explícito de éxito genera incertidumbre ("¿se guardó?") y obliga a verificar manualmente en otra pantalla. El proyecto invalida queries pero no comunica el resultado.
- **Recomendación**: Añadir un toast de éxito ("Transacción creada y vinculada", "N documentos subidos") reutilizando el sistema de notificaciones del proyecto, con copy en es/en. Mantener el cierre del modal solo tras confirmar éxito.

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad / Flujo
- **Ubicación**: src/components/fiscal/FiscalExtractionConfirm.tsx:49, 127
- **Problema**: El campo importe se inicializa con `centsToEuros(extractedData.totalAmountCents).toString()` y al enviar se hace `eurosToCents(Number.parseFloat(amount))`. No hay validación Zod ni RHF (a diferencia del estándar del proyecto RHF+Zod): si el usuario borra el importe o escribe texto, `Number.parseFloat('')` → `NaN` → `eurosToCents(NaN)`. Solo el `required` del input HTML protege parcialmente, pero no cubre valores como `0` o entradas negativas, y no hay mensaje de error inline para el importe.
- **Recomendación**: Validar importe > 0 con feedback inline (patrón VALIDATION_KEY/Zod usado en el resto de formularios) antes de `mutateAsync`. Como mínimo, bloquear `NaN`/`<= 0` y mostrar error junto al campo.

- **Severidad**: 🟡 Medio
- **Categoría**: Visual / Accesibilidad
- **Ubicación**: src/components/fiscal/FiscalDocumentList.tsx:27-30, 270, 390
- **Problema**: El badge de estado "pending" usa `bg-muted text-guard-muted` (gris sobre gris). `guard-muted` (#64748B / Slate) sobre fondo `muted` corre riesgo de no alcanzar el 4.5:1 AA para texto pequeño (`text-xs`). Además, el toggle de estado es un botón sin `aria-pressed` ni indicación textual de que es interactivo más allá de `cursor-pointer`; un usuario no descubre fácilmente que el badge cambia el estado de presentación fiscal al hacer clic.
- **Recomendación**: Verificar contraste del par muted/muted y, si no llega a AA, subir el texto a `text-foreground` o un slate más oscuro. Añadir `aria-pressed`/`title` al toggle de estado y, idealmente, un icono (check/clock) como indicador secundario al color.

- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad
- **Ubicación**: src/components/fiscal/FiscalDocumentUpload.tsx:183-225; src/components/fiscal/FiscalBulkUpload.tsx:112-141
- **Problema**: Las drop zones son `<div>` con handlers de drag y un `<input file>` oculto accesible solo vía `<label>`. No exponen rol/teclado para la zona en sí (solo el enlace "Examinar" es navegable). Para usuarios de teclado/lector de pantalla la affordance de "arrastrar" no tiene equivalente, y el `biome-ignore noStaticElementInteractions` lo confirma. No hay validación de tipo/tamaño de archivo en cliente (acepta `.pdf,.png,.jpg,.jpeg` pero no informa si se suelta otro tipo).
- **Recomendación**: El patrón con `<label>`+input oculto es aceptable para teclado; añadir validación de tipo/tamaño en cliente con mensaje claro (harden) y un texto de ayuda con formatos/limite aceptados. Asegurar foco visible en el enlace "Examinar".

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad / Flujo
- **Ubicación**: src/components/fiscal/FiscalBulkUpload.tsx:65-87, 175-189
- **Problema**: La barra de progreso usa `uploadProgress.current = start` (índice de inicio del lote), por lo que el porcentaje "salta" en bloques de 10 y nunca muestra 100% durante la subida (el último lote queda en `(total-resto)/total`). No hay forma de cancelar una subida masiva en curso ni de reintentar solo los fallidos desde la pantalla de resultados (los errores se listan como texto plano, líneas 209-218).
- **Recomendación**: Reflejar progreso real (`start + batch.length`) y permitir reintento de los archivos fallidos. Mostrar los errores con el patrón visual de `ErrorState`/lista consistente en lugar de párrafos sueltos.

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual / Consistencia
- **Ubicación**: src/app/(auth)/documents/page.tsx:443-450 (vía FiscalDocumentList) y FiscalDocumentList.tsx:443-450
- **Problema**: El empty state de la lista es un bloque custom (`card text-center py-8` con icono `h-8`) en lugar del componente reutilizable `EmptyState` (EmptyState.tsx, icono `h-12`, soporta `subtitle` y `action`). No ofrece CTA para subir el primer documento, desaprovechando un momento de onboarding.
- **Recomendación**: Usar `EmptyState` con `action` (botón "Subir documento") para guiar al usuario en su primera visita, manteniendo consistencia visual con el resto de empties del proyecto.

- **Severidad**: 🟢 Bajo
- **Categoría**: Copy / i18n
- **Ubicación**: src/components/fiscal/FiscalBulkUpload.tsx:157, 159; FiscalDocumentList.tsx:98
- **Problema**: Hay literales string de tipo/UI fuera de i18n y constantes: `item.metadata.documentType === 'modelo'` (literal en vez de `FISCAL_DOCUMENT_TYPE.MODELO`), prefijos `M`/`Q`/`÷2` hardcodeados, y en `FiscalBulkUpload` el error de batch fallido se setea como `'Batch failed'` en inglés (línea 79) que luego se muestra al usuario (línea 215). La regla del proyecto prohíbe literales de tipo y exige i18n para texto visible.
- **Recomendación**: Sustituir `'modelo'` por la constante `FISCAL_DOCUMENT_TYPE.MODELO` y traducir el mensaje "Batch failed" con una clave en es/en. Revisar abreviaturas `M`/`Q` para asegurar que son etiquetas universales aceptables.

- **Severidad**: 🟢 Bajo
- **Categoría**: Responsive
- **Ubicación**: src/components/fiscal/FiscalDocumentList.tsx:233
- **Problema**: La descripción en la tarjeta móvil usa `ml-5.5`, una clase de Tailwind no estándar (la escala no incluye `5.5` por defecto). Si no está definida en la config, la indentación de alineación con el icono se pierde en móvil.
- **Recomendación**: Verificar que `5.5` esté en la escala de spacing del `tailwind.config`; si no, usar un valor estándar (`ml-6`) o arbitrario (`ml-[1.375rem]`).

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. Manejar `isError` de `useFiscalDocuments` en la página con `ErrorState` + reintento (page.tsx:120) — elimina el "vacío engañoso" en fallos de red.
2. Añadir toast de éxito tras crear/vincular transacción y tras subidas (FiscalExtractionConfirm.tsx:145, FiscalDocumentUpload.tsx:99) — cierra el bucle de feedback en una app de dinero.
3. Deshabilitar los botones del modal de borrado durante `deleteMutation.isPending` y no cerrar hasta confirmar éxito (FiscalDocumentList.tsx:519-547) — evita doble borrado y fallos silenciosos.

## Top 2 mejoras estructurales

1. Unificar el flujo de transacción enlazada y borrado sobre los componentes/hooks canónicos: `ConfirmDialog` para el borrado y un `useTransaction(id)`/`useTransactionGroup(id)` con TanStack Query para los detalles inline, eliminando los `fetchApi`+`useEffect` ad hoc y sus estados de error engañosos (FiscalDocumentList.tsx:59-194, 504-558).
2. Migrar el formulario de confirmación OCR a RHF+Zod (el estándar del proyecto) para validación robusta de importe/fecha/porcentajes con errores inline, en lugar de estado local manual y validaciones parciales vía atributos HTML (FiscalExtractionConfirm.tsx:48-146).
