# Appointmentlyy Brand Guide
Version 1.0, November 2026. This is the single source of truth for color, type, voice and UI tokens. It applies to the product app, the marketing site, decks and email.

> **Source of truth:** the colors below were read from the live stylesheet at appointmentlyy.com (its `:root` CSS variables and computed styles) on 6 Nov 2026. Two values were derived for accessibility and are marked **(derived)**. The logo red was sampled from the logo PNG, so check it against the original logo file before you print anything.

---

## 1. Brand essence

| | |
|---|---|
| **What we are** | The AI + human SDR loop for BPO floors: enrichment, outreach, live objection coaching and booked meetings in one cockpit. |
| **Promise** | *Fill high-ticket seats. Zero broker dependency.* |
| **Personality** | Confident, precise, calm under pressure. A senior operator, not a hype machine. |
| **Visual idea** | *Ink and Crimson.* Mostly warm paper and ink, with one decisive crimson action per screen. |

---

## 2. Color

### 2.1 Core palette

| Token | Hex | Role | Source |
|---|---|---|---|
| `crimson-500` | **#FF0943** | Signature brand color: hero CTA on dark backgrounds, logo moments, charts, focus glow | Site CTA "Test our AI" |
| `crimson-600` | **#D90036** | Crimson buttons and links on light backgrounds (white text passes AA at 5.25:1) | **(derived)** |
| `crimson-700` | **#B3002C** | Hover and pressed state for crimson | **(derived)** |
| `crimson-50` | **#FFF1F3** | Tint for selected rows and soft brand backgrounds | **(derived)** |
| `logo-red` | **≈ #EB1C24** | Logo plate only. Never used in UI. | Sampled from the logo PNG |
| `ink-950` | **#0C0A09** | Dark surfaces (hero, dark mode background, teleprompter) | Site |
| `ink-900` | **#1C1917** | Primary text and the default primary button | Site |
| `ink-800` | **#292524** | Dark cards, dark-mode raised surfaces | Site |
| `ink-700` | **#44403B** | Strong secondary text, icons | Site |
| `ink-600` | **#57534D** | Secondary text (7.2:1 on canvas) | Site `--text-secondary`≈ |
| `ink-500` | **#79716B** | Tertiary text and meta labels (≥4.5:1 on white and canvas) | Site |
| `ink-400` | **#A6A09B** | Placeholder and disabled text **only** (fails AA for body text) | Site |
| `ink-300` | **#D6D3D1** | Strong borders, input borders | Site |
| `ink-200` | **#E7E5E4** | Default borders and dividers | Site `--border-subtle` |
| `ink-100` | **#F5F5F4** | Hover backgrounds, table header background | Site |
| `canvas` | **#FAF9F5** | App and page background (warm paper) | Site `--bg-canvas` |
| `surface` | **#FFFFFF** | Cards, panels, modals | Site `--bg-card` |

### 2.2 Accent and semantic colors

| Token | Hex | Use | Never |
|---|---|---|---|
| `emerald-700` | **#0E744A** | Success text, "Booked", "Closed Won", positive deltas (5.8:1) | As a primary button color |
| `emerald-500` | **#00BC7D** | Success dots, chart series, live indicators | For small text on white |
| `emerald-50` | **#ECFDF5** | Success badge background | |
| `lime-400` | **#D2F843** | AI highlight: the "AI suggested" marker, the active teleprompter line. Text on it is always `ink-900`. | Large fills, buttons |
| `amber-400` | **#FFB900** | Warning dots and backgrounds; text on it is always `ink-900` | Text on white |
| `amber-700` | **#B45309** | Warning text | |
| `danger-700` | **#B91C1C** | Destructive text and outline buttons (always paired with an icon and a confirmation) | Filled buttons next to crimson |
| `info` | use `ink-700` | Neutral notices | A separate blue (keeps the palette tight) |

> **Why danger isn't crimson:** crimson means "go, act now". Destructive actions use `danger-700` in an **outline** style plus a confirmation step, so a rep never confuses "Call" with "Delete".

### 2.3 Color ratio, the 80/15/5 rule
- **80 %** canvas, surface and borders
- **15 %** ink (text, icons, the default dark button)
- **≤ 5 %** crimson, plus semantic colors only where they carry meaning

**One crimson action per screen.** It goes on the thing the user came to do: *Call* on the dialer, *Save* in an editor, *Book* in the scheduler. Every other button is ink, outline or ghost.

