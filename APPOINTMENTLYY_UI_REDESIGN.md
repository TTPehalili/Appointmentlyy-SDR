# Appointmentlyy App: UI Redesign and Admin Logic Spec
**For:** Antigravity IDE (agent build brief) · **Pairs with:** `APPOINTMENTLYY_BRAND_GUIDE.md` (tokens, colors, type)
**Goal:** turn the current tool-heavy UI into a calm, enterprise-grade, rep-first product. It should feel like Linear crossed with Attio, wearing Appointmentlyy's ink and crimson. A non-technical SDR should find any action in **two clicks or less**.

---

## 0. How to use this file (Antigravity instructions)
1. Read this file **and** the brand guide end to end before you edit anything.
2. Build in the **phases in §11**, in order. Finish each phase's acceptance checks before you start the next.
3. **Don't change business logic or APIs** unless a section says to. This is a shell, IA and presentation refactor. Keep every feature; only move and restyle it.
4. Put every color, radius, shadow and font in tokens (`globals.css` plus the Tailwind config). **Zero raw hex in components.**
5. When something is ambiguous, pick the simpler option and leave a `// DESIGN-NOTE:` comment.

---

## 1. What's wrong today (fix list)

| # | Problem (seen in the current screens) | Fix |
|---|---|---|
| 1 | The brand repeats in both the sidebar and the top bar ("Apex Global Outbound Cloud" twice, plus a domain pill and a clock) | One workspace switcher at the top-left of the sidebar. Strip the top bar down to search, help, notifications and profile. |
| 2 | 19 flat sidebar items in two long lists, with no hierarchy | **9 rep items in 3 groups.** All management moves into **one Admin area** (§3). |
| 3 | Tenant context is scattered: the top-bar tenant dropdown, a "Super Admin Mode" bar in the ICP builder, and a workspace selector in Custom Domains | One tenant switcher plus one impersonation banner. Pages never carry their own tenant selector. |
| 4 | Every page invents its own header (giant two-line titles, red eyebrows, black hero bars) | One `PageHeader` component everywhere (§5.2). |
| 5 | Many primary-looking buttons per page (black, green, red, blue) | **One brand action per screen.** Everything else is secondary, outline or ghost. |
| 6 | ALL CAPS monospace labels everywhere, emoji in folder names, pill badges on everything | Sentence case in Inter. Mono only for numbers and IDs. Lucide icons. Badges only for status. |
| 7 | Mixed accent colors (LinkedIn blue, purple, green, red) | Ink plus crimson, and semantic colors only where they carry meaning. |
| 8 | A floating purple AI orb covers content on every page | Replace it with a docked **AI Copilot panel** (⌘J) in the right rail and the top bar. |
| 9 | Duplicates: Upload Playbook vs Admin › Playbook Ingestion; Performance vs Operations Intel; Support Tickets with two desks; the Job Signals Radar tab sitting inside Admin | Merge them (§3.3). |
| 10 | Jargon on rep screens (ARM, TTP, "<180ms", "Ingress") | Plain labels, with jargon behind tooltips or on admin screens only. |
| 11 | Inconsistent content widths (some centered at 1280, some full width) | Standard page templates (§5.3). |
| 12 | The sidebar is a dark slate (#2F3E4E-ish) that isn't a brand color | Light sidebar on the canvas color, with an ink active state and a crimson indicator. |

---

## 2. Design principles (the "feel")
1. **Quiet chrome, loud work.** Navigation, headers and filters recede (ink-500, thin borders). The lead, the script and the number the rep needs stand out.
2. **One decision per screen.** Every screen answers "what do I do next?" with a single crimson button.
3. **Progressive disclosure.** Show the 20 % of controls used 80 % of the time. Put the rest in a `⋯` menu, a drawer or "Advanced".
4. **Same pattern, everywhere.** Lists, filters, detail drawers and empty states behave identically in every module.
5. **Speed is a feature.** Use the ⌘K command palette, keyboard shortcuts on the dialer, optimistic updates, and skeletons instead of spinners.
6. **Creative where it counts.** The dialer teleprompter, the Practice arena and the dashboards may use dark focus surfaces, lime AI highlights and subtle motion. Admin and settings stay strictly utilitarian.

---

## 3. Information architecture (new)

### 3.1 Tenancy model (build this mental model into the UI)
```
Platform (Appointmentlyy, Super Admin)
 └─ Agency (white-label reseller, optional layer)
     └─ Workspace (a client org / BPO, e.g. "Taskus floor")
         └─ Team (pod)
             └─ User (role: Org Admin · Manager · Rep)
```
- The **workspace** is the unit users log into. All data (contacts, pipeline, calls) is scoped to it.
- **Agencies** own many workspaces and their own branding and domain.
- **Super Admin** sees the Platform Console and can "View as" any workspace.

### 3.2 Roles and what they see

| Area | Rep | Manager | Org Admin | Agency Admin | Super Admin |
|---|---|---|---|---|---|
| Work nav (Home → Reports) | ✓ | ✓ | ✓ | ✓ (inside a workspace) | ✓ |
| Team nav (Live floor, Coaching) | – | ✓ | ✓ | ✓ | ✓ |
| Admin › Workspace settings | – | Read-only for some sections | ✓ | ✓ | ✓ |
| Admin › Agency (clients, white-label, billing) | – | – | – | ✓ | ✓ |
| Platform Console | – | – | – | – | ✓ |

Hide nav items the role can't use. **Don't** show disabled ones. Enforce access on the server too; the UI just mirrors it.

### 3.3 Sidebar (rep-first, 3 groups plus a footer)
```
[ Workspace switcher ▾ ]     ← logo + workspace name; agency/platform entries inside

  Home                        (new) Today: my queue, callbacks due, meetings, tasks
  Dialer                      ← Calling Floor
  Inbox                       ← Unified Inbox (+ compose drawer)

PROSPECT
  Contacts                    ← Global Contacts (tabs: All · Lists)
  Pipeline                    ← Pipeline
  Lead Finder                 ← ICP List Builder (+ Job Signals tab, feature-flagged)
  Outreach                    ← Cold Email Studio + LinkedIn Studio (tabs: Email · LinkedIn)

IMPROVE
  Practice                    ← Sparring Arena
  Reports                     ← Performance

TEAM            (Manager+)
  Live floor                  ← Floor Monitor
  Coaching                    ← sparring scores, call reviews (new view over existing data)

──────────
  Help                        ← Playbooks & Guide (opens a help center; the guide becomes onboarding checklists)
  Admin                       ← gear icon; Org Admin+ only
  [Avatar  Name / role]       ← profile, theme, sign out
```
Group labels: 11 px, sentence case, `ink-500`. Collapsible to a 64 px icon rail (`[` shortcut). Active item: `ink-100` background, `ink-900` text, a 2 px crimson bar on the left.

### 3.4 Admin, one place for all management
Admin opens a **settings shell**: its own left sub-nav (240 px) plus a content area of at most 880 px. The main sidebar stays visible and collapses to icons. Every old management tool maps in like this:

| Admin section | Pages | Moved from |
|---|---|---|
| **Workspace** | General · Members & seats · Teams · Roles & permissions | People & Seats |
| **Sales setup** | Playbooks (upload + AI ingestion, one page) · Call outcomes · Pipeline stages · Buyer personas (Practice) · Training modules | Upload Playbook, Playbook Ingestion & AI, Call Dispositions, Training Modules, Pipeline "Edit stages" |
| **Data** | Lead credits & quota · Import / export · Do-not-call & compliance · Field mapping | ICP quota widgets ("Tap Up Quota", "Credit 2,000 records"), DNC, CRM Mapper |
| **Automation** | Workflows (list + canvas) · Cadences | Workflow Studio |
| **Integrations** | Connected apps (CRM, Gmail/Outlook, Calendly, Resend, telephony) · Webhooks · API keys · MCP server · AI providers (BYOK) | Universal CRM, MCP & Ingress, BYOK AI Vault |
| **Branding & domains** | Brand (logo, color, name) · Custom domain · Email sending domain (DKIM/SPF) | Custom Domains (white-label) |
| **Billing** | Plan · Usage · Invoices | Billing & Invoicing |
| **Support** | My tickets / New ticket | Support Tickets (customer desk) |
| **Audit log** | All admin and data actions | (new; required for enterprise) |

**Platform Console** (Super Admin only, reached from the workspace switcher → "Platform Console"; a separate shell with a dark ink sidebar so the context is unmistakable):
Tenants & agencies · Plans & entitlements · Support desk (the admin side of tickets, triage queue) · Operations intel · Job signals radar · Master keys and system health · Feature flags.

**Rule:** a page never mixes rep work with configuration. Example: the "Edit & Add Stages" button on Pipeline becomes a `⋯ → Edit stages` item that deep-links to Admin › Sales setup › Pipeline stages.

### 3.5 Tenant switching and impersonation
- **Switcher** (sidebar top): search the list of workspaces, show recents first, then a divider, then "Agency: Apex Global" and "Platform Console" (role-gated), then "+ New workspace".
- **When a Super or Agency Admin views a client workspace:** show a 32 px banner across the top of the app on `ink-950`: `Viewing Taskus floor as Super Admin · Read-only ▾ · Exit`. It can't be dismissed.
- **Remove** every per-page tenant selector (the ICP builder bar, the Custom Domains selector, the Admin "All tenants" dropdown). Cross-tenant views exist only inside the Platform Console.

---

## 4. App shell

```
┌──────────┬──────────────────────────────────────────────┬─────────┐
│ Sidebar  │ Top bar (56px): ⌘K search · ? · 🔔 · ✦ AI      │         │
│ 240/64px ├──────────────────────────────────────────────┤ Copilot │
│          │ PageHeader                                   │ (360px, │
│          │ Content (template per §5.3)                  │ toggle) │
└──────────┴──────────────────────────────────────────────┴─────────┘
```
- **Top bar:** remove the brand, the domain pill, the clock and the tenant dropdown. Keep the global search (⌘K: jump to a lead, a page or an action), Help, Notifications and the AI Copilot toggle. A local-time clock appears only on the Dialer, next to the lead's local time, where it's useful.
- **Copilot panel:** it's context-aware (on the Dialer it offers rebuttals, in the Inbox reply drafts, on Contacts enrichment). It replaces the floating orb and pushes content over instead of covering it.
- **Mobile (<768 px):** the sidebar becomes a bottom tab bar (Home, Dialer, Inbox, Contacts, More). The Copilot becomes a bottom sheet. Tables become card lists.

---

## 5. Component system

### 5.1 Build or normalize these primitives (shadcn/ui + Radix is fine, restyled with tokens)
`Button` (brand · primary(ink) · secondary(outline) · ghost · danger-outline; sizes sm 32 / md 36 / lg 44) · `IconButton` · `Input` / `Select` / `Combobox` · `Tabs` (underline style) · `SegmentedControl` · `Badge` (status only: neutral / success / warning / danger / brand) · `Avatar` · `Card` · `StatTile` · `DataTable` · `FilterBar` · `Drawer` (480 px right) · `Dialog` · `CommandPalette` · `Toast` · `EmptyState` · `Skeleton` · `Stepper` · `Kbd`.

### 5.2 `PageHeader` (identical on every page)
```
[Title h1]  [optional count badge]                  [secondary actions] [ONE primary]
[One-line description in text-secondary, max 80 chars]
[Tabs, if the page has sub-views]
```
No eyebrow labels, no hero bars, no icon tiles before titles.

### 5.3 Page templates (every screen uses one)
| Template | Layout | Used by |
|---|---|---|
| **List** | PageHeader → FilterBar (search + max 3 filters + "More filters") → DataTable → row click opens a Drawer | Contacts, Workflows, Tickets, Members |
| **Board** | PageHeader → FilterBar → horizontal columns (280 px) | Pipeline |
| **Workspace (split)** | Left main (flex) + right context rail (360 px) | Dialer, Inbox, Outreach editor |
| **Dashboard** | PageHeader with a date-range segment → KPI row (max 5) → 2-column charts → table | Home, Reports, Live floor |
| **Settings** | Admin sub-nav + form sections (label left 240 px, controls right), sticky save bar when dirty | All Admin |
| **Canvas** | Full-bleed, minimal floating toolbars | Workflow editor |
| **Wizard** | Centered 720 px, Stepper, one question per step | Lead Finder, onboarding, domain setup |

### 5.4 Tables
48 px rows (40 px compact toggle) · header 12 px sentence-case `ink-500` on `ink-100` · checkbox column only when bulk actions exist · a bulk action bar slides up from the bottom when rows are selected · row actions show on hover, max 2 icons plus `⋯` · deal values right-aligned in tabular numerals · status shown as a dot plus a label (no dropdown-looking pills; editing opens a menu on click).

### 5.5 Motion
150 ms ease-out for hovers and menus, 220 ms for drawers. Live indicators get a soft pulse. Use `prefers-reduced-motion` everywhere.

---

## 6. Screen-by-screen direction

### Home (new): the rep's first screen
- A greeting line plus **"Start calling"** (the brand button) that resumes the queue.
- Four stat tiles: Calls today / goal · Connects · Meetings booked / weekly target · Practice score.
- "Due now" list: callbacks and replies needing an answer, each with an inline action (Call / Reply).
- "Today's meetings" with join links. Coming-up tasks from cadences.

### Dialer (Calling Floor): the hero screen
- **Top lead strip** (one row): avatar, name, title @ company, local time, a LinkedIn icon, and email and phone as copyable mono text. The **Call button is the only crimson element**. Prev and Next are icon buttons with the shortcut keys J and K.
- **Left (main):** script stepper (Opener · Problem · Solution · Close) as a segmented control, then a **dark teleprompter card** (ink-950, `prompter` type, the active line underlined in lime) with objection chips above it. Clicking a chip swaps the prompter text, and the chips scroll horizontally on overflow. Qualify buttons go below it.
- **Right rail tabs:** Notes · Activity · CRM summary. Notes autosave (no "Save Note" button). Show the CRM summary as readable fields with a "Copy for CRM" button, not a raw log textarea.
- **Outcome bar** sticks to the bottom: Booked · Callback · Voicemail · No answer · Referral · Not interested, with keys 1 to 6. Choosing **Booked** opens the inline scheduler, and every outcome advances to the next lead automatically (with undo).
- "Edit playbook" moves to `⋯` and links to Admin.

### Pipeline
- Board template. Columns show a name, count and value in the header, then cards.
- **Card (compact):** name, title, company, value, owner avatar, and day-in-cadence as a small `Day 3`. Remove the per-card Dial, Email, Next Stage and owner dropdown buttons. Move cards by drag-and-drop, or with a hover `⋯` menu holding Call, Email, Move to…, Reassign.
- Add a toggle between board and table view, and a summary strip (Total pipeline · Meetings · Weighted value) as plain stats, not boxed tiles.

### Contacts
- List template. Columns: Name + title · Company · Status · Owner · Last touch · Value.
- The "Lead assignment console" becomes the bulk action bar (Assign to…, Split evenly across reps, Add to list, Export).
- The status filter chip row collapses into one Status filter showing counts.
- Clicking a row opens a **Contact drawer** (profile, timeline, notes, Call / Email actions).

### Lead Finder (ICP List Builder)
- Wizard: **1 Describe** (the AI prompt box is the hero, with blueprint templates as cards below) → **2 Preview** (match count and sample rows at no cost) → **3 Save & assign** (list name, split to reps).
- Quota shows as one slim meter in the header ("1,760 of 2,000 this week"). All credit and top-up controls move to Admin › Data, with a "Get more" link.
- The LinkedIn enrich input moves to a `⋯ → Enrich a profile` dialog.

### Outreach (Email + LinkedIn)
- **Email:** a split editor. Left: To, Subject, Body in a clean writing surface. Right rail: live checks (word count, spam words, reading grade) as a quiet checklist, plus AI angles. Collapse the "Deliverability radar" into a single "Send window: Tue to Thu, 8:15 to 10:00" hint with a popover.
- Send is the brand button. Preview is a toggle, not a separate mode.
- **LinkedIn:** the same split layout. Left is the post editor, right is the series and episode planner. Drop the faux-LinkedIn chrome (fake reaction counts) and use a clean preview card instead.

### Inbox
- Three panes: thread list (360 px) · conversation · contact context (collapsible).
- Show messages as clean threaded mail (no dark "sent" bubbles); quoted text is collapsed.
- Reply box at the bottom with Copilot chips (Book demo, Pricing, Handle objection). "Ingest reply" and "Sync" sit under `⋯`.

### Practice (Sparring Arena)
- Persona gallery: 3-column cards with name, role, company type, difficulty and the core objection quote. Clicking a card starts the call; remove the 10 identical black buttons.
- Filters: difficulty segment plus a "Voice and accent" settings popover (it no longer lives in the header).
- **In-call view:** a dark focus surface with the persona, a waveform and a transcript. The right rail shows live objectives as checkboxes and suggested lines highlighted in lime. End the call with a scorecard (A/R/M explained in plain words).

### Reports (Performance)
- Dashboard template, with a date-range segment (Today · Week · Month · Quarter · Custom) and Export under `⋯`.
- KPIs: Meetings booked vs target · Outreach · Connect rate · Not interested · Follow-ups due. **DNC belongs in Admin › Data**, not in a rep KPI.
- One chart area with a metric selector (not 4 tabs and 3 view toggles), then a rep leaderboard table.

### Live floor (Manager): was Floor Monitor
- A grid of live call cards: rep, buyer, timer, sentiment dot, the A·R·M progress as 3 steps, and **Listen** (secondary) and **Whisper** (brand).
- Move the accent and demo controls into a filter popover. Header tiles shrink to one stat line: "4 live · 1 hostile · 2 skeptical · 1 engaged".

### Admin › Workflows
- List template. Folders render as normal rows with a folder icon (no colored folder squares, no emoji). Breadcrumb navigation.
- The canvas follows the Canvas template: a floating toolbar, a node palette on the left, and a node config drawer on the right. Nodes are 240 px cards (icon + title + one-line summary), with ink-300 connectors that turn crimson on hover or select.

### Admin › Branding & domains (white-label)
- A three-step card list: **Brand** (name, logo upload, color picker with a live contrast check) → **Domain** (enter the subdomain, then a DNS table with copy buttons and live status badges: Pending / Verified / Error) → **Email domain** (DKIM/SPF, same pattern).
- A live preview panel on the right shows the tenant's sidebar and a button with their color.
- "Hide Powered by Appointmentlyy" is a toggle, gated by plan.

### Support
- Workspace users get Admin › Support: a ticket list plus "New ticket" (a dialog).
- The Super Admin triage desk lives in the Platform Console only.

---

## 7. White-label implementation (logic)
1. **Resolve the tenant from the hostname** at the edge or in middleware: `custom domain → workspace/agency id → theme config`. Fall back to the default Appointmentlyy theme.
2. **Theme config schema:**
```ts
type TenantTheme = {
  name: string;               // "Apex Outbound"
  logoUrl: string; markUrl: string; faviconUrl: string;
  brand500: string;           // tenant primary
  supportEmail: string;
  hidePoweredBy: boolean;     // plan-gated
  emailFromDomain?: string;
};
```
3. **Apply it at boot** by injecting the `--brand-*` CSS variables on `<html>` server-side (no flash). Derive `--brand-600`, `--brand-700` and `--brand-50` with `color-mix()` or at save time, and compute `--brand-contrast` (white or ink-900) from the WCAG luminance. Reject brand colors that can't reach 3:1 for UI glyphs.
4. **Only the `--brand-*` tokens are overridable.** Neutrals, semantic colors, type and layout stay locked, so every tenant still looks enterprise-grade.
5. Tenant name, logo and support email are swapped into the title, emails, PDFs and the login page. Our name appears only in the "Powered by" footer.

---

## 8. Permissions logic (UI side)
- Have one `can(user, action, resource)` helper and a `<Gate permission="admin.billing">` wrapper.
- The nav config is data-driven: `{ id, label, icon, href, group, permission, featureFlag }`. The sidebar filters it.
- Route guards redirect to a friendly "You don't have access. Ask your admin" page with a "Request access" button.

---

## 9. Empty, loading and error states
- **Empty:** one line of art (Lucide icon at 32 px, ink-300), a one-sentence headline, one action. Example: "No leads yet. Build your first list".
- **Loading:** skeletons that match the layout. Never use a full-page spinner.
- **Error:** inline, human-readable, with a retry. Toasts are for confirmations ("Booked with Adam · Undo").

---

## 10. Accessibility and quality bar
WCAG 2.2 AA · keyboard reachable everywhere · visible focus ring · 44 px touch targets on mobile · `aria-live` for call status and timers · the tab order follows the visual order · it works at 200 % zoom · dark mode via `[data-theme="dark"]` (tokens already defined).

---

## 11. Build phases (do in order)

| Phase | Scope | Done when |
|---|---|---|
| **1. Foundations** | Tokens from the brand guide, Inter + mono fonts, primitives (§5.1), `PageHeader`, page templates | Storybook or a `/design` route shows every component in light and dark with zero raw hex |
| **2. Shell and IA** | New sidebar config (§3.3), workspace switcher, impersonation banner, slim top bar, ⌘K palette, Copilot panel, mobile tab bar; old routes redirect to new ones | Every old URL resolves; nav filters by role; the floating orb is gone |
| **3. Admin consolidation** | Admin settings shell, the §3.4 mapping, Platform Console, removal of per-page tenant selectors | Zero management tools left in the main sidebar; each one reachable in Admin within 2 clicks |
| **4. Rep screens** | Home, Dialer, Inbox, Contacts, Pipeline (§6) | A rep completes call → outcome → next lead with the keyboard only |
| **5. Prospect and improve** | Lead Finder wizard, Outreach, Practice, Reports, Live floor | Each screen has exactly one brand action |
| **6. White-label and polish** | Theme resolution (§7), branding page with preview, empty/loading/error states, a11y pass | Swapping a tenant color re-themes the app with no layout or contrast regressions |

### Global acceptance checklist
- [ ] The sidebar holds at most 9 work items plus Team (role-gated), Help and Admin
- [ ] No page has more than one crimson (brand) button
- [ ] No ALL CAPS mono labels, emoji or em dashes in the UI
- [ ] Every page uses `PageHeader` plus one template from §5.3
- [ ] No tenant selector outside the switcher or the Platform Console
- [ ] Lighthouse a11y ≥ 95 on Home, Dialer, Contacts and Admin
- [ ] Responsive at 375 / 768 / 1280 / 1920

---

## 12. Paste-ready kickoff prompt for Antigravity
> You are refactoring the Appointmentlyy outbound SaaS frontend. Read `APPOINTMENTLYY_UI_REDESIGN.md` and `APPOINTMENTLYY_BRAND_GUIDE.md` fully. Execute **Phase 1** only: implement the design tokens as CSS variables and Tailwind theme, load Inter and JetBrains Mono, and build or restyle the primitives in §5.1 plus `PageHeader` and the page templates in §5.3. Add a `/design` route that renders every component in light and dark. Do not change APIs or business logic. Use tokens only, never raw hex. When done, list the files changed and show screenshots of `/design`, then stop and wait for review before Phase 2.

Then repeat the same prompt for each next phase ("Execute Phase 2 …").
