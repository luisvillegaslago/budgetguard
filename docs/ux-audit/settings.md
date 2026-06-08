# Auditoría UX/UI — Ajustes (Settings)
> Skills aplicados: critique (jerarquía/IA/resonancia), harden (resiliencia/i18n/overflow), clarify (microcopy/errores/labels), audit (a11y/theming/responsive), polish (alineación/espaciado/consistencia)
> Archivos revisados:
> - src/app/(auth)/settings/page.tsx:22-132
> - src/components/settings/LanguageSelector.tsx:14-53
> - src/components/settings/ThemeSelector.tsx:20-64
> - src/components/settings/CompanyManagementPanel.tsx:31-246
> - src/components/settings/CompanyFormModal.tsx:31-310
> - src/components/settings/CompanyPrefixSection.tsx:20-240
> - src/components/settings/BillingProfileForm.tsx:19-208
> - src/components/settings/FiscalReminderSettings.tsx:27-121
> - src/components/settings/BinanceCredentialsForm.tsx:30-285
> - src/components/settings/DbSyncPanel.tsx:29-489
> - src/schemas/company.ts:13-45 | src/schemas/invoice.ts:12-25 | src/schemas/crypto.ts:17-21
> - src/constants/finance.ts:646-661 (VALIDATION_KEY)
> - src/styles/global.css:85-134,185-189
> - docs/DESIGN.md (tokens/colores)

## Resumen ejecutivo

El módulo Ajustes está funcionalmente completo y bien estructurado (7 secciones por pestañas con estado en URL, estados loading/empty/error razonables y manejo de credenciales Binance con validación previa). Sin embargo arrastra dos defectos transversales que rompen la promesa de calidad: (1) los mensajes de validación de varios formularios se renderizan SIN traducir, mostrando la clave i18n cruda (p. ej. "validation.full-name-required") al usuario; y (2) el formulario de Binance expone los mensajes de error nativos de Zod en inglés técnico ("String must contain at least 50 character(s)"), incumpliendo la i18n obligatoria y la UI en español. Además hay incoherencias de tokens (radius/card), feedback de guardado efímero sin rol ARIA, y un toggle de secreto con literales hardcodeados. Ninguno bloquea el uso, pero varios degradan confianza en una app financiera.

## Hallazgos

### 1. Mensajes de validación se muestran como claves i18n crudas (sin `t()`)
- **Severidad**: 🔴 Crítico
- **Categoría**: Copy / Accesibilidad
- **Ubicación**: src/components/settings/BillingProfileForm.tsx:98,105 · src/components/settings/CompanyFormModal.tsx:149
- **Problema**: Los schemas Zod devuelven claves i18n como mensaje de error (`BillingProfileSchema` usa `VALIDATION_KEY.FULL_NAME_REQUIRED` = `'validation.full-name-required'`, ver src/schemas/invoice.ts:13-14 y src/constants/finance.ts:658-659). En el render se imprime `{errors.fullName.message}` / `{errors.nif.message}` / `{errors.name.message}` directamente, sin pasar por `t()`. Resultado: ante un campo obligatorio vacío el usuario ve literalmente el texto "validation.full-name-required" / "validation.name-required". El patrón correcto del propio proyecto envuelve la clave: `t(errors.description.message ?? '')` (ver src/components/transactions/TransactionGroupForm.tsx:241,263,293).
- **Recomendación**: Envolver siempre el mensaje con el hook de traducción: `{errors.fullName.message && t(errors.fullName.message)}`. Aplicar el mismo patrón en todos los `errors.*.message` de CompanyFormModal y BillingProfileForm para alinearse con TransactionGroupForm.

### 2. Errores de validación de Binance en inglés técnico (Zod por defecto)
- **Severidad**: 🔴 Crítico
- **Categoría**: Copy / Flujo
- **Ubicación**: src/components/settings/BinanceCredentialsForm.tsx:98,123 · src/schemas/crypto.ts:19-20
- **Problema**: `CreateCryptoCredentialSchema` define `apiKey`/`apiSecret` con `.min(50).max(80).regex(...)` SIN mensaje personalizado (`VALIDATION_KEY`). Al renderizar `{errors.apiKey.message}` el usuario ve el mensaje nativo de Zod en inglés y jerga de desarrollador ("String must contain at least 50 character(s)" o "Invalid"), incumpliendo "UI en español" e "i18n obligatoria". En un flujo sensible (conectar exchange) esto genera desconfianza y no explica qué se espera (clave API de 64 caracteres alfanuméricos).
- **Recomendación**: Añadir claves `VALIDATION_KEY` a cada regla del schema crypto (longitud y formato) y renderizar con `t(errors.apiKey.message)`. Microcopy sugerido: "La clave API debe tener 64 caracteres alfanuméricos, sin espacios". Crear las claves en `es.json` y `en.json`.