### 2.4 Dark surfaces
Use dark (`ink-950` / `ink-800`) only for **focus zones**: the call teleprompter, the AI composer, and marketing heroes. Never use it for whole navigation chrome in the light theme.
- Text on dark: `#FAFAF9` primary, `#A6A09B` secondary (7.6:1)
- Crimson on dark: `#FF0943` (5.0:1, fine for text and buttons)

### 2.5 Data visualization order
`ink-900` → `crimson-500` → `emerald-500` → `ink-400` → `amber-400` → `#9810FA` (violet, the site's 6th color, for overflow only). Targets and quotas use dashed `ink-300`.

---

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| UI and marketing | **Inter** (variable), with fallback `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | The site already uses the system stack. Inter gives the same feel and stays consistent on every OS. |
| Numeric and technical | **JetBrains Mono** or `ui-monospace` | **Only** for phone numbers, IDs, DNS records, API keys and code. Never for labels or headings. |

Turn on tabular numerals (`font-feature-settings: "tnum"`) for every table, KPI and timer.

### Type scale (app)

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 30 / 36 | 700, tracking -0.02em | Marketing hero, empty-state headlines |
| `h1` | 24 / 32 | 650 | Page title (one per page) |
| `h2` | 18 / 28 | 600 | Section title |
| `h3` | 15 / 22 | 600 | Card title |
| `body` | 14 / 20 | 400 | Default |
| `body-strong` | 14 / 20 | 550 | Names, values |
| `small` | 13 / 18 | 400 | Meta, helper text |
| `caption` | 12 / 16 | 500 | Badges, table headers (sentence case, **not** ALL CAPS mono) |
| `kpi` | 28 / 32 | 650, tnum | Dashboard numbers |
| `prompter` | 20 / 32 | 450 | Live call script (readable at arm's length) |

**Rules:** use sentence case everywhere. Never put ALL CAPS on more than two words. Never use em dashes in product copy (this matches your outreach standard).

---

## 4. Logo

- **Primary lockup:** the white wordmark "Appointmentlyy" on the red plate, plus the square "7" mark.
- **App mark:** the square "7" mark alone, used for the favicon, the collapsed sidebar and mobile.
- **Clear space:** the height of the "7" mark on every side.
- **Minimum size:** 96 px wide for the wordmark, 20 px for the mark.
- **Don't:** recolor the plate to crimson-500, add shadows or gradients, put it on busy imagery, stretch it, or rebuild it as a text "AG" or "A" avatar badge.
- **White-label:** tenant logos replace ours in the app chrome. Our mark appears only in the "Powered by Appointmentlyy" footer, and tenants can hide that.

---

## 5. Shape, space and depth

| Token | Value |
|---|---|
| Spacing grid | 4 px (`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`) |
| `radius-sm` | 6 px (inputs, badges, small buttons) |
| `radius-md` | 8 px (buttons, menus) |
| `radius-lg` | 12 px (cards, panels) |
| `radius-xl` | 16 px (modals, drawers) |
| `radius-full` | Pills: avatars, status dots, filter chips, and marketing CTAs |
| `shadow-xs` | `0 1px 2px rgba(12,10,9,.05)` (cards at rest) |
| `shadow-md` | `0 4px 16px rgba(12,10,9,.08)` (menus, popovers) |
| `shadow-lg` | `0 16px 48px rgba(12,10,9,.14)` (modals, command palette) |
| Borders | 1 px `ink-200`; inputs `ink-300`; focus ring `0 0 0 3px rgba(255,9,67,.22)` plus a `crimson-600` border |

Depth comes from **borders first, shadows second**. Never use more than one shadow level inside a card.

---

## 6. Iconography and imagery

- **Icons:** Lucide, 1.5 px stroke, 16 px in UI and 20 px in nav. Icons are monochrome `ink-700` and turn crimson only when active or primary.
- **No emoji** in the product UI: not in folder names, buttons or labels.
- **Imagery:** real product UI, or abstract crimson-on-ink geometry (the site's "shader" hero). No stock handshakes.
- **Avatars:** initials on `ink-100` with `ink-700` text, or a real photo. No colored letter blobs.

---

## 7. Voice and microcopy

| Do | Don't |
|---|---|
| "Call Adam" | "Initiate Outbound Dial Sequence" |
| "Booked" | "BOOKED ✅🔥" |
| "12 callbacks due today" | "WARM CALLBACK QUEUE: 12" |
| "Practice with an AI buyer" | "Voice Simulation Arena Dojo" |
| "Couldn't send. Gmail disconnected. Reconnect" | "Error 4012: ingress failure" |

- Write verbs on buttons and nouns in nav.
- Use plain words for non-technical reps. Save jargon (ARM, TTP, MCP, BYOK) for admin screens, and give each one a tooltip.
- Numbers beat adjectives: "<150 ms", "35 meetings per seat per month".

---

## 8. Design tokens (copy-paste)

### CSS variables
```css
:root {
  /* brand (white-label overridable) */
  --brand-500: #FF0943;
  --brand-600: #D90036;
  --brand-700: #B3002C;
  --brand-50:  #FFF1F3;
  --brand-contrast: #FFFFFF;

  /* neutrals */
  --ink-950:#0C0A09; --ink-900:#1C1917; --ink-800:#292524; --ink-700:#44403B;
  --ink-600:#57534D; --ink-500:#79716B; --ink-400:#A6A09B; --ink-300:#D6D3D1;
  --ink-200:#E7E5E4; --ink-100:#F5F5F4;
  --canvas:#FAF9F5; --surface:#FFFFFF;

  /* semantic */
  --success-700:#0E744A; --success-500:#00BC7D; --success-50:#ECFDF5;
  --warning-700:#B45309; --warning-400:#FFB900; --warning-50:#FFFBEB;
  --danger-700:#B91C1C;  --danger-50:#FEF2F2;
  --ai-highlight:#D2F843;

  /* roles (components use THESE, never raw hex) */
  --bg-app: var(--canvas);
  --bg-surface: var(--surface);
  --bg-subtle: var(--ink-100);
  --bg-inverse: var(--ink-950);
  --text-primary: var(--ink-900);
  --text-secondary: var(--ink-600);
  --text-tertiary: var(--ink-500);
  --text-disabled: var(--ink-400);
  --border-default: var(--ink-200);
  --border-strong: var(--ink-300);
  --action-primary: var(--ink-900);       /* default primary button */
  --action-brand: var(--brand-600);       /* the ONE hero action per screen */
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--brand-500) 22%, transparent);

  --radius-sm:6px; --radius-md:8px; --radius-lg:12px; --radius-xl:16px;
  --font-sans: "Inter", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}

