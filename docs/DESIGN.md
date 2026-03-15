# Design Context

## Users

- **Primary**: A family (couple) tracking household income and expenses together
- **Usage**: Monthly review sessions from laptop/tablet — replacing Excel
- **Job to be done**: Quickly understand where money went, feel in control

## Brand Personality

- **3 words**: Professional, Confiable (Trustworthy), Limpio (Clean)
- **Tone**: Calm confidence — facts first, judgment-free

## Aesthetic Direction

- **Visual tone**: Premium fintech (Revolut, Wise, Mercury style)
- **Theme**: Dark mode default. Dark navy (`#0F172A`) shell with light cards
- **Typography**: Inter | **Icons**: Lucide
- **Color language**: Indigo = action, Emerald = income, Rose = expense (always with secondary indicators, never color alone)

## Brand Colors

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| guard-dark | `#0F172A` | `--guard-dark` | Backgrounds, Sidebar |
| guard-primary | `#4F46E5` | `--guard-primary` | Buttons, Actions (Indigo) |
| guard-success | `#10B981` | `--guard-success` | Income, Positive (Emerald) |
| guard-danger | `#EF4444` | `--guard-danger` | Expenses, Alerts (Rose) |
| guard-muted | `#64748B` | `--guard-muted` | Secondary text (Slate) |
| guard-light | `#F8FAFC` | `--guard-light` | Card backgrounds |

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `0.625rem` (10px) | Base border radius |
| Transition | `200ms ease-out` | Interactive state changes |
| Shadow | `sm` → `md` on hover | Restrained elevation |
| Container | `max-w-7xl` (1280px) | Page width |
| Spacing | `p-6` cards, `gap-4`/`gap-8` grids | |

## Accessibility

- WCAG AA baseline with color blindness consideration
- Income/expense must have secondary indicators beyond color
- All text meets AA contrast (4.5:1 normal, 3:1 large)
- Animations respect `prefers-reduced-motion`
- Keyboard-accessible with visible focus rings

## Design Principles

1. **Data first, decoration never** — every pixel serves financial data
2. **Calm confidence over urgent alarms** — neutral presentation
3. **Instant clarity** — financial position within 2 seconds
4. **Respectful efficiency** — minimize clicks and cognitive load
5. **Consistent restraint** — design system has an opinion and sticks to it