### 3. Toggle de visibilidad del secreto con literales hardcodeados y semántica pobre
- **Severidad**: 🟠 Alto
- **Categoría**: Accesibilidad / Copy
- **Ubicación**: src/components/settings/BinanceCredentialsForm.tsx:114-121
- **Problema**: El botón mostrar/ocultar el API secret usa texto crudo `{showSecret ? '••••' : 'abc'}` (no traducido, no semántico) y carece de `aria-label`. Un lector de pantalla anuncia "abc" o "bullet bullet", sin indicar la acción ("mostrar/ocultar secreto"). El resto del módulo usa iconografía Lucide (`Eye`/`EyeOff` ya se usan en CompanyManagementPanel.tsx:226-230), aquí se rompe la consistencia visual del sistema.
- **Recomendación**: Reemplazar por iconos `Eye`/`EyeOff` de Lucide con `aria-label={t('settings.crypto.fields.toggle-secret')}` (además del `aria-pressed` ya presente), reutilizando el patrón de CompanyManagementPanel.

### 4. Feedback de "guardado correcto" efímero, sin región ARIA-live
- **Severidad**: 🟠 Alto
- **Categoría**: Accesibilidad / Flujo
- **Ubicación**: src/components/settings/BillingProfileForm.tsx:189 · src/components/settings/FiscalReminderSettings.tsx:114-116 · src/components/settings/BinanceCredentialsForm.tsx:131
- **Problema**: Tras guardar, el éxito se muestra como un `<p className="text-guard-success">` que depende de `mutation.isSuccess`. No tiene `role="status"`/`aria-live="polite"`, por lo que un usuario con lector de pantalla no recibe confirmación de que el guardado se completó (los errores sí usan `role="alert"` en otras partes, p. ej. CompanyFormModal.tsx:148,275). Además el mensaje persiste indefinidamente y vuelve a guardar requiere ensuciar el form de nuevo: la retroalimentación es inconsistente con el resto de la app que usa toasts.
- **Recomendación**: Envolver los mensajes de éxito en `role="status" aria-live="polite"` y, preferiblemente, unificar el feedback de guardado en el sistema de toasts que ya usa el proyecto, o auto-ocultar tras unos segundos. El color verde, según DESIGN.md, debe acompañarse de indicador secundario (icono Check) — añadir `CheckCircle2` para no depender solo del color.

### 5. Confirmaciones destructivas inconsistentes: `window.confirm` y modal propio en vez de `ConfirmDialog`
- **Severidad**: 🟠 Alto
- **Categoría**: Usabilidad / Visual
- **Ubicación**: src/components/settings/BinanceCredentialsForm.tsx:54-57 (`window.confirm`) · src/components/settings/DbSyncPanel.tsx:435-489 (`ConfirmModal` ad-hoc)
- **Problema**: Hay tres patrones distintos de confirmación en el mismo módulo: (a) `window.confirm()` nativo para desconectar Binance (rompe estética premium fintech, no traducible más allá del string, no estilable, no respeta dark mode); (b) un `ConfirmModal` reimplementado a mano en DbSyncPanel con backdrop propio y `biome-ignore` de a11y; (c) un prompt inline en CompanyPrefixSection.tsx:135-163. El proyecto ya tiene `ConfirmDialog` en `src/components/ui/`. Esta fragmentación viola el principio "Consistent restraint" de DESIGN.md.
- **Recomendación**: Sustituir `window.confirm` y el `ConfirmModal` ad-hoc por el componente reutilizable `ConfirmDialog` de `src/components/ui/`, que ya maneja foco, teclado (Esc) y ARIA correctamente. Desconectar un exchange es destructivo: merece un diálogo estilado con botón en tono danger.

