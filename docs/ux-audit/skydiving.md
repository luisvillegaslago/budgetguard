# Auditoría UX/UI — Skydiving

> Skills aplicados: critique (jerarquía/IA/resonancia), audit (a11y/theming/responsive), harden (resiliencia/errores/i18n/overflow), clarify (microcopy/labels), onboard (empty states)
> Archivos revisados:
> - src/app/(auth)/skydiving/page.tsx:24-152
> - src/components/skydiving/SkydiveStatsCards.tsx:16-129
> - src/components/skydiving/JumpLogTable.tsx:26-287
> - src/components/skydiving/TunnelSessionTable.tsx:27-245
> - src/components/skydiving/JumpForm.tsx:31-318
> - src/components/skydiving/TunnelSessionForm.tsx:30-254
> - src/components/skydiving/ImportPanel.tsx:18-271
> - src/components/skydiving/SkydiveVoucherSelect.tsx:25-91
> - src/hooks/useSkydiveJumps.ts:31-143
> - src/hooks/useApiMutation.ts:18-27
> - src/messages/es.json (skydiving.*) / src/messages/en.json (skydiving.*)
> - tailwind.config.js:19-28
> - docs/DESIGN.md:21-57

## Resumen ejecutivo

El módulo Skydiving está bien estructurado, con paridad i18n perfecta (123 claves en ambos `es.json` y `en.json`, sin huérfanas) y patrones consistentes (skeletons, paginación, mobile cards, vouchers prorrateados). Sin embargo hay defectos que afectan confianza y claridad: las tablas no tienen estado de error (un fallo de red se disfraza de "lista vacía"), el borrado usa un patrón de "doble clic" sin texto ni timeout que rompe la convención de `ConfirmDialog` del proyecto y carece de feedback de éxito, y hay una inconsistencia de unidades en altitud (campo `exitAltitudeFt` que se muestra como "m"). También se usan colores fuera del sistema documentado en DESIGN.md (`guard-warning` ámbar y `cyan-400/500`) y el coste total aparece en rojo de "gasto" sin indicador secundario, violando la regla de color de marca.

## Hallazgos

### 🔴 Crítico

- **Severidad**: 🔴 Crítico
- **Categoría**: Flujo / Usabilidad
- **Ubicación**: src/components/skydiving/JumpLogTable.tsx:82-128 y src/components/skydiving/TunnelSessionTable.tsx:75-121
- **Problema**: Las tablas solo manejan `isLoading`; nunca consultan `isError` de `useSkydiveJumps`/`useTunnelSessions`. Si la petición falla (red, 500, sesión caducada), `data` queda `undefined` y se renderiza el empty state "No hay saltos registrados" / "No hay sesiones de túnel registradas". El usuario cree que sus datos se han borrado o que nunca existieron, cuando en realidad la carga falló. En una app financiera esto destruye la confianza y puede inducir a recrear registros ya existentes (duplicados).
- **Recomendación**: Añadir rama `isError` que renderice el componente `ErrorState` reutilizable (`src/components/ui/ErrorState`) con opción de reintento (`refetch`), tal como hacen otros módulos. Diferenciar siempre "vacío" de "error".

- **Severidad**: 🔴 Crítico
- **Categoría**: Usabilidad / Copy / Accesibilidad
- **Ubicación**: src/components/skydiving/JumpLogTable.tsx:73-80,177-192 y TunnelSessionTable.tsx:66-73,162-177
- **Problema**: El borrado usa un patrón "armar con primer clic, confirmar con segundo clic" sobre el mismo icono de papelera. (1) No hay ningún texto visible que comunique "vuelve a pulsar para confirmar"; el único indicador es un cambio sutil de color a rojo y el `aria-label`, por lo que un usuario vidente no recibe instrucción clara y la acción destructiva queda a un clic accidental de ejecutarse. (2) El estado armado (`deletingId`) no tiene timeout ni se cancela al hacer clic fuera: queda "cargado" indefinidamente, de modo que un clic posterior accidental en la misma fila borra el registro. (3) Rompe la convención del proyecto: existe `ConfirmDialog` reutilizable usado en el resto de la app. (4) No hay confirmación de éxito (toast) tras borrar.
- **Recomendación**: Sustituir el doble clic por `ConfirmDialog` (patrón existente) con título/descripción i18n y botón destructivo claro; o, si se mantiene inline, añadir timeout de auto-reset y texto/tooltip "Pulsa de nuevo para confirmar". Añadir toast de éxito tras `mutateAsync` (ver siguiente hallazgo).

