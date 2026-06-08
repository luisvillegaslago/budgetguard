# Auditoría UX/UI — Categorías

> Skills aplicados: critique (jerarquía/IA/resonancia), audit (a11y/theming/responsive), clarify (microcopy/errores), harden (resiliencia/i18n/overflow), polish (alineación/espaciado)
> Archivos revisados: src/app/(auth)/categories/page.tsx:10-12; src/app/(auth)/categories/[id]/history/page.tsx:22-97; src/components/categories/CategoryManagementPanel.tsx:82-192; src/components/categories/CategoryTree.tsx:41-248; src/components/categories/CategoryFormModal.tsx:38-394; src/components/categories/ColorPicker.tsx:36-76; src/components/categories/IconPicker.tsx:20-58; src/components/categories/CategoryDeleteDialog.tsx:28-211; src/components/category-history/CategoryHistoryStats.tsx:16-47; src/components/category-history/CategoryHistoryMonths.tsx:23-170; src/components/category-history/DateRangeSelector.tsx:25-49; src/hooks/useCategories.ts:14-208; src/hooks/useCategoryHistory.ts:12-38; docs/DESIGN.md:19-56

## Resumen ejecutivo

El módulo de Categorías está bien construido: paridad i18n total, gestión de foco/Escape en modales, tokens de color y radios consistentes con DESIGN.md, y estados loading/empty/error cubiertos. El problema transversal más grave es la violación del principio "ingreso/gasto con indicador más allá del color": toda la vista de historial asume gasto (rojo Rose hardcodeado), por lo que una categoría de ingreso muestra cifras en rojo y sin signo, generando lectura financiera incorrecta. Le siguen problemas de accesibilidad en los pickers (color como única información, foco perdido al cambiar de conflicto en el diálogo de borrado), falta de feedback de éxito (no hay toast tras crear/editar/borrar) y un patrón de confirmación de borrado en línea (doble clic con reset por blur) frágil. El árbol solo permite una categoría expandida a la vez, lo que penaliza la comparación. Ningún hallazgo es bloqueante para el funcionamiento, pero los marcados como Alto degradan claridad y confianza, valores centrales de la marca.

## Hallazgos

### 🔴 Crítico

- **Severidad**: 🔴 Crítico
- **Categoría**: Accesibilidad / Visual
- **Ubicación**: src/components/category-history/CategoryHistoryStats.tsx:24; src/components/category-history/CategoryHistoryMonths.tsx:52-53, 113-115
- **Problema**: Toda la vista de historial pinta importes en `text-guard-danger` (Rose) de forma fija, sin considerar `category.type`. Para una categoría de **ingreso**, el total, el total mensual y cada fila aparecen en rojo "gasto", contradiciendo el principio de DESIGN.md (línea 19/46): "ingreso/gasto siempre con indicador secundario, nunca solo color" y "Emerald = income / Rose = expense". El usuario lee dinero entrante como si fuera saliente — error de interpretación financiera, no solo estético. Además, `formatCurrency` no antepone signo + para ingresos ni explicita el signo, así que el único diferenciador (color) ya está mal.
- **Recomendación**: Derivar el color del importe de `category.type` usando `TRANSACTION_TYPE.INCOME → text-guard-success` / `EXPENSE → text-guard-danger`, igual que ya hace el badge de tipo en CategoryTree.tsx:111-113. Añadir un indicador secundario no cromático (prefijo `+`/`−`, o etiqueta "Ingreso/Gasto") para cumplir WCAG y daltonismo. El `category.type` ya viene en `data.category`.

### 🟠 Alto

- **Severidad**: 🟠 Alto
- **Categoría**: Flujo / Feedback
- **Ubicación**: src/hooks/useCategories.ts:169-207; src/components/categories/CategoryFormModal.tsx:99; src/components/categories/CategoryDeleteDialog.tsx:38
- **Problema**: No hay confirmación de éxito en ninguna mutación. Tras crear, editar, desactivar o borrar una categoría, el modal se cierra sin toast ni mensaje; el único feedback es que la lista cambia (y los toggles activar/desactivar desde el árbol no muestran nada). Para una app financiera que prioriza "sensación de control", la ausencia de confirmación deja al usuario sin saber si la acción se aplicó, especialmente en toggles silenciosos (CategoryManagementPanel.tsx:61-66).
- **Recomendación**: Emitir un toast de éxito en los `onSuccess` de useCreate/useUpdate/useDeleteCategory (el proyecto ya usa patrón de notificación en otros módulos); como mínimo para crear/borrar/activar-desactivar, con claves i18n nuevas en es/en.

