# Auditoría UX/UI — Crypto

> Skills aplicados: critique (jerarquía/IA/resonancia — base), harden (resiliencia/errores/i18n/overflow), audit (a11y/theming/responsive), clarify (microcopy/labels), polish (alineación/espaciado)
>
> Archivos revisados:
> - src/app/(auth)/crypto/page.tsx:1-121
> - src/components/crypto/CryptoSyncPanel.tsx:1-321
> - src/components/crypto/CryptoEventsTable.tsx:1-246
> - src/components/crypto/CryptoDisposalsTable.tsx:1-151
> - src/components/crypto/CryptoModelo100Section.tsx:1-191
> - src/components/crypto/CryptoAeatGuide.tsx:1-185
> - src/components/crypto/CryptoCsvUploader.tsx:1-223
> - src/components/crypto/CryptoPriceChart.tsx:1-836
> - src/components/crypto/positionBandPrimitive.ts:1-223
> - src/components/dashboard/charts/ChartCard.tsx:1-62
> - src/hooks/useCryptoSync.ts:1-238
> - src/hooks/useCryptoFiscal.ts:1-166
> - src/hooks/useCryptoCredentials.ts:1-125
> - src/utils/cryptoEventPresenter.ts:1-230
> - src/styles/global.css:1-75
> - src/messages/es.json:1044-1299
> - src/messages/en.json:1044-1299

## Resumen ejecutivo

El módulo Crypto está bien construido y mantiene un alto nivel de consistencia con el sistema de diseño: usa tokens `guard-*`, formato de dinero en céntimos (`formatCurrency`), paridad i18n es/en completa y exhaustiva (incluida la guía AEAT con steps por casilla), e indicadores secundarios de signo (`+`/`−`, flechas, etiquetas Compra/Venta) más allá del color. El gráfico de cotizaciones es especialmente cuidado (precisión adaptativa, tooltips anclados a bordes, P&L en EUR best-effort). Los problemas principales son de **resiliencia**: tres de las cuatro tablas/secciones (Movimientos, Transmisiones, Modelo 100) no tienen estado de error — si la query falla, la pantalla queda en blanco silenciosamente, a diferencia del gráfico que sí usa `ChartCard` con `ErrorState` y reintento. Hay además fallos de accesibilidad en las filas expandibles (sin soporte de teclado/roles ARIA) y de consistencia visual menores (botones de sincronización ad-hoc en vez de `.btn-primary`, tooltips de fecha solo en hover).

## Hallazgos

### 🔴 Crítico — Usabilidad / Flujo — La tabla de Movimientos no tiene estado de error
- **Ubicación**: src/components/crypto/CryptoEventsTable.tsx:80-86
- **Problema**: El componente solo contempla `events.isLoading` y `events.data`. Si la query falla (`events.isError`), `data` queda `undefined` y el loading es `false`, por lo que no se renderiza ni la tabla, ni el empty, ni un mensaje de error: el usuario ve la cabecera/filtros y un hueco vacío sin explicación ni opción de reintentar. El hook `useCryptoEvents` lanza `throw new Error('Error loading crypto events')` (useCryptoSync.ts:207) pero ese error nunca se muestra.
- **Recomendación**: Replicar el patrón del propio módulo en `CryptoPriceChart`, que envuelve todo en `ChartCard` con `isError`/`onRetry`/`errorMessage` (ChartCard.tsx:53-54 usa `ErrorState`). Añadir un bloque `{events.isError && <ErrorState message={t('...')} onRetry={() => events.refetch()} />}` usando el componente reutilizable `src/components/ui/ErrorState`. Requiere una clave i18n nueva en ambos `es.json`/`en.json`.

### 🔴 Crítico — Usabilidad / Flujo — La tabla de Transmisiones (disposals) no tiene estado de error
- **Ubicación**: src/components/crypto/CryptoDisposalsTable.tsx:53-57
- **Problema**: Mismo patrón que Movimientos: solo `disposals.isLoading` y `disposals.data`. En la pestaña Fiscal, un fallo de red al cargar disposals deja la sección vacía sin feedback. Es especialmente grave aquí porque son datos fiscales que el usuario copiará a Renta Web: un fallo silencioso puede hacerle creer que "no hay transmisiones" (que es justo el mensaje vacío de la línea 56) cuando en realidad la carga falló.
- **Recomendación**: Añadir manejo de `disposals.isError` con `ErrorState` + `refetch()`, diferenciándolo claramente del empty `crypto.fiscal.no-disposals` para no confundir "0 transmisiones" con "error de carga".

