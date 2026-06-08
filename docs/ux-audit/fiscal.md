# Auditoría UX/UI — Fiscal

> Skills aplicados: critique (jerarquía/IA/resonancia), audit (a11y/theming/responsive), clarify (microcopy/errores/labels), harden (resiliencia/i18n/overflow), onboard (empty states)
> Archivos revisados:
> - src/app/(auth)/fiscal/page.tsx:40-273
> - src/app/(auth)/documents/page.tsx:202-235
> - src/components/fiscal/FiscalQuarterSelector.tsx:23-72
> - src/components/fiscal/FiscalFilingStatus.tsx:19-58
> - src/components/fiscal/FiscalDeadlineBanner.tsx:23-136
> - src/components/fiscal/FiscalDeadlinePanel.tsx:53-143
> - src/components/fiscal/Modelo303Card.tsx:48-119
> - src/components/fiscal/Modelo130Card.tsx:68-117
> - src/components/fiscal/Modelo390Card.tsx:47-117
> - src/components/fiscal/Modelo100Card.tsx:71-129
> - src/components/fiscal/FiscalInvoiceTable.tsx:18-129
> - src/components/fiscal/FiscalExpenseTable.tsx:18-161
> - src/components/fiscal/ModeloDocumentUpload.tsx:32-248
> - src/components/fiscal/FiscalDocumentUpload.tsx:26-306
> - src/components/fiscal/FiscalDocumentList.tsx:59-561
> - src/components/fiscal/FiscalBulkUpload.tsx:28-253
> - src/components/fiscal/FiscalExtractionConfirm.tsx:39-402
> - src/hooks/useFiscalReport.ts, useFiscalDocuments.ts, useFiscalDeadlines.ts, useFiscalDefaults.ts
> - src/utils/money.ts:35-48 · tailwind.config.js:27-67 · src/messages/{es,en}.json (fiscal.*)

## Resumen ejecutivo

El módulo Fiscal está sólido en lo fundamental: paridad i18n perfecta (188 claves fiscal.* en es/en, sin huérfanas), tokens correctos (`guard-primary/success/danger/warning/accent` definidos), estados loading/error/empty presentes en página y tablas, y un patrón de "casillas" muy fiel al PDF de la AEAT. Los problemas se concentran en: (1) **manejo inconsistente del cero** en los resultados de Modelo 303 vs 390, que puede mostrar un color/etiqueta engañoso en cifras fiscales sensibles; (2) **microcopy de error incorrecto** en la subida de modelos (reutiliza "Error al cargar el informe fiscal" para un fallo de subida); (3) **feedback débil** sin toasts de éxito en subida/cambio de estado y estados de error minúsculos en detalles vinculados; y (4) varias **fugas de accesibilidad/i18n** (aria-labels en inglés, toggles de estado sin describir su acción). Nada bloqueante, pero en una app fiscal la claridad de la cifra y del error es crítica.

## Hallazgos

### 🟠 Alto · Usabilidad · Modelo303Card.tsx:51 / Modelo390Card.tsx:50
**Problema**: Tratamiento inconsistente del valor cero entre los dos modelos de resultado. En 303, `isPositiveResult = data.resultCents > 0`: un resultado de 0 cae en la rama "A compensar" (verde/emerald). En 390, `isNegativeResult = data.casilla65Cents < 0`: un resultado de 0 cae en la rama "A ingresar" (rojo/danger). El mismo importe neutro (0,00 €) se pinta verde en un modelo y rojo en otro, lo que en cifras fiscales transmite un mensaje contradictorio ("calma sobre alarma" — DESIGN.md principio 2).
**Recomendación**: Unificar la lógica con un tercer estado neutro para `=== 0` (color `text-foreground`/`guard-muted`, sin etiqueta a ingresar/compensar), y compartir un helper único de clasificación de resultado entre ambas tarjetas (DRY). Mantener emerald solo para resultado a favor del contribuyente y rose solo para a pagar.