- **Severidad**: 🟠 Alto
- **Categoría**: Accesibilidad
- **Ubicación**: src/components/categories/ColorPicker.tsx:48-71
- **Problema**: El selector de color transmite la opción **solo por color**: `aria-label={color}` expone el hex crudo (p. ej. "#EF4444"), que ni es legible ni nombra el color para lectores de pantalla, y no hay nombre textual visible. Un usuario daltónico o con lector de pantalla no distingue "Rojo" de "Rosa". El estado seleccionado se duplica con un check (bien), pero los 16 swatches son indistinguibles sin visión cromática.
- **Recomendación**: Sustituir `aria-label={color}` por un nombre i18n por color (ya hay comentarios `// Red`, `// Emerald`… en ColorPicker.tsx:18-33 que sirven de base) y considerar un tooltip con el nombre. Verificar contraste del `ring` de selección sobre swatches claros.

- **Severidad**: 🟠 Alto
- **Categoría**: Usabilidad / Accesibilidad
- **Ubicación**: src/components/category-history/CategoryHistoryMonths.tsx:73-91, 28-35
- **Problema**: El borrado de transacción en el historial usa confirmación en línea por **doble clic** (primer clic arma, segundo confirma) con reset en `onBlur` (línea 81). Es un patrón frágil y poco descubrible: el usuario no ve un diálogo claro, y si el foco se pierde (scroll, tooltip) el estado se resetea silenciosamente. Riesgo de borrado accidental o de confusión. El proyecto ya tiene `ConfirmDialog` en components/ui para esto.
- **Recomendación**: Reemplazar por el `ConfirmDialog` reutilizable del sistema, coherente con CategoryDeleteDialog. Si se mantiene el inline, mostrar texto explícito de confirmación visible, no solo cambio de color (otra vez color-solo).

- **Severidad**: 🟠 Alto
- **Categoría**: Accesibilidad
- **Ubicación**: src/components/categories/CategoryDeleteDialog.tsx:129-207
- **Problema**: Cuando el borrado falla por conflicto (`has-transactions`), la UI cambia el contenido y los botones (aparece "Desactivar en su lugar", desaparece "Eliminar") pero el foco permanece en el botón "Eliminar" que ya no existe en ese rol, sin reanunciar el cambio. Aunque el bloque usa `role="alert"`, el botón de acción primaria recomendada no recibe foco, rompiendo el flujo de teclado en el momento más delicado. Además el trap de foco se calcula una sola vez por pulsación de Tab pero el orden de botones cambió.
- **Recomendación**: Al entrar en estado de conflicto, mover el foco al botón de acción recomendada ("Desactivar en su lugar") y asegurar que el mensaje de conflicto se anuncie (ya tiene role=alert; añadir `aria-live` si fuese necesario).

### 🟡 Medio

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad
- **Ubicación**: src/components/categories/CategoryTree.tsx:197-201
- **Problema**: El árbol mantiene un único `expandedId`: abrir una categoría **colapsa cualquier otra**. En una pantalla de gestión donde se comparan subcategorías de varias categorías, esto obliga a abrir/cerrar repetidamente y contradice "respectful efficiency / minimizar clics". También se pierde el estado de expansión al filtrar o buscar.
- **Recomendación**: Permitir múltiples expandidas con un `Set<number>` de IDs; opcionalmente recordar el estado durante la sesión. Auto-expandir resultados de búsqueda cuando el match está en subcategorías (filteredCategories ya recorta subs en CategoryManagementPanel.tsx:45-47, pero el padre sigue colapsado por defecto).

