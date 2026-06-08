# Auditoría UX/UI — Viajes (Trips)

> Skills aplicados: critique (jerarquía/IA/resonancia, base), audit (a11y/theming/responsive), clarify (microcopy/errores), harden (resiliencia/i18n/overflow), polish (alineación/espaciado), onboard (empty states)
>
> Archivos revisados:
> - `src/app/(auth)/trips/page.tsx:26,30-37,41`
> - `src/app/(auth)/trips/[id]/page.tsx:22,27-33,43-56,72-85`
> - `src/components/trips/TripList.tsx:29,45-53,64-82,104-168`
> - `src/components/trips/TripCard.tsx:32-39,62-63,97-110`
> - `src/components/trips/TripDetail.tsx:42,78-83,100-113`
> - `src/components/trips/TripCreateForm.tsx:39-45,135,160-177`
> - `src/components/trips/TripEditForm.tsx:38-42,135,153-157`
> - `src/components/trips/TripExpenseForm.tsx:39-40,83-87,162-167,210-251,263-282`
> - `src/components/trips/TripExpenseRow.tsx:31-33,42-44,66-83`
> - `src/components/trips/TripSummaryCards.tsx:18-37`
> - `src/components/trips/ActiveTripBanner.tsx:39-47,79-87,99-101`
> - `src/hooks/useTrips.ts:14-18,30-34`, `useTripExpenses.ts`, `useTripCategories.ts:11-15`, `useActiveTrips.ts:9-15`
> - `src/schemas/trip.ts:12-56`
> - `src/utils/helpers.ts:16-33` (formatTripPeriod)
> - `src/constants/finance.ts:209` (TRIP_COLOR = #8B5CF6)
> - `src/components/ui/DeleteButton.tsx:28-49`
> - `docs/DESIGN.md` (tokens/colores), `src/styles/global.css:185-193` (prefers-reduced-motion)

## Resumen ejecutivo

El módulo Viajes está bien construido: paridad i18n completa (60 claves es/en, ninguna huérfana), estados loading/empty/error/success cubiertos, skeletons en la lista, focus management en modales, indicadores secundarios para gasto (flecha `ArrowUpRight` + signo `-`) y reduced-motion global. La mayoría de hallazgos son de consistencia visual y resiliencia, no de funcionalidad rota. Los puntos más relevantes: (1) el botón primario del formulario de gasto usa color de peligro/gasto (Rose) como color de acción, contradiciendo el lenguaje de color de DESIGN.md; (2) los formularios muestran un error genérico estático en lugar del `errorMessage` real ya traducido por `useApiMutation`, ocultando causas como conflictos; (3) la introducción de un quinto color de marca (Violet `#8B5CF6`) no documentado rompe la "restricción consistente". El ancho de página (`max-w-4xl`) también difiere del contenedor estándar `max-w-7xl`.

## Hallazgos

### 1. El botón de acción del formulario de gasto usa color de peligro (Rose)
- **Severidad**: 🟠 Alto
- **Categoría**: Visual
- **Ubicación**: `src/components/trips/TripExpenseForm.tsx:263-270`
- **Problema**: El botón de submit ("Guardar gasto") usa `bg-guard-danger hover:bg-guard-danger/90`. DESIGN.md (línea 19, 27-28) define Rose = gasto/alerta e Indigo = acción, "siempre con indicador secundario, nunca solo color". Los demás formularios del módulo (`TripCreateForm.tsx:166`, `TripEditForm.tsx:166`) usan `bg-guard-primary` para el mismo rol de acción. Un usuario percibe el botón rojo como destructivo/peligroso justo en el flujo más frecuente (registrar gasto), generando "alarma" en lugar de "calma confiable" (principio 2 de DESIGN.md).
- **Recomendación**: Usar `bg-guard-primary` como en los otros dos formularios del módulo. Si se quiere señalar que es un gasto, hacerlo con un indicador secundario (icono/etiqueta) y no tiñendo el CTA principal de rojo.

### 2. Los formularios muestran un error genérico en vez del mensaje real traducido
- **Severidad**: 🟠 Alto
- **Categoría**: Flujo / Copy
- **Ubicación**: `src/components/trips/TripCreateForm.tsx:153-157`; `TripEditForm.tsx:153-157`; `TripExpenseForm.tsx:254-260`
- **Problema**: Los hooks usan `useApiMutation`, que expone `errorMessage` ya traducido (los request lanzan claves específicas vía `extractApiErrorKey`, p.ej. `API_ERROR.MUTATION.CREATE.TRIP`). Sin embargo, la UI ignora `mutation.errorMessage` y pinta un literal estático (`t('trips.errors.create')`, `'trips.errors.update'`, `trips.expense-form.errors.create`). Si el backend devuelve un conflicto o una validación específica, el usuario ve siempre el mismo "No se pudo crear" y pierde la causa accionable.
- **Recomendación**: Mostrar `mutation.errorMessage ?? t('trips.errors.create')` en el bloque `role="alert"`, igual que el patrón documentado en CLAUDE.md ("mutation.errorMessage -> translated string | null").

### 3. Se introduce un quinto color de marca (Violet) no documentado
- **Severidad**: 🟡 Medio
- **Categoría**: Visual
- **Ubicación**: `src/constants/finance.ts:209` (`TRIP_COLOR = '#8B5CF6'`); usado en `ActiveTripBanner.tsx:40-41,54,79-83,99-101`, `TripCard.tsx:50`, `TripExpenseForm.tsx:223,236`, `TripSummaryCards.tsx:24`
- **Problema**: DESIGN.md (líneas 23-30) define una paleta cerrada de 6 colores (dark, primary, success, danger, muted, light). El módulo añade Violet como color de identidad de "viajes" mediante estilos inline (`style={{ backgroundColor: TRIP_COLOR }}`), saltándose los tokens CSS. Esto rompe el principio "restricción consistente" (DESIGN.md 56) y dificulta el theming (no respeta variables CSS ni dark mode).
- **Recomendación**: Documentar el color de acento de Viajes en DESIGN.md como token (`--guard-trip`) y exponerlo como clase utilitaria Tailwind, o reusar `guard-primary`. Evitar `style` inline para colores de marca; centralizar en tokens.

### 4. El botón de añadir gasto del banner activo carece de hover y focus ring visibles
- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad
- **Ubicación**: `src/components/trips/ActiveTripBanner.tsx:79-87`
- **Problema**: El CTA "Añadir gasto" del banner usa `transition-colors` pero su color es 100% inline (`style={{ backgroundColor: TRIP_COLOR }}`) sin estado `hover:` ni `focus-visible:` ring. DESIGN.md (líneas 47-48) exige "focus rings visibles" y "sombras sm→md hover". A diferencia del botón `Pencil` adyacente (línea 58, que sí tiene hover), este queda estático al pasar el cursor y sin indicación de foco por teclado.
- **Recomendación**: Añadir `focus-visible:ring-2` y un estado hover (p.ej. opacidad o sombra). Mejor aún, reutilizar la clase `btn-primary` del sistema en lugar de estilos inline.

### 5. Ancho de contenedor inconsistente con el token de diseño
- **Severidad**: 🟡 Medio
- **Categoría**: Visual / Responsive
- **Ubicación**: `src/app/(auth)/trips/page.tsx:26`; `src/app/(auth)/trips/[id]/page.tsx:45,59`
- **Problema**: Ambas páginas usan `max-w-4xl` (~896px). DESIGN.md (línea 39) define el contenedor estándar en `max-w-7xl` (1280px). En la lista de viajes esto fuerza la grid a 2 columnas máximo y desaprovecha espacio en pantallas anchas; además es inconsistente con el resto de la app.
- **Recomendación**: Alinear con `max-w-7xl` (o documentar explícitamente que las páginas de detalle usan un ancho de lectura reducido). Si se mantiene reducido, registrarlo como excepción en DESIGN.md.

### 6. DeleteButton interactivo anidado dentro de un `<Link>` (TripCard)
- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad
- **Ubicación**: `src/components/trips/TripCard.tsx:32-39,103-109` + `DeleteButton.tsx:32-36`
- **Problema**: La tarjeta entera es un `<Link>` y dentro vive un `<button>` (DeleteButton) con su flujo de doble-clic. Funciona porque DeleteButton hace `e.preventDefault()`/`stopPropagation()`, pero un control interactivo anidado en un ancla es un antipatrón de accesibilidad: con teclado, tabular dentro de la tarjeta navega al botón borrar y la activación accidental con Enter sobre el ancla es ambigua. El estado de confirmación del DeleteButton ocurre dentro de un enlace que puede navegar.
- **Recomendación**: Sacar el botón de borrado fuera del área del `<Link>` (overlay posicionado fuera del flujo del anchor) o convertir la tarjeta en contenedor no-anchor con un enlace explícito en el título, evitando anidar `button` dentro de `a`.

### 7. Fila de gasto en escritorio: control clicable sin acceso por teclado
- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad
- **Ubicación**: `src/components/trips/TripExpenseRow.tsx:42-44`
- **Problema**: La fila de escritorio es un `<div onClick={() => onEdit(transaction)}>` con `biome-ignore` para `useKeyWithClickEvents`/`noStaticElementInteractions`. El comentario justifica que "el botón Editar provee acceso por teclado", pero el botón Editar está oculto (`max-w-0`) hasta `group-hover`/`group-focus-within` (líneas 66). Un usuario de teclado puede alcanzarlo vía focus-within, pero la fila completa como zona de clic no es operable por teclado y depende de descubrir un control que aparece solo al enfocar.
- **Recomendación**: Asegurar que el botón Editar sea siempre tabulable (ya lo es), y verificar que el `group-focus-within` revele el control al recibir foco (correcto). Considerar exponer el área editable como un `<button>` real envolviendo el contenido no-interactivo para clic+teclado consistentes.

### 8. Símbolo de fecha (en-dash/guion) y rango pueden confundir; falta etiqueta de "rango"
- **Severidad**: 🟢 Bajo
- **Categoría**: Copy
- **Ubicación**: `src/components/trips/TripCard.tsx:82-84`; `TripDetail.tsx:65-67`; `ActiveTripBanner.tsx:66-67`
- **Problema**: El rango se muestra como `{inicio} — {fin}` con un em-dash sin etiqueta semántica. Es comprensible, pero para lectores de pantalla se anuncia como dos fechas separadas por "raya". No es bloqueante.
- **Recomendación**: Opcional: envolver con `aria-label` tipo `Del {inicio} al {fin}` para narración clara; o usar microcopy "del … al …".

### 9. La barra de color de categorías de la tarjeta no es accesible (solo `title`)
- **Severidad**: 🟢 Bajo
- **Categoría**: Accesibilidad
- **Ubicación**: `src/components/trips/TripCard.tsx:41-54`
- **Problema**: La barra apilada de categorías transmite información (distribución de gasto) solo por color + `title` nativo. El `title` no es accesible por teclado ni en táctil, y el color por sí solo incumple DESIGN.md (línea 19, "nunca solo color"). El desglose textual sí existe en SummaryCards del detalle, pero en la tarjeta de lista la barra queda como dato solo-visual.
- **Recomendación**: Marcar la barra como `aria-hidden` (es decorativa, ya hay resumen en detalle) o exponer un `aria-label` con la categoría dominante. Preferir Tooltip accesible del sistema (`Tooltip`/`OverflowTooltip`) en vez de `title` nativo.

### 10. `formatTripPeriod` y los badges fijan locale `es-ES` (no reactivo a `setLocale`)
- **Severidad**: 🟢 Bajo
- **Categoría**: Copy / i18n
- **Ubicación**: `src/utils/helpers.ts:16` (`locale = 'es-ES'`), invocado en `TripCard.tsx:63`; `formatDate` por defecto `es-ES` (helpers.ts:38) en `TripCard.tsx:83`, `TripDetail.tsx:65`, `ActiveTripBanner.tsx:67`
- **Problema**: Aunque la UI es en español, la app expone `setLocale` (en/es). Las fechas de viajes siempre se formatean en `es-ES` independientemente del locale activo, por lo que un usuario en modo inglés verá meses en español ("mar", "abr"). Inconsistencia menor de i18n.
- **Recomendación**: Pasar el `locale` activo de `useTranslate()` a `formatDate`/`formatTripPeriod` en estos componentes, como hace el resto de la app si aplica.

### 11. Overflow de nombre + periodo en una sola línea truncada
- **Severidad**: 🟢 Bajo
- **Categoría**: Responsive
- **Ubicación**: `src/components/trips/TripCard.tsx:62-64`
- **Problema**: El `<h3 truncate>` concatena `{trip.name} {formatTripPeriod(...)}` en la misma línea. Con un nombre largo, el periodo (mar–abr 2026) se trunca junto al nombre y puede desaparecer por completo, perdiendo el dato de fechas en la cabecera (aunque sigue debajo en la fila de Calendar). Con números/nombres muy largos el periodo queda inaccesible.
- **Recomendación**: Separar el periodo del nombre (badge o segunda línea), o aplicar `truncate` solo al nombre y mantener el periodo en un `<span>` con `flex-shrink-0`.

### 12. El hint de gasto compartido redondea con `Math.ceil` sin explicación
- **Severidad**: 🟢 Bajo
- **Categoría**: Copy
- **Ubicación**: `src/components/trips/TripExpenseForm.tsx:85-87`
- **Problema**: "Tu parte" se calcula con `Math.ceil(eurosToCents(amount)/DIVISOR)`. Para importes impares (p.ej. 10,01 €) "tu parte" mostrará 5,01 € (redondeo hacia arriba), lo que puede sorprender al usuario sin contexto. Es correcto a nivel de céntimos pero el microcopy no aclara el redondeo.
- **Recomendación**: Aceptable; opcional añadir matiz en el hint o documentar la política de redondeo. Verificar que coincide con cómo el backend divide el gasto compartido para evitar discrepancias visibles.

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. **Cambiar el CTA del formulario de gasto a `bg-guard-primary`** (Hallazgo 1): un solo cambio de clase elimina la señal de "alarma" roja y alinea con los otros dos formularios del módulo.
2. **Mostrar `mutation.errorMessage` en los tres formularios** (Hallazgo 2): aprovecha el mensaje ya traducido por `useApiMutation` para dar feedback específico (conflictos, validación) en lugar de un literal genérico.
3. **Añadir `focus-visible:ring-2` y hover al botón "Añadir gasto" del banner** (Hallazgo 4): cumple el requisito de focus ring de DESIGN.md con CSS mínimo; idealmente reutilizar `btn-primary`.

## Top 2 mejoras estructurales

1. **Formalizar el color de acento de Viajes como token de diseño** (Hallazgo 3): documentar `#8B5CF6` en DESIGN.md y exponerlo como variable CSS/clase Tailwind, sustituyendo todos los `style={{ backgroundColor: TRIP_COLOR }}` inline. Esto restablece la "restricción consistente", garantiza compatibilidad con dark mode/theming y centraliza el color en un único punto.
2. **Rediseñar el patrón de interacción tarjeta/fila para accesibilidad** (Hallazgos 6 y 7): evitar controles interactivos anidados dentro de `<Link>` (tarjeta) y áreas clicables sobre `<div>` sin equivalente de teclado (fila de gasto). Patrón recomendado: contenedor no-anchor con enlace explícito en el título + botones de acción fuera del flujo del enlace, garantizando orden de tabulación y activación por teclado coherentes en todo el módulo.