### 🟠 Alto · Copy · ModeloDocumentUpload.tsx:228
**Problema**: Cuando falla la subida de un modelo, el alert muestra `t('fiscal.errors.load')` = "Error al cargar el informe fiscal". El usuario está subiendo un documento, no cargando un informe: el mensaje desorienta y no sugiere acción (reintentar, revisar formato/tamaño).
**Recomendación**: Usar una clave dedicada (p. ej. `fiscal.documents.errors.upload-failed`) en es/en, y a poder ser exponer `uploadMutation.errorMessage` del wrapper `useApiMutation` (ya traducido) en lugar de un literal genérico, como hace `FiscalExtractionConfirm.tsx:373` con `linkMutation.error.message`.

### 🟠 Alto · Flujo · ModeloDocumentUpload.tsx:36-81,198-206
**Problema**: El formulario de subida de modelos usa `useState` plano sin RHF+Zod. El campo "Importe del impuesto" es `<input type="number">` cuyo valor se convierte con `eurosToCents(Number(taxAmount))` sin validación: acepta negativos, y un texto no numérico produce `NaN` → `eurosToCents(NaN)`. Además el `<Select>` de estado parte en `FISCAL_STATUS.FILED` por defecto, lo que puede marcar como "Presentado" un modelo que el usuario solo está archivando.
**Recomendación**: Validar importe (`>= 0`, numérico) antes de enviar y deshabilitar submit si es inválido, con feedback inline siguiendo el patrón de error de `FiscalExtractionConfirm`. Reconsiderar el default de estado a `PENDING` (más seguro) o no preseleccionar. Idealmente migrar a RHF+Zod como el resto de formularios del proyecto.

### 🟡 Medio · Visual/Flujo · fiscal/page.tsx:150-168 + FiscalFilingStatus.tsx:32-57
**Problema**: Lógica de descarga/subida duplicada y desconectada. La página renderiza su propia fila estado+enlace (descargar/subir) en cada modelo (líneas 149-168, 173-192, 209-228, 233-252), pero a `FiscalFilingStatus` solo le pasa `status` — nunca `document`. Por tanto el icono de descarga interno del badge (`FiscalFilingStatus.tsx:46-55`) es código muerto en esta página, y existen dos affordances de descarga distintas (el enlace de texto verde de la página y el `FileDown` del badge) con estilos diferentes.
**Recomendación**: Pasar `document` a `FiscalFilingStatus` y dejar que el badge gestione la descarga (DRY), eliminando el enlace duplicado de la página; o documentar que el badge no debe descargar y quitar su rama de descarga. Unificar a un solo patrón visual de "descargar documento presentado".

### 🟡 Medio · Accesibilidad · FiscalDocumentList.tsx:261-271,381-391
**Problema**: El badge de estado (Presentado/Pendiente) es un `<button>` que alterna el estado al hacer clic, pero su contenido accesible es solo la etiqueta del estado actual ("Presentado"). Un usuario de lector de pantalla no percibe que es un control interactivo que cambia el estado; tampoco hay `aria-pressed` ni descripción de la acción ("cambiar a pendiente").
**Recomendación**: Añadir `aria-label` que describa la acción (p. ej. `t('fiscal.documents.toggle-status')`) o `title`, y considerar `aria-pressed` para reflejar el estado. Mismo patrón aplicado al toggle de la versión móvil.

### 🟡 Medio · Accesibilidad/Copy · fiscal/page.tsx:101,124 · FiscalQuarterSelector.tsx:50
**Problema**: `aria-label` codificados en inglés en una UI en español: `aria-label="Fiscal view"` (page.tsx:101), `aria-label="Fiscal quarter"` (FiscalQuarterSelector.tsx:50). Violan la regla de i18n obligatoria y dan etiquetas en idioma incorrecto a usuarios de lector de pantalla en español.
**Recomendación**: Sustituir por claves traducidas en es/en (p. ej. `fiscal.a11y.view-toggle`, `fiscal.a11y.quarter-selector`) vía `t()`.