- **Severidad**: 🟡 Medio
- **Categoría**: Copy
- **Ubicación**: src/components/categories/CategoryDeleteDialog.tsx:138; src/messages/es.json (category-management.delete.has-transactions)
- **Problema**: El mensaje "Esta categoría tiene {count} transacciones…" no maneja singular: con `count=1` muestra "tiene 1 transacciones". Microcopy incorrecto en el momento de mayor fricción (intento de borrado bloqueado).
- **Recomendación**: Usar pluralización ICU/`{count, plural, ...}` o variantes de clave como ya se hace con `common.records` (interpolación con count). Aplicar también a `has-subcategories` (línea 145).

- **Severidad**: 🟡 Medio
- **Categoría**: Responsive
- **Ubicación**: src/components/categories/CategoryTree.tsx:121-122
- **Problema**: Las acciones de fila (editar/desactivar/borrar/añadir sub) usan `opacity-0 group-hover:opacity-100`, es decir solo aparecen al **hover**. En táctil/móvil no hay hover: las acciones son inalcanzables salvo por `focus-within`, que requiere tabular hasta ellas. La gestión de categorías queda prácticamente inoperable en tablet, que es justamente un dispositivo de uso declarado (DESIGN.md:6 "laptop/tablet").
- **Recomendación**: Mostrar las acciones siempre en pantallas táctiles/pequeñas (p. ej. visibles por defecto y solo ocultas a `sm:` con hover), o un menú "⋯" siempre visible. Coherente con la prioridad tablet del producto.

- **Severidad**: 🟡 Medio
- **Categoría**: Visual / Responsive
- **Ubicación**: src/components/category-history/CategoryHistoryStats.tsx:38
- **Problema**: Las tres tarjetas de stats usan `grid-cols-3` fijo sin breakpoint. En móviles estrechos, importes grandes (p. ej. "1.234.567,89 €") en `text-lg font-bold` dentro de una columna a un tercio de ancho se truncan o desbordan, perjudicando la legibilidad del dato principal.
- **Problema adicional**: La "Media Mensual" usa `text-guard-muted` (gris) — bajo contraste para un dato numérico relevante.
- **Recomendación**: `grid-cols-1 sm:grid-cols-3` o permitir wrap; usar `tabular-nums` y reducir tamaño con `truncate`/responsive. Subir el contraste de la media a `text-foreground`.

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad
- **Ubicación**: src/components/categories/CategoryFormModal.tsx:140-142, 153; src/components/categories/CategoryDeleteDialog.tsx:89-91, 101
- **Problema**: El clic en el backdrop está deliberadamente desactivado (handlers vacíos). Es defendible para evitar pérdida de datos, pero no se ofrece ninguna pista de ello y el `onKeyDown` del backdrop solo capta Escape (ya cubierto por el listener global), generando código muerto. La inconsistencia con el patrón habitual (cerrar al pulsar fuera) puede desconcertar.
- **Recomendación**: Documentar la decisión o, mejor, cerrar al hacer clic fuera en el diálogo de borrado (no destructivo si no se ha confirmado) y mantener el bloqueo solo en el formulario con cambios sin guardar. Eliminar el `onKeyDown` redundante del backdrop.

- **Severidad**: 🟡 Medio
- **Categoría**: Flujo
- **Ubicación**: src/components/categories/CategoryFormModal.tsx:289-359; CategoryFormModal.tsx:78-80
- **Problema**: Al editar una categoría de **ingreso**, los campos fiscales (IVA, deducción, casilla Modelo 100) se ocultan porque dependen de `watchedType === EXPENSE`; correcto. Pero al **crear** y togglear el tipo de Gasto→Ingreso, los valores fiscales ya introducidos permanecen en el form state (no se limpian) y se enviarían si el backend no los descarta. Riesgo de datos fiscales colgados en una categoría de ingreso.
- **Recomendación**: Al cambiar a INCOME, resetear `defaultVatPercent`/`defaultDeductionPercent`/`modelo100CasillaCode` a null. Confirmar que el backend ignora estos campos para ingresos.

### 🟢 Bajo