### 🟠 Alto

- **Severidad**: 🟠 Alto
- **Categoría**: Flujo / Resiliencia
- **Ubicación**: src/components/skydiving/JumpLogTable.tsx:73-80 y TunnelSessionTable.tsx:66-73 (handleDelete) — hooks src/hooks/useSkydiveJumps.ts:95-114
- **Problema**: El `handleDelete` hace `await deleteJump.mutateAsync(jumpId)` sin `try/catch`. Si el DELETE falla (p.ej. salto con transacción/bono enlazado, error de red), la promesa rechaza, no se muestra ningún mensaje al usuario y `setDeletingId(null)` no se ejecuta, dejando la fila en estado "armado". El usuario no sabe si se borró o no. `useApiMutation` ya expone `errorMessage` traducido, pero la tabla no lo usa en ningún punto.
- **Recomendación**: Envolver en `try/catch`, mostrar el `errorMessage` (toast o banner inline) y resetear `deletingId` en `finally`. Reutilizar el mecanismo de toast existente en otros módulos para confirmar éxito ("Salto eliminado").

- **Severidad**: 🟠 Alto
- **Categoría**: Copy / Visual (datos financieros/medidas)
- **Ubicación**: src/components/skydiving/JumpLogTable.tsx:31-34 (formatAltitude) y :165; campo en JumpForm.tsx:198-208; tipo `exitAltitudeFt`
- **Problema**: El dato se llama `exitAltitudeFt` (sugiere pies), la columna y el formulario lo etiquetan en metros ("Altitud de salida (m)" / "Exit altitude (m)") y `formatAltitude` añade el sufijo " m" sin conversión. O bien el nombre del campo miente (es realmente metros) o la UI muestra pies con etiqueta de metros. En una bitácora de saltos la altitud es un dato de seguridad/precisión; la ambigüedad de unidad es un error de claridad serio. Además `meters.toLocaleString()` usa el locale del navegador, no el patrón UTC/locale del proyecto, pudiendo divergir del formato del resto de la app.
- **Recomendación**: Decidir la unidad canónica y alinear nombre de campo, etiqueta i18n y sufijo de formato. Documentar la unidad junto al patrón de dinero. Confirmar que `toLocaleString` respeta el locale activo de la app.