### 🟡 Medio · Flujo/Resiliencia · FiscalDocumentList.tsx:74-80,128-134
**Problema**: Los detalles de transacción vinculada (`LinkedTransactionDetail`, `LinkedGroupDetail`) hacen fetch propio con `useEffect`+estado local. En error muestran únicamente `t('common.error')` = "Error" como texto diminuto, sin icono, sin reintentar. En `LinkedGroupDetail` un grupo vacío también renderiza "Error" (confunde "sin datos" con "fallo"). El loading es texto `animate-pulse`, no un skeleton coherente con el resto.
**Recomendación**: Usar un mini `ErrorState`/`EmptyState` (componentes ya existentes en `src/components/ui/`) con copy específico y, si procede, un botón de reintento. Diferenciar lista vacía de error real.

### 🟡 Medio · Onboarding/Usabilidad · fiscal/page.tsx:145-201
**Problema**: Cuando el informe carga pero el trimestre no tiene actividad, las tarjetas 303/130 se muestran con todas las casillas en 0,00 € y sin contexto. No hay un estado de "sin actividad este trimestre" que explique al usuario que es normal (primer trimestre, autónomo recién dado de alta). Las tablas sí tienen empty state (`FiscalInvoiceTable.tsx:21`, `FiscalExpenseTable.tsx:21`), pero las tarjetas no, generando una pantalla de ceros poco acogedora.
**Recomendación**: Añadir un aviso sutil sobre las tarjetas cuando todas las casillas relevantes son 0 (p. ej. "Sin operaciones registradas en T{q}"), reutilizando el tono de los empty states existentes. Refuerza "claridad en 2s".

### 🟡 Medio · Visual/Consistencia · FiscalInvoiceTable.tsx:71-73 · FiscalExpenseTable.tsx:80-89
**Problema**: Las cifras de las tablas fiscales se muestran sin indicador secundario de ingreso/gasto: la factura emitida (ingreso) usa color neutro y la base imponible no lleva `+`; el gasto deducible tampoco lleva `−`. DESIGN.md exige que ingreso/gasto tengan indicador más allá del color. Aunque aquí el contexto (tabla de facturas vs tabla de gastos) aporta significado, no hay señal redundante a nivel de cifra, a diferencia de `FiscalDocumentList.tsx:144-147` que sí usa `+`/`−`.
**Recomendación**: Decisión consciente: si se considera que el encabezado de cada tabla ya desambigua, documentarlo; si no, alinear con el patrón `+`/`−` y color de `LinkedTransactionDetail` para coherencia interna del módulo.

### 🟢 Bajo · Estándares · ModeloDocumentUpload.tsx:42,65
**Problema**: Literales string en lugar de constantes: `modeloType === '390' || modeloType === '100'` (línea 42) y `documentType: 'modelo'` (línea 65), pese a que el archivo ya importa `MODELO_TYPE` y existe `FISCAL_DOCUMENT_TYPE`. Viola la regla del proyecto "nunca literales string para tipos" y rompe el single source of truth.
**Recomendación**: Usar `MODELO_TYPE.M390`/`MODELO_TYPE.M100` y `FISCAL_DOCUMENT_TYPE.MODELO`.