- **Severidad**: 🟢 Bajo
- **Categoría**: Copy
- **Ubicación**: src/hooks/useCategories.ts:23, 45, 73, 93, 113; src/hooks/useCategoryHistory.ts:16, 23
- **Problema**: Los fallbacks de error lanzan strings en español hardcodeados ("Error al cargar categorias", "Error desconocido", sin tilde en "categorias"), violando la regla i18n y de no-literales del proyecto. Aunque suelen quedar ocultos por `useApiMutation`/estados de error de la UI, romperían la consistencia si aflorasen y no pasan por traducción.
- **Recomendación**: Usar claves `API_ERROR`/i18n existentes para estos fallbacks, como ya hace `extractApiErrorKey` en las mutaciones (useCategories.ts:66, 87).

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual
- **Ubicación**: src/components/categories/CategoryFormModal.tsx:252-270
- **Problema**: El campo "Orden" (sortOrder) se expone como input numérico crudo sin ayuda contextual sobre qué hace. Para un usuario no técnico, "Orden = 0" es opaco. Dato de baja frecuencia que añade carga cognitiva en el formulario.
- **Recomendación**: Añadir microcopy de ayuda (helper text) explicando que controla el orden de aparición, o moverlo a una sección "avanzado" colapsable.

- **Severidad**: 🟢 Bajo
- **Categoría**: Accesibilidad
- **Ubicación**: src/components/categories/CategoryFormModal.tsx:218-219, 247-250
- **Problema**: El `type` se gestiona vía `setValue` + input hidden y los pickers de icono/color vía `setValue` sin `register`, por lo que los toggles/pickers no son parte natural del flujo de validación de RHF (no hay feedback si se requiere icono/color). Funciona, pero el icono/color seleccionados no muestran error si el schema los exigiera.
- **Recomendación**: Si icono/color son opcionales, está bien; si fueran requeridos, conectar a RHF para feedback de validación coherente con el campo nombre (líneas 239-243).

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual
- **Ubicación**: src/components/categories/CategoryTree.tsx:100-104
- **Problema**: El badge de casilla Modelo 100 usa `bg-guard-warning/10 text-guard-warning`. `guard-warning` no está en la paleta de DESIGN.md (líneas 23-31 solo definen dark/primary/success/danger/muted/light). Uso de un token fuera del sistema documentado → posible inconsistencia de tema.
- **Recomendación**: Verificar que `guard-warning` exista en tokens y, si es válido, añadirlo a DESIGN.md; si no, usar un color del sistema (p. ej. muted/primary) para el badge fiscal.

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual
- **Ubicación**: src/components/categories/CategoryTree.tsx:47-48
- **Problema**: La animación `animate-fade-in` con `animationDelay: index * 40ms` se aplica a cada fila en cada render del árbol (también tras filtrar/buscar), produciendo un "barrido" repetido al teclear en la búsqueda. Contradice "calm over alarm" y no respeta explícitamente `prefers-reduced-motion` aquí.
- **Recomendación**: Limitar la animación al montaje inicial (no en re-render por búsqueda) y respetar `prefers-reduced-motion` (DESIGN.md:47).

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. **Color del importe según tipo en el historial**: cambiar `text-guard-danger` fijo por `type === INCOME ? success : danger` y añadir signo +/− (CategoryHistoryStats.tsx:24, CategoryHistoryMonths.tsx:52-53,113-115). Corrige el hallazgo crítico con pocas líneas.
2. **Pluralización del mensaje de conflicto de borrado** (CategoryDeleteDialog.tsx:138/145): usar `{count, plural}` para evitar "1 transacciones".
3. **Acciones de fila visibles en táctil** (CategoryTree.tsx:121-122): hacer visibles por defecto y ocultar solo en `sm:` hover, desbloqueando la gestión en tablet.

## Top 2 mejoras estructurales

1. **Sistema de feedback de éxito unificado**: integrar toasts en los `onSuccess` de las mutaciones de categorías (useCategories.ts:169-207) y en los toggles del árbol, con claves i18n es/en. Resuelve la ausencia transversal de confirmación y alinea el módulo con el principio de "sensación de control".
2. **Componente de confirmación destructiva único**: consolidar el borrado de transacción inline del historial (CategoryHistoryMonths.tsx:73-91) y el diálogo de categoría sobre el `ConfirmDialog` reutilizable, gestionando foco al estado de conflicto y eliminando el patrón doble-clic/onBlur frágil. Mejora consistencia, accesibilidad de teclado y seguridad ante borrados accidentales.