### 🟠 Alto — Usabilidad / Flujo — Modelo 100 trata el error de carga como "sin datos"
- **Ubicación**: src/components/crypto/CryptoModelo100Section.tsx:38-47 y CryptoAeatGuide.tsx:72-73
- **Problema**: `CryptoModelo100Section` hace `const data = summary.data?.summary; if (!data) return <...>{t('crypto.fiscal.no-data')}</...>`. Si `useCryptoModelo100Summary` falla (lanza error en useCryptoFiscal.ts:72), `summary.data` es `undefined` y se muestra "Aún no hay datos sincronizados", que es engañoso: el usuario tiene datos pero la petición reventó. `CryptoAeatGuide` es peor: ante `!data` hace `return null` (línea 73), desapareciendo por completo de la pestaña sin ninguna explicación.
- **Recomendación**: Distinguir `summary.isError` del caso "sin datos reales". Mostrar `ErrorState` con reintento en error, y reservar `no-data` solo para respuestas exitosas vacías. En `CryptoAeatGuide`, no retornar `null` ante error; mostrar al menos un mensaje.

### 🟠 Alto — Accesibilidad — Filas expandibles sin soporte de teclado ni roles ARIA
- **Ubicación**: src/components/crypto/CryptoEventsTable.tsx:186 (`<tr ... onClick={onToggle}>`) y el chevron decorativo en línea 206
- **Problema**: La fila de movimiento es un `<tr>` con `onClick` y `cursor-pointer` pero sin `tabIndex`, sin `role="button"`, sin `onKeyDown` y sin `aria-expanded`. Un usuario de teclado/lector de pantalla no puede expandir el detalle (payload, external ID) ni sabe que la fila es interactiva. El indicador `›` que rota es un `<span>` de texto, no anunciable. Esto contradice el principio de DESIGN.md "Keyboard-accessible with visible focus rings" y WCAG AA. Nota: `CryptoDisposalsTable` sí lo hace bien (botón real con `aria-label` dinámico, líneas 82-93) y `CryptoAeatGuide` también (`aria-expanded`, línea 130) — la inconsistencia es la propia tabla de eventos.
- **Recomendación**: Convertir el toggle en un `<button>` real dentro de una celda (como en CryptoDisposalsTable.tsx:82-93) o añadir a la fila `role="button"`, `tabIndex={0}`, `aria-expanded={isExpanded}` y un handler `onKeyDown` para Enter/Espacio, con `focus-visible` ring (ya hay regla global en global.css:9-11).

### 🟠 Alto — Accesibilidad — Markers y bandas del gráfico solo accesibles con ratón (hover)
- **Ubicación**: src/components/crypto/CryptoPriceChart.tsx:741-801 (crosshair/hover) y positionBandPrimitive.ts (badge dibujado en canvas)
- **Problema**: Todo el detalle de operaciones (precio, coste EUR, fecha) y el P&L de cada banda vive exclusivamente en un tooltip que se dispara por `subscribeCrosshairMove` (movimiento de ratón) y por hit-test del badge en canvas. No hay alternativa de teclado ni texto accesible: un lector de pantalla no obtiene ninguna de estas cifras. El canvas de lightweight-charts es inherentemente inaccesible.
- **Recomendación**: La lista de operaciones ya existe en `TradesList` (líneas 379-426) como tooltip sobre un `<button>`; promoverla a una tabla/lista navegable por teclado (o al menos asegurar que ese botón abre el detalle con teclado) da una vía accesible al mismo dato. Documentar el chart como "complemento visual" y garantizar que la tabla de Movimientos (texto) cubre la misma información.

### 🟡 Medio — Visual / Consistencia — Botones de sincronización y export no usan las clases del sistema
- **Ubicación**: src/components/crypto/CryptoSyncPanel.tsx:144-178, CryptoModelo100Section.tsx:67-88
- **Problema**: Los botones "Completa", "Detener", "Incremental", "Exportar CSV" y "Recalcular FIFO" se construyen con utilidades Tailwind sueltas (`px-3 py-1.5 rounded-lg text-sm font-medium ...`) en lugar de `.btn-primary`/`.btn` definidas en global.css:72-98. El CSV uploader sí usa `.btn-primary` (CryptoCsvUploader.tsx:170). Esto produce padding (`py-1.5` vs `py-2.5`), radio (`rounded-lg` vs el del sistema) y curva de transición distintos a los botones del resto de la app, rompiendo "Consistent restraint" (DESIGN.md principio 5) y el token de transición 200ms ease-out.
- **Recomendación**: Migrar a `.btn-primary` (acción principal: sync completa) y a una variante secundaria/ghost consistente para incremental/export/recompute. Si hace falta un tamaño compacto, extraer un modificador reutilizable en global.css en lugar de redefinir ad-hoc en cada componente.