### 6. Sección "Database/Sync" sin estado vacío inicial ni guía
- **Severidad**: 🟡 Medio
- **Categoría**: Usabilidad / Onboarding
- **Ubicación**: src/components/settings/DbSyncPanel.tsx:43-46,78-120
- **Problema**: Al montar se limpia el caché de comparación (líneas 43-46), de modo que la primera vista solo muestra el botón "Comparar" sin ninguna explicación de qué hace la herramienta ni del riesgo de un backup unidireccional primary→backup. Para una operación potencialmente peligrosa, falta una nota introductoria/onboarding antes de la primera comparación. La pista de dirección (`backup-direction-hint`, línea 170) solo aparece tras detectar diferencias.
- **Recomendación**: Mostrar siempre (no solo tras comparar) un bloque introductorio breve explicando "copia primary → backup, una dirección" y la naturaleza dev-only. Reutilizar el patrón de card informativa `bg-muted/50 border` ya presente en línea 169.

### 7. URLs de base de datos expuestas en texto plano
- **Severidad**: 🟡 Medio
- **Categoría**: Visual / Usabilidad (privacidad)
- **Ubicación**: src/components/settings/DbSyncPanel.tsx:94-99
- **Problema**: Se renderizan `compareResult.primaryUrl` y `compareResult.backupUrl` sin truncado ni `OverflowTooltip`. Una cadena de conexión Neon larga puede desbordar el header en pantallas estrechas y muestra info sensible (host/credenciales si la URL las incluye) directamente en la UI. Aunque es dev-only, el overflow rompe el layout flex de la cabecera.
- **Recomendación**: Truncar con `truncate max-w-[...]` + `OverflowTooltip` (componente ya disponible en `src/components/ui/`), y enmascarar credenciales en la URL antes de mostrarla.

### 8. Incoherencia de radius/card vs tokens de DESIGN.md
- **Severidad**: 🟡 Medio
- **Categoría**: Visual
- **Ubicación**: src/styles/global.css:106-107 (`.card` usa `rounded-xl`) · src/components/settings/BillingProfileForm.tsx:87 · src/components/settings/BinanceCredentialsForm.tsx:64
- **Problema**: DESIGN.md fija `--radius: 0.625rem (10px)` como radio base. La utilidad `.card` usa `rounded-xl` (12px) y, además, BillingProfileForm y BinanceCredentialsForm NO usan la clase `.card` sino que repiten a mano `bg-card rounded-xl border border-border p-6`. Conviven `rounded-lg`, `rounded-xl` y duplicación de la definición de card en el mismo módulo, debilitando la "restricción consistente" del sistema.
- **Recomendación**: Usar siempre la utilidad `.card` (como hacen ThemeSelector/LanguageSelector/FiscalReminderSettings) en BillingProfileForm y BinanceCredentialsForm, y alinear el radio del sistema con el token `--radius` declarado en DESIGN.md.

### 9. Tabla de Sync no responsive (overflow horizontal en móvil)
- **Severidad**: 🟡 Medio
- **Categoría**: Responsive
- **Ubicación**: src/components/settings/DbSyncPanel.tsx:124-154
- **Problema**: La tabla de diff tiene 6 columnas (`<table className="w-full text-sm">`) dentro de un contenedor `rounded-lg overflow-hidden` SIN scroll horizontal. En viewports estrechos las columnas numéricas se comprimen o el contenido se corta sin posibilidad de desplazamiento. Es dev-only, pero el módulo se navega también en tablet según DESIGN.md.
- **Recomendación**: Envolver la tabla en un contenedor `overflow-x-auto` para permitir scroll horizontal en pantallas pequeñas, manteniendo `overflow-hidden` solo para el redondeo del borde exterior.

### 10. Pestañas de sección sin semántica ARIA de tabs ni navegación por teclado
- **Severidad**: 🟡 Medio
- **Categoría**: Accesibilidad
- **Ubicación**: src/app/(auth)/settings/page.tsx:85-105 · src/components/settings/CompanyManagementPanel.tsx:96-121
- **Problema**: Las barras de pestañas son `<button>` sueltos sin `role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls`, ni paneles con `role="tabpanel"`. Un usuario de lector de pantalla no percibe que es un conjunto de pestañas ni cuál está activa (más allá del color, que DESIGN.md exige reforzar). Tampoco hay navegación con flechas entre pestañas (patrón WAI-ARIA tabs).
- **Recomendación**: Aplicar el patrón ARIA de tabs (`role="tablist"`, `aria-selected`, `tabpanel` con `aria-labelledby`). Como mínimo añadir `aria-current="page"` en la pestaña activa para no depender solo del color indigo.

