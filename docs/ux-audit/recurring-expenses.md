# Auditoría UX/UI — Gastos recurrentes

> Skills aplicados: critique (jerarquía/IA/resonancia), audit (a11y/responsive/theming), clarify (microcopy/labels), harden (resiliencia/i18n/overflow), polish (alineación/espaciado), simplify (complejidad)
>
> Archivos revisados:
> - src/app/(auth)/recurring-expenses/page.tsx:30, :34-41, :45-49
> - src/components/recurring/RecurringExpenseList.tsx:36, :54-69, :73-77, :95-139, :141-216, :227-288
> - src/components/recurring/RecurringPendingPanel.tsx:30-228, :234-273, :275-378
> - src/components/recurring/RecurringExpenseForm.tsx:78-116, :137-204, :214-229, :270-336, :534-553
> - src/components/transactions/PendingTransactionsBanner.tsx:27-45, :79-101
> - src/hooks/useRecurringExpenses.ts:108-175
> - src/hooks/usePendingOccurrences.ts:65-119
> - src/schemas/recurring-expense.ts:21-74
> - src/messages/es.json / en.json (verificados con script de paridad: 79 claves `recurring.*` en ambos, 0 huérfanas)
> - docs/DESIGN.md:17-56

## Resumen ejecutivo

El módulo está sólido en i18n (paridad es/en perfecta en las 79 claves `recurring.*`), respeta el patrón céntimos→euros (incluido el `modifiedAmount` que el backend convierte en confirm/route.ts:23) y cubre los estados loading/empty/error con componentes reutilizables. Los problemas principales son de **feedback y resiliencia**: borrado permanente con `window.confirm()` nativo en lugar del `ConfirmDialog` del sistema, ausencia total de toasts de éxito tras confirmar/omitir ocurrencias y tras crear/editar reglas, y un patrón de "confirmar todos" con `Promise.all` que falla de forma silenciosa y parcial. Hay además desviaciones de DESIGN.md (página a `max-w-4xl` en vez de `max-w-7xl`, badges de frecuencia en azul/morado/teal fuera de la paleta de marca) y varios riesgos de overflow con textos largos. La señalización gasto-vs-ingreso depende casi solo del color rojo, rozando el principio de "indicador secundario más allá del color".

## Hallazgos

### 🔴 Crítico — Flujo — RecurringPendingPanel.tsx:244-246, hooks/usePendingOccurrences.ts:106-119
**Problema**: "Confirmar todos" (mes y global) ejecuta `Promise.all(occurrenceIds.map(...))` lanzando N peticiones `confirm` en paralelo. Si una falla, `Promise.all` rechaza pero las que ya resolvieron **sí crearon transacciones reales**. El usuario ve un estado de error genérico sin saber cuántas se crearon ni cuáles faltan; un reintento puede duplicar movimientos. En un módulo financiero esto produce dobles cargos.
**Recomendación**: usar un endpoint batch transaccional (como en otros módulos con BEGIN/COMMIT, p. ej. el linking atómico de Skydive) o, en su defecto, `Promise.allSettled` + feedback parcial ("Se confirmaron 4 de 6; reintenta las restantes"). Nunca dejar el estado a medias sin informar.

### 🔴 Crítico — Usabilidad — RecurringExpenseList.tsx:65-69
**Problema**: el borrado permanente usa `window.confirm(t('...confirm-delete'))`, un diálogo nativo del navegador. Rompe el lenguaje visual (no respeta dark mode ni tokens), no es estilable, bloquea el hilo y el proyecto ya tiene `ConfirmDialog` en `src/components/ui/`. Para una acción destructiva irreversible ("eliminará permanentemente este gasto recurrente y todas sus ocurrencias") la fricción/estética importa.
**Recomendación**: sustituir por `<ConfirmDialog>` con variante destructiva (botón `guard-danger`), respetando focus-trap y teclado como el resto de modales (ver `ModalBackdrop` usado en el form).

### 🟠 Alto — Flujo — RecurringPendingPanel.tsx:40-59, hooks/usePendingOccurrences.ts:76-119
**Problema**: confirmar, omitir y "confirmar todos" no muestran **ningún toast de éxito**. Tras pulsar "Confirmar", la fila simplemente desaparece (se invalida la query) sin confirmación explícita de que se creó una transacción real. El usuario no recibe cierre de la acción ("Gasto registrado") ni puede deshacer un "Omitir" accidental. Igual ocurre en el form: crear/editar cierra el modal sin toast (page.tsx:24-27, Form.tsx:225).
**Recomendación**: añadir toast de éxito en `onSuccess` ("Ocurrencia confirmada", "Regla guardada"), idealmente con acción "Deshacer" para Omitir. Reutilizar el sistema de toasts del proyecto y nuevas claves i18n en es/en.