[data-theme="dark"] {
  --bg-app:#0C0A09; --bg-surface:#1C1917; --bg-subtle:#292524;
  --text-primary:#FAFAF9; --text-secondary:#A6A09B; --text-tertiary:#79716B;
  --border-default:#292524; --border-strong:#44403B;
  --action-primary:#FAFAF9; --action-brand: var(--brand-500);
}
```

### Tailwind (v3 `theme.extend` / v4 `@theme`)
```js
colors: {
  brand: { 50:'var(--brand-50)', 500:'var(--brand-500)', 600:'var(--brand-600)', 700:'var(--brand-700)' },
  ink:   { 100:'#F5F5F4',200:'#E7E5E4',300:'#D6D3D1',400:'#A6A09B',500:'#79716B',
           600:'#57534D',700:'#44403B',800:'#292524',900:'#1C1917',950:'#0C0A09' },
  canvas:'#FAF9F5',
  success:{ 50:'#ECFDF5',500:'#00BC7D',700:'#0E744A' },
  warning:{ 50:'#FFFBEB',400:'#FFB900',700:'#B45309' },
  danger: { 50:'#FEF2F2',700:'#B91C1C' },
  ai:'#D2F843',
},
borderRadius: { sm:'6px', md:'8px', lg:'12px', xl:'16px' },
fontFamily: { sans:['Inter','-apple-system','Segoe UI','Roboto','sans-serif'], mono:['JetBrains Mono','ui-monospace','monospace'] },
```

---

## 9. Accessibility minimums
- Text contrast is at least 4.5:1, and large text or UI glyphs at least 3:1. White on `#FF0943` is only **3.9:1**, so crimson **buttons** on light backgrounds use `crimson-600`.
- Never use color alone: every status has a label and/or an icon.
- Focus rings are always visible. Hit targets are at least 36 px on desktop and 44 px on touch.
- Respect `prefers-reduced-motion`.

---

## 10. Quick checklist before anything ships
- [ ] Only one crimson action is visible
- [ ] No raw hex in components; tokens only
- [ ] No emoji, no ALL CAPS mono labels, no em dashes
- [ ] Mono font used only for numbers, IDs and code
- [ ] Every status has text plus color
- [ ] Looks right with a tenant's brand color swapped in