### 🟡 Medio — Accesibilidad — Fechas en `font-mono`/tooltip pierden contexto y contraste
- **Ubicación**: src/components/crypto/CryptoEventsTable.tsx:187 (fecha como `text-xs text-guard-muted`), CryptoPriceChart.tsx:408 (fecha con `opacity-55`)
- **Problema**: En `TradesList` la fecha se renderiza con `opacity-55` sobre el fondo del tooltip; combinado con texto pequeño puede caer por debajo del 4.5:1 exigido (DESIGN.md A11y). En la tabla de movimientos la fecha en `guard-muted` xs es el ancla temporal principal de cada fila y compite en jerarquía con el concepto.
- **Recomendación**: Evitar `opacity-*` para texto informativo (reduce contraste de forma no controlada); usar un token de color con contraste verificado. Confirmar contraste AA de `guard-muted` a tamaño xs sobre `card`/`popover`.

### 🟡 Medio — Copy / Clarify — Microcopy técnico expuesto al usuario final
- **Ubicación**: src/components/crypto/CryptoEventsTable.tsx:314 (`{eventType}` crudo en `font-mono`), CryptoDisposalsTable.tsx:102 (`{d.contraprestacion}` = "F"/"N" crudo)
- **Problema**: En el detalle por endpoint del panel de sync se muestra el `eventType` técnico (`spot_trade`, `earn_flex`…) sin traducir, pese a que existen las claves `crypto.events.type.*` en ambos idiomas. En la tabla de transmisiones la columna "Tipo" muestra la letra cruda `F`/`N` (línea 102) mientras que el filtro sí usa etiquetas legibles "F — fiat"/"N — cripto" (líneas 48-49). Inconsistencia que obliga al usuario a recordar el código.
- **Recomendación**: En `EndpointRow` traducir con `t('crypto.events.type.${eventType}')` (las claves ya existen). En la columna contraprestación, usar las mismas etiquetas `crypto.fiscal.contraprestacion-f/-n` que el selector, o un badge con tooltip.

### 🟡 Medio — Responsive — La barra de pestañas puede desbordar en móvil
- **Ubicación**: src/app/(auth)/crypto/page.tsx:67-87
- **Problema**: Las 4 pestañas (icono + label) están en un `flex gap-1 border-b` sin scroll horizontal ni wrap controlado. En pantallas estrechas (es: "Resumen", "Movimientos", "Cotizaciones", "Fiscal") el ancho combinado puede forzar overflow o compresión. No hay `overflow-x-auto` ni indicador de scroll.
- **Recomendación**: Añadir `overflow-x-auto` con `whitespace-nowrap` al contenedor de tabs (patrón común para tabs en móvil), o reducir a solo iconos con `aria-label` por debajo de `sm`.

### 🟡 Medio — Usabilidad — Recalcular FIFO no confirma ni explica que afecta a TODOS los años
- **Ubicación**: src/components/crypto/CryptoModelo100Section.tsx:30-32, 75-88
- **Problema**: "Recalcular FIFO" dispara `recompute.mutateAsync(undefined)` que recomputa todos los años (useCryptoFiscal.ts:128-131) — una operación potencialmente costosa — sin diálogo de confirmación. La advertencia de alcance solo vive en el `title` (tooltip nativo, líneas 80) que no aparece en táctil. Tras éxito no hay toast/feedback positivo; el único feedback es la desaparición del spinner y la actualización silenciosa de las casillas.
- **Recomendación**: Mostrar feedback de éxito (toast o mensaje efímero con nº de disposals recalculados, dato que ya devuelve `RecomputeResponse.totalDisposalsInserted`). Para operación de alcance global, valorar `ConfirmDialog` (ya usado en CryptoSyncPanel.tsx:191-200) o al menos un texto visible bajo el botón, no solo `title`.

### 🟢 Bajo — Visual / Theming — Colores del gráfico hardcodeados en hex en vez de tokens
- **Ubicación**: src/components/crypto/CryptoPriceChart.tsx:61-64 (`CHART_BG='#0F172A'`…) y positionBandPrimitive.ts:50-51 (`PROFIT_COLOR='#10B981'`, `LOSS_COLOR='#EF4444'`)
- **Problema**: El fondo, grid y P&L del chart usan literales hex que duplican los valores de los tokens `guard-dark`/`guard-success`/`guard-danger`. Si el tema cambia (p. ej. modo claro), el chart queda fijo en navy. El comentario reconoce la limitación ("guard tokens are CSS vars"), pero crea un punto de divergencia: el fondo del chart (`#0F172A`) ignora por completo el tema claro definido en global.css:13-39.
- **Recomendación**: Leer los valores de las CSS vars en runtime (`getComputedStyle`) o centralizar la paleta del chart en `chartConfig` (de donde ya importa `CHART_COLORS`), para que un futuro modo claro o ajuste de marca no requiera tocar dos hex sueltos.