### 🟠 Alto — Accesibilidad/Visual — RecurringExpenseList.tsx:74, RecurringPendingPanel.tsx:83, Form.tsx:540
**Problema**: el importe del gasto se distingue **solo por el color rojo** (`text-guard-danger`) sin indicador secundario (signo `-`, icono o etiqueta "Gasto"). DESIGN.md:19,45-46 exige explícitamente "income/expense con indicador secundario más allá del color" para daltonismo y AA. Como el módulo es 100% gastos, un usuario con deuteranopía no percibe la naturaleza "salida de dinero" del importe; queda como un número neutro.
**Recomendación**: prefijar signo negativo o etiqueta ("−419,28 €") y/o un icono Lucide de gasto, alineado con cómo se presentan gastos en el módulo de transacciones.

### 🟠 Alto — Visual — RecurringExpenseList.tsx:82-93
**Problema**: los badges de frecuencia usan azul/morado/teal (`bg-blue-100`, `bg-purple-100`, `bg-teal-100`) — colores **fuera de la paleta de marca** definida en DESIGN.md:23-31 (solo indigo/emerald/rose/slate). Rompe "Consistent restraint" (principio 5) e introduce ruido cromático en un módulo que debe ser "calmado". Además el badge es de `text-[10px]` con `text-blue-700` sobre `bg-blue-100`: conviene verificar contraste AA en cada par.
**Recomendación**: unificar los tres badges a un único estilo neutro de la paleta (p. ej. `bg-muted text-guard-muted` o variantes de `guard-primary/10`), diferenciando la frecuencia por el texto, no por color arbitrario.

### 🟠 Alto — Responsive/Usabilidad — RecurringPendingPanel.tsx:91-100, :161-170
**Problema**: el input de "modificar importe" es `type="number"` con `w-20` (80px). Con importes grandes (p. ej. 12.345,67) el valor se trunca visualmente. Además el `placeholder` usa `String(centsToEuros(...))` que renderiza `1234.56` con punto decimal y sin separador de miles — inconsistente con el `formatCurrency` ("1.234,56 €") usado en toda la UI, confundiendo sobre el formato esperado.
**Recomendación**: ampliar el ancho del input y mostrar el importe original formateado como referencia textual junto al campo (no como placeholder numérico crudo), aclarando que se introduce en euros.

### 🟠 Alto — Usabilidad — RecurringExpenseList.tsx:54-63, :112-126
**Problema**: el botón "Power" (activar/desactivar) y su tooltip cambian de significado según `isActive`, pero al **desactivar** se llama `deleteMutation` (soft-delete) y al **activar** `updateMutation`. Para el usuario, un icono de "encendido" que en realidad ejecuta un DELETE es ambiguo; además no hay confirmación ni feedback al desactivar (a diferencia del hard-delete). Desactivar una regla con ocurrencias pendientes puede sorprender (¿desaparecen del panel?).
**Recomendación**: clarificar el affordance (toggle/switch explícito en vez de icono Power), y añadir toast tras desactivar/activar ("Regla desactivada"). Documentar en microcopy qué pasa con las pendientes.

### 🟡 Medio — Visual — page.tsx:30
**Problema**: el contenedor de la página es `max-w-4xl` (≈896px), mientras DESIGN.md:39 fija `max-w-7xl` (1280px) como ancho de página estándar. En pantallas grandes la lista de reglas queda artificialmente estrecha e inconsistente con el resto de páginas del producto.
**Recomendación**: alinear a `max-w-7xl` (o documentar la excepción si es intencional para legibilidad de lista única).

### 🟡 Medio — Accesibilidad — RecurringPendingPanel.tsx:255-264, :357-370, RecurringExpenseList.tsx:174
**Problema**: (a) Los botones "Confirmar todos de {mes}" (:259) y "Confirmar todos" no tienen `aria-label` ni `aria-busy`; durante el proceso solo cambian el texto a "Procesando…". (b) Las acciones de cada regla en desktop usan `opacity-0 group-hover:opacity-100` (List.tsx:174): son **invisibles sin hover**, lo que en touch/teclado puede ocultar funcionalidad (hay `focus-within:opacity-100`, pero el descubrimiento visual es nulo hasta enfocar).
**Recomendación**: añadir `aria-busy` durante mutaciones; hacer las acciones siempre visibles (o al menos con opacidad parcial) en pantallas táctiles para no esconder edición/borrado.

### 🟡 Medio — Copy — RecurringPendingPanel.tsx:333, es.json `recurring.pending.count`
**Problema**: el título se compone como `t('recurring.pending.title') + ' ' + t('recurring.pending.count', {count})`, y `count` traduce a `"({count})"`. Resultado: "Gastos recurrentes pendientes (3)". Concatenar dos claves para formar una frase es frágil para i18n (orden de palabras, género/número) y `count` aislado no es traducible con sentido.
**Recomendación**: fusionar en una sola clave con interpolación: `recurring.pending.title` = `"Gastos recurrentes pendientes ({count})"`.