### 11. Modal de empresa: campo numérico de comisión sin validación de signo ni mensaje
- **Severidad**: 🟢 Bajo
- **Categoría**: Usabilidad
- **Ubicación**: src/components/settings/CompanyFormModal.tsx:64-69,257-268
- **Problema**: La comisión bancaria se gestiona fuera de RHF en estado local `bankFeeEuros`. En `onSubmit` un valor no numérico o negativo se convierte silenciosamente a `null` (línea 68) sin avisar al usuario de que su entrada se descartó. Acepta comas y puntos (línea 65) pero el `<input type="number">` con `placeholder="0,00"` puede no aceptar coma según el locale del navegador, generando confusión entre el placeholder y lo que el control admite.
- **Recomendación**: Mostrar un mensaje de validación si el valor introducido no es válido en lugar de descartarlo en silencio, y alinear el separador decimal del placeholder con lo que el control acepta (o usar un input controlado de texto con máscara, como ya se hace para parsear con `replace(',', '.')`).

### 12. Mezcla de spinners: `LoadingSpinner` vs `Loader2` y skeletons ad-hoc
- **Severidad**: 🟢 Bajo
- **Categoría**: Visual
- **Ubicación**: CompanyFormModal.tsx:294 (`LoadingSpinner`) · CompanyPrefixSection.tsx:152,188 (`Loader2`) · BillingProfileForm.tsx:83,197 (`animate-pulse` + `Loader2`) · BinanceCredentialsForm.tsx:60,139
- **Problema**: Conviven tres mecanismos de carga: el componente `LoadingSpinner` del design system, el icono `Loader2` de Lucide girando, y skeletons `h-48 bg-muted/50 animate-pulse` definidos a mano. La altura del skeleton (`h-48`) no coincide con el alto real del formulario, produciendo un salto de layout al cargar.
- **Recomendación**: Estandarizar en `LoadingSpinner` para spinners y, si se usan skeletons, ajustarlos a la altura real del contenido para evitar layout shift (CLS). Centralizar el patrón de skeleton en `src/components/ui/`.

### 13. Selector de idioma/tema usa `text-white` fijo sobre primario (riesgo de contraste/dark)
- **Severidad**: 🟢 Bajo
- **Categoría**: Accesibilidad / Visual
- **Ubicación**: src/components/settings/LanguageSelector.tsx:44 · src/components/settings/ThemeSelector.tsx:53
- **Problema**: El estado activo usa `bg-guard-primary text-white`. Es aceptable con indigo #4F46E5 (contraste >4.5:1), pero hardcodear `text-white` en vez de un token (`text-primary-foreground`) puede romperse si se ajusta el primario. Menor, pero rompe la consistencia de tokens del sistema.
- **Recomendación**: Usar el token de foreground del primario (p. ej. `text-primary-foreground`) en lugar de `text-white` literal, para mantener coherencia y robustez ante cambios de tema.

## Top 3 quick wins (alto impacto / bajo esfuerzo)
1. Envolver TODOS los `errors.*.message` con `t()` en BillingProfileForm y CompanyFormModal (hallazgo 1) — corrige claves crudas visibles al usuario con un cambio de una línea por campo, siguiendo el patrón ya usado en TransactionGroupForm.
2. Reemplazar el toggle `{showSecret ? '••••' : 'abc'}` por iconos `Eye`/`EyeOff` con `aria-label` (hallazgo 3) — consistencia inmediata con el resto del módulo.
3. Añadir `role="status" aria-live="polite"` + icono `CheckCircle2` a los mensajes de "guardado" (hallazgo 4) — accesibilidad y refuerzo del color con indicador secundario que pide DESIGN.md.

## Top 2 mejoras estructurales
1. Unificar el feedback y las confirmaciones del módulo: reemplazar `window.confirm` y el `ConfirmModal` ad-hoc de DbSyncPanel por el `ConfirmDialog` reutilizable, y migrar los avisos de éxito/error de guardado al sistema de toasts del proyecto (hallazgos 4 y 5). Elimina tres patrones divergentes y profesionaliza el flujo de operaciones sensibles (Binance, sync DB).
2. Internacionalizar la capa de validación del módulo crypto añadiendo `VALIDATION_KEY` a `src/schemas/crypto.ts` con sus claves en es/en, y estandarizar el render de errores de formulario en todo Settings vía un helper común que siempre pase por `t()` (hallazgos 1 y 2). Garantiza la promesa de i18n obligatoria y UI en español de forma sistemática, no campo a campo.