### 🟢 Bajo — Copy / Clarify — Mezcla de "P&L" (inglés) en UI española
- **Ubicación**: src/messages/es.json:1268-1271 ("P&L no realizado", "P&L realizado"), es.json:1236
- **Problema**: La UI española usa "P&L", anglicismo no traducido. Aunque es jerga común en trading, choca con el resto del módulo que sí traduce ("Ganancia / pérdida", "Cotizaciones"). Inconsistencia de registro.
- **Recomendación**: Decidir un término y aplicarlo: o "Resultado (P&L)" para mantener el término técnico reconocible, o "Ganancia/pérdida latente/realizada" para coherencia con `crypto.fiscal.fields.gain-loss`.

### 🟢 Bajo — Responsive / Overflow — Operaciones ignoradas (CSV) y external IDs largos pueden romper layout
- **Ubicación**: src/components/crypto/CryptoCsvUploader.tsx:206-209, CryptoEventsTable.tsx:216 (`break-all`)
- **Problema**: En el resumen de import, los nombres de operación ignoradas usan `truncate` (bien), pero si hay muchas filas distintas la lista crece sin límite de altura ni scroll. Los external IDs largos en el detalle expandido usan `break-all` (correcto), pero el `pre` del payload JSON (línea 219) con `whitespace-pre-wrap break-all` puede generar bloques muy altos para payloads grandes sin `max-height`/scroll.
- **Recomendación**: Acotar la lista de skipped ops y el `<pre>` del payload con `max-h-*` + `overflow-y-auto`, evitando que un payload extenso empuje la página.

### 🟢 Bajo — Usabilidad — `setInterval` shadowing del global y precisión del nombre
- **Ubicación**: src/components/crypto/CryptoPriceChart.tsx:153 (`const [interval, setInterval] = useState`)
- **Problema**: El setter de estado se llama `setInterval`, sombreando la función global `window.setInterval`. No es un bug visible para el usuario, pero es una trampa de mantenibilidad/legibilidad. (Solo se reporta por completitud; no afecta a la UX directamente.)
- **Recomendación**: Renombrar a `selectedInterval`/`setSelectedInterval` para evitar el shadowing.

## Top 3 quick wins (alto impacto / bajo esfuerzo)

1. **Traducir el `eventType` y la contraprestación crudos** (CryptoEventsTable.tsx:314, CryptoDisposalsTable.tsx:102): las claves i18n ya existen en ambos idiomas; es cambiar `{eventType}` por `t(\`crypto.events.type.${eventType}\`)` y la letra `F/N` por las etiquetas del selector. Mejora claridad inmediata sin tocar lógica.
2. **Migrar botones de sync/export/recompute a `.btn-primary` + variante secundaria** (CryptoSyncPanel.tsx, CryptoModelo100Section.tsx): unifica padding, radio y transición con el resto de la app reutilizando las clases ya existentes en global.css.
3. **Añadir `overflow-x-auto whitespace-nowrap` a la barra de pestañas** (page.tsx:67): elimina el riesgo de overflow en móvil con una sola utilidad Tailwind.

## Top 2 mejoras estructurales

1. **Estado de error consistente en las tres tablas/secciones que hoy fallan en silencio** (Movimientos, Transmisiones, Modelo 100 + AeatGuide): adoptar el patrón `isLoading / isError / isEmpty / data` que ya usa `ChartCard`+`ErrorState`+`EmptyState`, con `refetch()` y claves i18n propias. Es el riesgo más serio del módulo porque oculta fallos en datos fiscales y de movimientos; debería normalizarse a un wrapper de estado de datos reutilizable para todo el módulo.
2. **Accesibilidad de las superficies interactivas de datos**: hacer la fila de Movimientos un control de teclado real con `aria-expanded` (alinearla con la implementación correcta de CryptoDisposalsTable/CryptoAeatGuide) y garantizar que todo dato encerrado solo en tooltips de canvas (precio/coste/P&L del chart) tenga una representación textual navegable por teclado/lector de pantalla — cubriendo el requisito WCAG AA y "keyboard-accessible with visible focus rings" de DESIGN.md.