### 🟡 Medio — Copy — RecurringPendingPanel.tsx:263, es.json `confirm-all-month`
**Problema**: el label "Confirmar todos de {month}" → "Confirmar todos de Junio" es gramaticalmente forzado en español. Junto al header de mes que ya muestra "Junio 2026 (3)", el botón resulta redundante.
**Recomendación**: simplificar a "Confirmar el mes" o "Confirmar todo" (el contexto del header ya indica el mes), evitando la construcción "de {mes}".

### 🟡 Medio — Responsive/Overflow — RecurringExpenseList.tsx:149-177
**Problema**: en la fila desktop, categoría (`truncate`), badge de frecuencia, badge "Compartido", badge "Inactivo" e importe compiten por espacio en un único `flex`. Con nombre de categoría largo + 2 badges + importe de 6+ dígitos en viewport ~640px, los badges pueden empujar el importe o forzar el truncado agresivo del nombre. El importe es `flex-shrink-0` pero los badges no tienen prioridad clara.
**Recomendación**: revisar prioridades de truncado (proteger importe y badges, truncar solo nombre/descripción) y probar con datos extremos. Considerar `OverflowTooltip` (ya existe en ui/) para el nombre.

### 🟡 Medio — Usabilidad — RecurringExpenseForm.tsx:534-553
**Problema**: el botón de submit del formulario es `bg-guard-danger` (rojo). Aunque temáticamente "es un gasto", un **botón de acción primaria en rojo** señala peligro/destrucción según convención (y según DESIGN.md:26, indigo = acción). Un usuario puede dudar antes de "Crear" pensando que borra algo.
**Recomendación**: usar `btn-primary` (indigo) como el botón "Añadir" del header (page.tsx:38), reservando el rojo para destructivo. El carácter "gasto" ya se comunica por contexto y badges.

### 🟢 Bajo — Flujo — RecurringExpenseForm.tsx:214-229
**Problema**: el `catch` de `onSubmit` está vacío ("Error handled by mutation state") y el error se muestra como banner genérico (`recurring.form.errors.create/update`). No se distingue un conflicto de negocio (p. ej. categoría inválida) de un fallo de red, y el banner aparece al final del form largo (`max-h-[90vh] overflow-y-auto`), posiblemente fuera de viewport tras pulsar submit.
**Recomendación**: hacer scroll al banner de error al fallar, o mostrarlo cerca del botón submit (ya lo está, :525) garantizando visibilidad; aprovechar `errorMessage` ya traducido de `useApiMutation` para mensajes específicos.

### 🟢 Bajo — Accesibilidad — RecurringPendingPanel.tsx:62
**Problema**: cada `OccurrenceItem` y el header del panel usan `hover:bg-guard-warning/5`; el contenedor del panel también es `guard-warning/5`. El feedback de hover (5% sobre 5%) es casi imperceptible, debilitando la affordance de fila interactiva.
**Recomendación**: aumentar ligeramente el contraste del hover (p. ej. `/10`) o usar `bg-muted/50` como en la lista (List.tsx:145).

### 🟢 Bajo — Consistencia — PendingTransactionsBanner.tsx vs RecurringPendingPanel.tsx
**Problema**: existen **dos paneles de "pendientes" casi idénticos** en estructura (header colapsable warning, grid 0fr/1fr, "marcar todo") pero independientes: uno para transacciones pendientes y otro para ocurrencias recurrentes. Duplican markup, estilos y lógica de colapso (DRY). Mantenerlos sincronizados es propenso a derivar.
**Recomendación**: extraer un `CollapsibleWarningPanel` reutilizable en `components/ui/` con slots para contenido, reduciendo duplicación y garantizando consistencia visual.

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. **Reemplazar `window.confirm` por `ConfirmDialog`** en el hard-delete (List.tsx:65-69): componente ya existe, alinea estética dark y a11y.
2. **Unificar/recolorear los badges de frecuencia** a la paleta de marca (List.tsx:82-93): elimina azul/morado/teal fuera de DESIGN.md con un cambio de clases.
3. **Fusionar `pending.title` + `count` en una sola clave i18n** (Panel.tsx:333): arregla concatenación frágil y mejora la traducibilidad sin tocar lógica.

## Top 2 mejoras estructurales

1. **Confirmación batch transaccional con feedback parcial**: sustituir el `Promise.all` de "confirmar todos" (usePendingOccurrences.ts:106-119) por un endpoint batch atómico (o `allSettled` + reporte parcial), eliminando el riesgo de transacciones financieras creadas a medias y duplicados en reintento. Acompañar de un sistema de toasts de éxito/error coherente para todo el flujo de ocurrencias y del formulario.
2. **Extraer un `CollapsibleWarningPanel` compartido**: consolidar `PendingTransactionsBanner` y `RecurringPendingPanel` en un componente reutilizable, garantizando consistencia de jerarquía/colores y reduciendo duplicación de markup y lógica de colapso.