### 🟢 Bajo · Visual/Theming · FiscalDeadlineBanner.tsx:91,104 · FiscalDeadlinePanel.tsx:34,91
**Problema**: El módulo usa `guard-warning` (amber #F59E0B) para estado "en plazo/due". El token existe en `tailwind.config.js:28` pero DESIGN.md no lo incluye en su "color language" (solo indigo/emerald/rose/muted). Es un cuarto color semántico no documentado; en sí razonable para deadlines, pero su uso para fondos `bg-guard-warning/5` en el banner roza el principio "calma sobre alarma".
**Recomendación**: Documentar `guard-warning` como token oficial de "alerta/plazo" en DESIGN.md para cerrar la brecha entre código y guía, y revisar que su saturación de fondo se mantenga discreta.

### 🟢 Bajo · i18n/Copy · FiscalDeadlineBanner.tsx:17-21 · FiscalDocumentList.tsx:213 · ModeloDocumentUpload.tsx:134
**Problema**: Cadenas compuestas hardcodeadas con prefijo "Modelo"/"Q" construidas en código (`getModeloLabel`, `Modelo ${modeloType} Q${quarter}`, el badge prefilled `Modelo {modeloType} {quarter} {year}`). Aunque "Modelo" y "Q" son tecnicismos AEAT estables, el patrón evita `t()` y dificulta ajustar el formato por locale (en inglés "Q" puede preferirse distinto, o el orden año/trimestre).
**Recomendación**: Bajo impacto; si se busca consistencia total, mover el formato a una clave con interpolación (`fiscal.modelo-period`, `{modelo} Q{quarter} {year}`).

### 🟢 Bajo · Responsive/Overflow · Modelo303Card.tsx:60 · Modelo390Card.tsx:56 · Modelo100Card.tsx:81
**Problema**: Las tarjetas usan `md:grid-cols-2` (303) y `xl:grid-cols-2` (390/100) para Devengado/Deducible. Las etiquetas de casilla ya están protegidas con `truncate`+`Tooltip` y la cifra con `shrink-0`. El riesgo de overflow es bajo, pero con importes muy grandes (p. ej. 1.234.567,89 €) y la etiqueta truncada al mínimo, en el breakpoint justo antes de colapsar a 1 columna el espacio para el label puede quedar a 1-2 caracteres visibles, perdiendo legibilidad del concepto.
**Recomendación**: Verificar en ~768px/1024px con cifras de 7 dígitos. Si se observa, permitir wrap del label en 2 líneas en lugar de truncar al extremo, o reducir el `gap` para dar aire a la etiqueta.

### 🟢 Bajo · Resiliencia · FiscalBulkUpload.tsx:76-80,214
**Problema**: En la subida masiva, si un lote falla por completo, se marca cada archivo con `error: 'Batch failed'` (literal en inglés, no i18n) y se muestra crudo en la lista de errores (línea 214). El usuario ve un mensaje técnico no traducido.
**Recomendación**: Sustituir el literal por una clave i18n (`fiscal.documents.bulk-batch-failed`) y, si el backend devuelve códigos de error, traducirlos con el mismo patrón de `errorMessages` que usa `FiscalDocumentUpload.tsx:89-93`.

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. **Corregir el copy de error de subida de modelo** (ModeloDocumentUpload.tsx:228): cambiar `fiscal.errors.load` por una clave de error de subida o exponer `uploadMutation.errorMessage`. Una línea, elimina un mensaje engañoso en un flujo fiscal.
2. **Traducir los `aria-label` en inglés** ("Fiscal view", "Fiscal quarter") a claves i18n es/en. Corrige a11y e i18n con cambio mínimo.
3. **Sustituir literales `'390'/'100'/'modelo'`** por constantes `MODELO_TYPE`/`FISCAL_DOCUMENT_TYPE` (ModeloDocumentUpload.tsx:42,65). Alinea con el estándar del proyecto.

## Top 2 mejoras estructurales

1. **Unificar la clasificación de resultado fiscal (303/390) en un helper compartido** con tratamiento explícito del cero (neutro) y mapeo único color↔etiqueta a-ingresar/a-compensar. Elimina la inconsistencia verde/rojo del valor 0 y centraliza una regla crítica (DRY), reutilizable por futuras tarjetas de modelo.
2. **Consolidar el patrón de "documento presentado + descarga"** pasando `document` a `FiscalFilingStatus` y eliminando la lógica duplicada de descarga/subida repetida cuatro veces en `fiscal/page.tsx`. Reduce ~80 líneas de JSX repetido, da un único affordance visual de descarga y simplifica el mantenimiento al añadir nuevos modelos.