- **Severidad**: 🟠 Alto
- **Categoría**: Visual / Accesibilidad (color de marca)
- **Ubicación**: src/components/skydiving/SkydiveStatsCards.tsx:97-98 (text-guard-warning), :107,:111 (text-cyan-500/400), :119 (text-guard-danger en "Coste Total")
- **Problema**: DESIGN.md (líneas 21-31) define una paleta cerrada: indigo=acción, emerald=ingreso, rose=gasto, slate=secundario; principio "Consistent restraint". Aquí se usan: (a) `text-guard-warning` (#F59E0B ámbar) que NO figura en la tabla de Brand Colors de DESIGN.md aunque exista en tailwind.config.js:28; (b) `text-cyan-500` y `text-cyan-400`, colores crudos de Tailwind fuera del sistema; (c) `text-guard-danger` (rose=gasto) aplicado al icono de "Coste Total", que es un KPI informativo, no un movimiento de gasto, y se aplica SOLO por color sin indicador secundario, contraviniendo "income/expense must have secondary indicators beyond color" (DESIGN.md:46). Esto erosiona el lenguaje cromático: el rojo deja de significar inequívocamente "gasto/alerta".
- **Recomendación**: Restringir los iconos de KPI a la paleta documentada (indigo/emerald/slate) o documentar formalmente cyan/amber en DESIGN.md antes de usarlos. Para "Coste Total" usar un color neutro o, si se quiere señalar gasto, acompañarlo de indicador no cromático (signo, etiqueta).

### 🟡 Medio

- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad
- **Ubicación**: src/app/(auth)/skydiving/page.tsx:74-89
- **Problema**: Las tabs son `<button>` sueltos dentro de un `<div>`, sin `role="tablist"`/`role="tab"`, sin `aria-selected`, sin `aria-controls` ni navegación con flechas. Un usuario de lector de pantalla no percibe que es un grupo de pestañas ni cuál está activa (solo se distingue por color, sin indicador semántico). El panel de contenido tampoco tiene `role="tabpanel"`.
- **Recomendación**: Implementar el patrón ARIA Tabs (tablist/tab/tabpanel, `aria-selected`, gestión de foco con flechas) o reutilizar un componente de tabs accesible del proyecto si existe.

- **Severidad**: 🟡 Medio
- **Categoría**: Resiliencia / Onboarding
- **Ubicación**: src/components/skydiving/ImportPanel.tsx:62-66,83-91,104-106
- **Problema**: El parser CSV deja `console.log`/`console.warn`/`console.error` de depuración en producción (ruido en consola, fuga de datos crudos de filas del usuario a la consola del navegador). Además, cuando se omiten filas durante el parseo (`skippedCount`), el usuario no ve cuántas ni por qué: solo se informa de filas válidas en el preview (`skydiving.import.preview`); el conteo de omitidas solo aparece tras importar. Para un import inicial (momento clave de onboarding con datos históricos), la falta de visibilidad de filas descartadas mina la confianza.
- **Recomendación**: Eliminar los `console.*` o condicionarlos a un flag de debug. Mostrar en el preview "X válidas, Y omitidas" antes de confirmar, idealmente con motivo de las omitidas.

- **Severidad**: 🟡 Medio
- **Categoría**: Visual / Consistencia (tokens DESIGN.md)
- **Ubicación**: src/app/(auth)/skydiving/page.tsx:66; SkydiveStatsCards.tsx:41; JumpLogTable.tsx:87; ImportPanel.tsx:161
- **Problema**: Inconsistencias con los tokens de DESIGN.md: (a) el contenedor es `max-w-6xl` mientras DESIGN.md:39 fija `max-w-7xl` como ancho de página (el resto de la app puede divergir visualmente). (b) Las cards usan `rounded-lg` y `p-4` en vez del `--radius` 0.625rem y `p-6` documentados (DESIGN.md:36,40). (c) `ImportPanel` es un modal hecho a mano (`fixed inset-0 bg-black/50`, ImportPanel.tsx:160) en lugar de reutilizar `ModalBackdrop` (que sí usan JumpForm/TunnelSessionForm), perdiendo el trap de foco, el `aria-modal` y la animación consistentes.
- **Recomendación**: Alinear contenedor a `max-w-7xl`, padding de cards a `p-6` y radios al token base. Migrar `ImportPanel` a `ModalBackdrop` para heredar accesibilidad y consistencia.

- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad / Resiliencia
- **Ubicación**: src/components/skydiving/ImportPanel.tsx:187-205
- **Problema**: La zona de drop-and-click es un `<button>` que envuelve toda el área con icono y textos; sirve para clic y teclado, pero el `<input type=file>` queda oculto y el botón no anuncia el estado de archivo seleccionado de forma asociada (solo cambio de color de borde). No hay `aria-live` para el resultado/errores de importación (ImportPanel.tsx:216-231), de modo que el lector de pantalla no anuncia "X importados" ni el error tras la acción.
- **Recomendación**: Añadir `aria-live="polite"` al contenedor de resultado y `role="alert"` al de error (este último ya se usa en los formularios). Considerar exponer el nombre de archivo vía `aria-describedby`.

- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad (formularios RHF+Zod)
- **Ubicación**: src/components/skydiving/JumpForm.tsx:170-180,213-236,276-282 y TunnelSessionForm.tsx:168-180,212-218
- **Problema**: Varios campos opcionales (jumpType, aircraft, canopy, comment, sessionType, notes) renderizan el error solo para los campos con `errors.x` explícito (jumpNumber, jumpDate, durationMin). Si el schema Zod rechazara estos campos (p.ej. longitud máxima), el mensaje no se mostraría porque se pasa `inputClass(false)` fijo y no hay bloque `errors.x`. El usuario podría enviar y recibir un error genérico de mutación sin saber qué campo corregir.
- **Recomendación**: Pasar `inputClass(!!errors.<campo>)` y renderizar el `<p role="alert">` correspondiente en todos los campos validables, no solo en los obligatorios.

### 🟢 Bajo

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual / Overflow
- **Ubicación**: src/components/skydiving/JumpLogTable.tsx:162-166 y TunnelSessionTable.tsx:146-147
- **Problema**: En la tabla desktop, celdas como dropzone, jumpType, aircraft, location y sessionType no tienen truncado ni `OverflowTooltip`. Un valor largo (nombre de dropzone extenso, notas de tipo) puede ensanchar la tabla y forzar scroll horizontal o romper la alícuota de columnas. En mobile el dropzone sí usa `truncate` (JumpLogTable.tsx:248) pero sin tooltip para ver el texto completo.
- **Recomendación**: Aplicar `truncate` + `OverflowTooltip` (componente existente) en columnas de texto libre, manteniendo el patrón usado en otras tablas del proyecto.

- **Severidad**: 🟢 Bajo
- **Categoría**: Visual (formato de duración)
- **Ubicación**: src/components/skydiving/SkydiveStatsCards.tsx:16-25 vs TunnelSessionTable.tsx:27-32
- **Problema**: Hay dos implementaciones distintas de `formatDuration`. La de StatsCards omite los segundos cuando hay horas (`${hours}h ${minutes}m`), la de la tabla muestra `Xm Ys`. Formatos inconsistentes para el mismo concepto (tiempo) entre resumen y detalle pueden confundir al comparar. Además, números muy grandes de freefall total se muestran en `h m` sin separador de miles ni problema, pero la divergencia de estilo persiste.
- **Recomendación**: Extraer un único helper de formato de duración a `utils` (DRY) y reutilizarlo en ambos lugares.

- **Severidad**: 🟢 Bajo
- **Categoría**: Copy / Microcopy
- **Ubicación**: src/messages/es.json — skydiving.subtitle ("Log de saltos...") y skydiving.stats.dropzones ("Dropzones")
- **Problema**: El microcopy mezcla anglicismos ("Log", "Dropzones", "tracking") en una UI en español. Aunque son jerga aceptada en paracaidismo, "Log" y "tracking" en el subtítulo rompen el registro del resto de la app (que está localizada). DESIGN.md pide tono "Limpio/Profesional".
- **Recomendación**: Evaluar "Registro de saltos, sesiones de túnel y seguimiento de gastos". Mantener "Dropzone" si es el término preferido por el usuario experto, pero hacerlo de forma consistente.

- **Severidad**: 🟢 Bajo
- **Categoría**: Usabilidad (descubribilidad)
- **Ubicación**: src/components/skydiving/JumpForm.tsx:268-274 y SkydiveVoucherSelect.tsx:40
- **Problema**: `SkydiveVoucherSelect` devuelve `null` cuando no hay vouchers de la subcategoría (`if (vouchers.length === 0) return null`). El usuario no recibe ninguna señal de que el pago con bono existe pero no tiene bonos disponibles; simplemente la opción desaparece sin explicación. Para descubribilidad de la feature de bonos, un mensaje sutil ayudaría.
- **Recomendación**: Considerar mostrar la casilla deshabilitada con texto "No tienes bonos disponibles" o un enlace a crear bono, en vez de ocultar por completo.

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. **Añadir estado de error a las dos tablas** (JumpLogTable.tsx:82, TunnelSessionTable.tsx:75): consultar `isError` y renderizar `ErrorState` con reintento. Elimina el peligroso disfraz "error → lista vacía".
2. **Envolver `handleDelete` en try/catch + toast** (ambas tablas): resetear `deletingId` en `finally`, mostrar `errorMessage` traducido (ya disponible vía `useApiMutation`) y un toast de éxito. Cierra el agujero de borrado sin feedback.
3. **Eliminar `console.*` de depuración del ImportPanel** (ImportPanel.tsx:62-66,83-91,104-106) y mostrar "X válidas / Y omitidas" en el preview antes de confirmar. Pequeño cambio, gran ganancia de confianza en el import inicial.

## Top 2 mejoras estructurales

1. **Unificar el patrón de confirmación destructiva y feedback**: sustituir el doble-clic inline por el `ConfirmDialog` reutilizable del proyecto y conectar el sistema de toasts para éxito/error en todas las mutaciones del módulo (crear, editar, borrar, importar). Esto alinea Skydiving con el resto de la app, mejora accesibilidad (foco, aria) y elimina el estado "armado" indefinido.
2. **Sanear el lenguaje visual y los tokens frente a DESIGN.md**: corregir la inconsistencia de unidad de altitud (nombre de campo vs etiqueta vs sufijo), restringir los colores de KPI a la paleta documentada (eliminar/documentar cyan y amber, quitar el rojo "gasto" sin indicador secundario en "Coste Total"), alinear `max-w-7xl`, `p-6` y radios, y migrar `ImportPanel` a `ModalBackdrop`. Refuerza la "restricción consistente" y la fiabilidad cromática que exige una app financiera.
