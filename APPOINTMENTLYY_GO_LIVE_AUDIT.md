# Appointmentlyy: Go-Live Production Readiness Audit
**For:** Antigravity IDE (agent audit brief) · **Pairs with:** `APPOINTMENTLYY_UI_REDESIGN.md`, `APPOINTMENTLYY_BRAND_GUIDE.md`
**Goal:** run a full QA, code review, system logic review, UI review and end-to-end security review of the whole repository, then give a **Go / No-Go** verdict with a ranked fix list. The app is a multi-tenant, white-label outbound SaaS (dialer, inbox, outreach, lead finder, AI copilot, integrations, billing), so tenant isolation, auth, billing and compliance matter most.

---

## 0. How to run this audit (agent rules)

1. **Read first, change nothing.** Phases 1 to 9 are **read-only**. Do not edit code, migrations, env files or infrastructure until §11 (Fix phase), and only after the human approves the findings report.
2. Read this file, `APPOINTMENTLYY_UI_REDESIGN.md` and `APPOINTMENTLYY_BRAND_GUIDE.md` end to end before you start.
3. Run the phases **in order** (§12). After each phase, append its findings to `audit/AUDIT_REPORT.md` and stop for review if any **P0** was found.
4. **Evidence for every finding:** file path + line range, a short code excerpt, how to reproduce (command, request or click path), impact, and a concrete fix. No evidence means no finding.
5. **Never guess.** If you can't confirm something (e.g. infra config not in the repo), log it under "Unverified / needs human" with what you need.
6. **Never print secrets.** If you find a secret, report its path and the first 4 characters only, then mark it P0 "rotate".
7. Use the real tooling where possible (tests, linters, type checker, scanners, a local run of the app). Write any scripts you create in `audit/scripts/`, never inside `src/`.
8. Do not run destructive commands (DB drops, `migrate reset`, force-pushes, deleting branches) and never point any test at production data or production third-party accounts.

### Severity scale

| Level | Meaning | Go-live |
|---|---|---|
| **P0 Blocker** | Data leak across tenants, auth bypass, exposed secret, payment/billing error, legal/compliance violation, data loss, app won't build or boot | **Must fix before launch** |
| **P1 Critical** | Broken core user journey, missing authorization on a non-sensitive route, no backups, no error monitoring, major a11y blocker | Must fix before launch |
| **P2 Major** | Bug with a workaround, performance issue, inconsistent UI vs spec, missing tests on critical logic | Fix within 2 weeks of launch |
| **P3 Minor** | Polish, naming, small UI drift, code smell | Backlog |

---

## 1. Phase 1: Discovery and inventory

Produce `audit/01_INVENTORY.md` with:

- **Stack:** framework(s), language versions, package manager, ORM, DB, cache, queue, hosting target, auth provider, payment provider, email provider, telephony provider, AI providers.
- **Repo map:** top-level folders and what they do; monorepo packages if any.
- **Routes:** every page route and every API route / server action / RPC / webhook endpoint, in a table: `path · method · auth required? · roles allowed · tenant-scoped? · handler file`.
- **Data model:** every table/collection, whether it has a tenant key (`workspace_id` / `agency_id` / `org_id`), and its indexes.
- **Background work:** cron jobs, queues, workers, schedulers, and what triggers each.
- **Third parties:** every external API called, where the key lives, and what happens on failure.
- **Env vars:** list every variable read in code (names only), and compare against `.env.example`. Flag any variable used in code but missing from the example, and any `NEXT_PUBLIC_` / `VITE_` / client-exposed variable that holds a secret.
- **Feature flags** and where they're evaluated.

---

## 2. Phase 2: Build, static analysis and dependency health

Run and record output in `audit/02_BUILD.md`:

| Check | Pass criteria |
|---|---|
| Clean install from lockfile (`npm ci` / `pnpm i --frozen-lockfile` / equivalent) | Succeeds, no lockfile drift |
| Production build | Zero errors; list warnings |
| Type check (`tsc --noEmit` or equivalent) | Zero errors; count of `any`, `@ts-ignore`, `@ts-expect-error` |
| Linter | Zero errors; list rules disabled inline |
| Existing test suite | All pass; report coverage overall and for `auth`, `billing`, `tenancy`, `permissions`, `webhooks` |
| Dependency audit (`npm audit --production`, `osv-scanner`, or equivalent) | No high/critical vulns in runtime deps |
| Outdated / abandoned packages | Flag majors behind, packages with no release in 2+ years |
| Licenses | Flag GPL/AGPL/unknown licenses in runtime deps (commercial risk) |
| Dead code | Unused files, exports, routes, components, env vars |
| Bundle size | Per-route JS size; flag any route > 300 KB gzipped first-load |
| `console.log`, `debugger`, `TODO`, `FIXME`, `HACK` | Count and list those in production paths |

---

## 3. Phase 3: End-to-end security review

Write to `audit/03_SECURITY.md`. Map each finding to **OWASP Top 10 (2021)** and **OWASP API Security Top 10 (2023)** categories.

### 3.1 Secrets and configuration
- [ ] Scan the **full git history**, not just HEAD (`gitleaks detect` or `trufflehog git file://.`). Any secret ever committed is P0 "rotate", even if removed later.
- [ ] No secrets in client bundles: build the app and grep the output (`.next/static`, `dist/`) for key patterns (`sk_`, `pk_live`, `AKIA`, `AIza`, `xox`, `ghp_`, `-----BEGIN`, provider names).
- [ ] `.env*` files are git-ignored; `.env.example` has placeholders only.
- [ ] Debug modes, verbose errors, source maps and dev tools are off in production config.
- [ ] Default/admin credentials, seed users and test accounts can't exist in production.

### 3.2 Authentication
- [ ] Every non-public route and API handler checks the session **on the server**. List any handler that doesn't.
- [ ] Middleware matchers don't accidentally skip API routes, server actions, or file routes.
- [ ] Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`, sensible expiry, rotation on login and privilege change, invalidation on logout and password change.
- [ ] JWTs (if used): signature verified, `alg` pinned, `exp` checked, no secrets in payload, revocation strategy exists.
- [ ] Password reset, magic link and invite tokens: single-use, short expiry, high entropy, not logged, not leaked via `Referer`.
- [ ] Login, signup, reset and OTP endpoints are rate-limited and don't reveal whether an email exists.
- [ ] MFA available for admins (required for Super Admin and Agency Admin is strongly recommended).
- [ ] OAuth (Google/Microsoft): `state` and PKCE validated, redirect URIs allow-listed, no open redirect after login (`?next=` / `?returnTo=` validated as same-origin relative paths).

### 3.3 Authorization and RBAC
Check against the role matrix in `APPOINTMENTLYY_UI_REDESIGN.md` §3.2 (Rep · Manager · Org Admin · Agency Admin · Super Admin).
- [ ] One central `can(user, action, resource)` check is used on the **server**. UI hiding alone is not authorization.
- [ ] For every API route in the inventory, try it as each lower role. Record any route where a lower role succeeds (P0 if it touches billing, members, keys, integrations, exports, or other users' data).
- [ ] **Mass assignment:** create/update handlers whitelist fields. A user can't set `role`, `workspace_id`, `agency_id`, `plan`, `credits`, `is_super_admin`, `owner_id` through a request body.
- [ ] Users can't promote themselves or invite someone with a higher role than their own.
- [ ] Super Admin "View as" / impersonation: server-enforced, logged in the audit log with actor + target, read-only by default, and can't be triggered by a client-side flag or header alone.

### 3.4 Multi-tenant isolation (highest priority)
This is the most likely place for a P0 in a multi-tenant SaaS. Be exhaustive.
- [ ] Every query on tenant-owned data filters by tenant id **derived from the session**, never from the request body, query string, path param or header.
- [ ] List every query/ORM call on a tenant table that lacks a tenant filter. Grep for `findUnique`, `findFirst`, `findById`, `.get(`, raw SQL, `where: { id` patterns.
- [ ] **IDOR test:** create two workspaces (A and B) with seed data. As a user in A, request every B resource by id across every endpoint (contacts, deals, calls, recordings, transcripts, emails, lists, workflows, tickets, invoices, files, API keys, webhooks). Every request must return 404/403. Record the full matrix.
- [ ] Agency boundary: an Agency Admin sees only workspaces their agency owns.
- [ ] If the DB supports it, recommend or verify Row-Level Security (e.g. Postgres RLS / Supabase policies). If RLS exists, check that the service-role key is never used in request handlers that act on behalf of a user.
- [ ] Caches (Redis, CDN, `unstable_cache`, React Query keys, SWR keys) include tenant id in the key. No shared cache entry can serve tenant A's data to tenant B.
- [ ] File storage: object paths are tenant-prefixed; signed URLs are short-lived; buckets are not public-listable; recordings and exports are never public.
- [ ] Search indexes, vector stores and AI context retrieval are filtered by tenant.
- [ ] Background jobs carry tenant id explicitly and re-check it; a job can't process another tenant's records.
- [ ] Exports and reports only include the caller's tenant.
- [ ] White-label hostname resolution (§7 of the redesign spec): a custom domain maps to exactly one tenant, and a session from tenant A can't be used on tenant B's domain to read B's data. Cookie domain scoping is correct.

### 3.5 Input handling and injection
- [ ] SQL/NoSQL injection: no string-built queries; raw SQL uses parameters.
- [ ] XSS: no `dangerouslySetInnerHTML` / `v-html` / `innerHTML` with user or AI content unless sanitized (DOMPurify or equivalent). Check email bodies in the Inbox, notes, LinkedIn previews, playbook content, AI output, and tenant brand name/logo fields.
- [ ] Server-side validation on every input (zod/yup/valibot or equivalent), not just client-side.
- [ ] SSRF: any feature that fetches a user-provided URL (webhook targets, LinkedIn enrich, logo URL, playbook import, AI tools, MCP) blocks private IP ranges, `localhost`, link-local and cloud metadata (`169.254.169.254`), and limits redirects.
- [ ] File uploads (logos, playbooks, CSV imports): type checked by content not just extension, size limits, no SVG with script served inline, malware scanning if feasible, stored outside the web root.
- [ ] CSV/Excel export: formula injection escaped (cells starting with `= + - @`).
- [ ] Path traversal, command injection, unsafe deserialization, unsafe regex (ReDoS) on user input.
- [ ] Email header injection in outreach (To/Subject/CC fields).

### 3.6 Webhooks, API keys and MCP
- [ ] **Inbound webhooks** (payments, telephony, email, calendar, CRM): signature verified with the provider's secret using constant-time compare, timestamp tolerance to stop replays, idempotency by event id, raw body used for verification.
- [ ] **Outbound webhooks:** signed (HMAC) so customers can verify, retries with backoff, SSRF-safe, timeouts, and a delivery log per tenant.
- [ ] **Customer API keys:** stored hashed (never plaintext), shown once at creation, scoped to one workspace, scopable by permission, revocable, last-used tracked, rate-limited per key.
- [ ] **MCP server:** authenticated per tenant, every tool call authorized against the caller's role and tenant, tool inputs validated, no tool can read across tenants or run arbitrary code/SQL, and all calls are audit-logged.
- [ ] **BYOK AI vault:** customer keys encrypted at rest (KMS or envelope encryption), never returned to the client after save, never logged, never sent to a provider other than the one they belong to.

### 3.7 AI-specific risks
- [ ] Prompt injection: content from leads, inbound emails, LinkedIn profiles, playbooks and web pages is treated as untrusted. It can't trigger tool calls, send emails, change records or leak system prompts without user confirmation.
- [ ] AI output is never executed, never rendered as raw HTML, and never used to build queries.
- [ ] No other tenant's data is placed in a prompt; no PII is sent to providers beyond what's needed; provider data-retention settings are documented.
- [ ] Per-tenant AI usage limits and cost caps exist, so one tenant can't run up an unbounded bill.

### 3.8 Transport, headers and browser security
- [ ] HTTPS everywhere, HSTS (with `includeSubDomains` once all subdomains are HTTPS).
- [ ] Security headers: `Content-Security-Policy` (no `unsafe-eval`; nonce or hash for inline scripts), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (allow microphone only where the dialer/practice needs it), `frame-ancestors` to stop clickjacking.
- [ ] CORS: no `*` with credentials; allowed origins include only the app and verified tenant custom domains.
- [ ] CSRF protection on cookie-authenticated state-changing requests.
- [ ] Rate limiting and abuse protection on auth, AI endpoints, email sending, SMS/calls, exports, lead credit usage and public forms.

### 3.9 Logging, audit and privacy
- [ ] Logs never contain passwords, tokens, API keys, full card data, call recordings, or full PII bodies. Grep logger calls.
- [ ] An **audit log** exists (required by redesign spec §3.4) and records: logins, role changes, member invites/removals, impersonation, API key create/revoke, integration connect/disconnect, exports, billing changes, data deletion, DNC changes. Entries are append-only and tenant-scoped.
- [ ] Data deletion: a workspace can be deleted/exported on request (GDPR / Philippine Data Privacy Act 2012 / CCPA). Deletion actually removes or anonymizes data in DB, storage, search, caches and third parties.

---

## 4. Phase 4: System logic review

Write to `audit/04_LOGIC.md`. For each area, read the code path end to end and look for wrong results, race conditions and missing edge cases.

### 4.1 Tenancy and onboarding
- [ ] Sign up → create workspace → invite member → accept → role applied: works, and is atomic (no orphan workspace or user on failure).
- [ ] Agency creates a client workspace; ownership and billing attach correctly.
- [ ] Seat limits enforced on invite and on accept (no race that lets two accepts exceed seats).
- [ ] Removing a member revokes sessions and reassigns or keeps their leads/deals per a defined rule.
- [ ] Workspace switching clears client caches and state, so data from the previous workspace never flashes.

### 4.2 Billing and entitlements
- [ ] Plan limits (seats, lead credits, AI usage, white-label, "Hide Powered by") are enforced **server-side** and read from one entitlement source.
- [ ] Payment webhooks drive state (subscription created/updated/canceled, payment failed, invoice paid). The app never trusts the client redirect alone to grant a plan.
- [ ] Webhook handlers are idempotent; replaying the same event twice doesn't double-credit or double-charge.
- [ ] Upgrade, downgrade, proration, trial end, failed payment grace period, and cancellation each produce the right access level.
- [ ] Lead credit deduction is atomic (DB transaction or atomic decrement), can't go negative, and is refunded on failed enrichment if that's the policy.
- [ ] Currency, tax/VAT and invoice numbering are correct for target markets.

### 4.3 Dialer and calling
- [ ] Call state machine (idle → dialing → ringing → connected → wrap-up → next) handles drops, provider errors, double-clicks, browser refresh mid-call, and mic permission denied.
- [ ] Outcome keys 1 to 6 record exactly one outcome per call; auto-advance and undo don't create duplicate activity rows.
- [ ] Lead local time is computed from the lead's timezone; calling-hours rules are enforced (see §4.6).
- [ ] Recordings and transcripts attach to the right call, lead and tenant.
- [ ] Concurrency: two reps can't be served the same lead from a shared queue at the same time.

### 4.4 Pipeline, contacts, inbox, outreach
- [ ] Drag-and-drop stage moves persist, handle concurrent edits, and update counts/values correctly.
- [ ] Bulk assign / split-evenly distributes correctly and handles remainders.
- [ ] Contact dedupe rules on import; CSV import handles bad rows, encodings, huge files and reports errors.
- [ ] Email sending: unsubscribe link and `List-Unsubscribe` header on outreach, bounce and complaint handling suppresses future sends, send windows respect timezone, daily caps per mailbox.
- [ ] Inbox reply ingestion threads to the right contact and doesn't duplicate on re-sync.
- [ ] Cadences/workflows: no infinite loops, a contact who replies or books exits the cadence, paused workflows stop scheduled steps.

### 4.5 Integrations
- [ ] OAuth tokens (Gmail, Outlook, Calendly, CRM) refresh before expiry; a revoked token shows "Reconnect" rather than failing silently.
- [ ] Each third-party call has a timeout, retry with backoff for transient errors only, and a user-readable error.
- [ ] CRM field mapping handles missing/renamed fields and doesn't overwrite data unexpectedly.

### 4.6 Compliance logic (outbound calling and email)
These are legal requirements, so treat gaps as **P0**.
- [ ] DNC: internal DNC list checked **before** every dial and every send; national DNC lists supported where the tenant calls into that market (e.g. US National DNC, UK TPS).
- [ ] TCPA (US) / local equivalents: calling-hours windows by recipient timezone, consent records, and no autodialing to mobile numbers without consent if predictive/auto dial is offered.
- [ ] Call recording consent: one-party vs two-party consent states handled (disclosure prompt or tenant setting).
- [ ] CAN-SPAM / GDPR / PECR for email: physical address, unsubscribe honored within the required window, lawful-basis records for EU contacts.
- [ ] Data retention settings for recordings, transcripts and contacts.

### 4.7 Data integrity
- [ ] Multi-step writes use transactions.
- [ ] Foreign keys and unique constraints exist where the logic assumes them.
- [ ] Soft-deleted records are excluded from every list, count, search and export.
- [ ] Timestamps stored in UTC; displayed in user timezone (default `Asia/Manila` only if the user hasn't set one).

---

## 5. Phase 5: Code quality review

Write to `audit/05_CODE.md`.
- [ ] Architecture: clear separation of UI, server/business logic and data access. Flag business logic inside components, and DB calls inside client components.
- [ ] Duplicated logic (especially permission checks, tenant filters, price/credit calculations) that should be one function.
- [ ] Error handling: no swallowed errors (`catch {}`), no unhandled promise rejections, error boundaries on every top-level route.
- [ ] Types: no `any` on API boundaries; request/response schemas shared between client and server.
- [ ] Naming and file structure consistent; giant files (> 500 lines) and giant components flagged for split.
- [ ] Hard-coded values that belong in config (URLs, limits, prices, provider ids).
- [ ] Test gaps: list the critical functions with no tests (auth, permission helper, tenant scoping, billing webhooks, credit deduction, DNC check, outcome recording).

---

## 6. Phase 6: UI and UX review against the redesign spec

Write to `audit/06_UI.md`. Run the app locally, visit every route as each role, and check against `APPOINTMENTLYY_UI_REDESIGN.md` and `APPOINTMENTLYY_BRAND_GUIDE.md`. Take screenshots at **375, 768, 1280 and 1920 px**, light and dark, into `audit/screenshots/`.

### 6.1 Spec conformance (global acceptance checklist)
- [ ] Sidebar: at most 9 work items in 3 groups, plus Team (role-gated), Help and Admin. Role-forbidden items are **hidden**, not disabled.
- [ ] No page has more than one crimson (brand) button.
- [ ] Every page uses `PageHeader` and one template from spec §5.3.
- [ ] No tenant selector outside the workspace switcher or the Platform Console.
- [ ] Floating AI orb removed; Copilot panel docks and pushes content.
- [ ] Impersonation banner shows whenever an admin views another workspace and can't be dismissed.
- [ ] Every old URL redirects to its new route (no 404s from bookmarks).
- [ ] No management tools left in the main sidebar; each reachable in Admin within 2 clicks.

### 6.2 Brand and token compliance
- [ ] **Zero raw hex in components.** Grep `src/` (excluding the token files) for `#[0-9a-fA-F]{3,8}`, `rgb(`, `hsl(`, and arbitrary Tailwind colors like `bg-[#`. List every hit.
- [ ] No ALL CAPS mono labels, no emoji, no em dashes in UI copy. Grep strings and JSX text.
- [ ] Mono font used only for numbers, IDs, DNS records, keys and code.
- [ ] Crimson buttons on light backgrounds use `brand-600`, not `brand-500`.
- [ ] Danger actions use outline `danger-700` plus a confirmation, never filled red next to crimson.
- [ ] Lucide icons only, 16 px UI / 20 px nav.

### 6.3 States and UX
- [ ] Every list/table/board has an empty state (icon + one sentence + one action), a skeleton loading state, and an inline error with retry. No full-page spinners.
- [ ] Forms: inline validation, disabled submit while saving, no double submit, unsaved-changes warning on Settings pages.
- [ ] Toasts for confirmations with Undo where the spec asks (outcomes, moves, deletes).
- [ ] Copy follows brand voice §7: verbs on buttons, nouns in nav, no jargon on rep screens, human error messages.
- [ ] The two-click rule: a non-technical rep reaches any core action in two clicks or fewer.
- [ ] Mobile (< 768 px): bottom tab bar, Copilot as a bottom sheet, tables become cards, 44 px touch targets, no horizontal scroll.

### 6.4 White-label
- [ ] Swap in three test tenant colors (one light, one dark, one low-contrast). The app re-themes with no flash on first load, buttons stay readable, and low-contrast colors are rejected at save time.
- [ ] Tenant name, logo, favicon and support email replace Appointmentlyy in the title, login page, emails and PDFs.
- [ ] "Powered by Appointmentlyy" hides only on plans that allow it.

---

## 7. Phase 7: Accessibility

Write to `audit/07_A11Y.md`. Target **WCAG 2.2 AA**.
- [ ] Run axe (e.g. `@axe-core/playwright`) on every route; zero serious/critical violations.
- [ ] Lighthouse accessibility ≥ 95 on Home, Dialer, Contacts and Admin.
- [ ] Full keyboard pass of the core journey: log in → Home → Dialer → call → outcome → next lead, with visible focus throughout.
- [ ] Dialogs, drawers and the command palette trap focus and return it on close.
- [ ] `aria-live` for call status, timers and toasts.
- [ ] Color is never the only signal (status = dot + label).
- [ ] Works at 200 % zoom; respects `prefers-reduced-motion`.

---

## 8. Phase 8: Performance, reliability and operations

Write to `audit/08_OPS.md`.

### 8.1 Performance
- [ ] Core Web Vitals on key routes (LCP < 2.5 s, INP < 200 ms, CLS < 0.1) on a throttled mid-range mobile profile.
- [ ] N+1 queries: log queries per request on list pages (contacts, pipeline, inbox, reports).
- [ ] Missing indexes for every tenant-scoped list query (`workspace_id` + sort/filter columns).
- [ ] Pagination on every list endpoint; no unbounded `SELECT *` returning all rows.
- [ ] Load test the hot paths (dialer next-lead, inbox list, contacts list, webhook ingest) at 5× expected launch traffic with k6 or similar against a **staging** environment. Report p95 latency and error rate.

### 8.2 Reliability
- [ ] Error monitoring (Sentry or equivalent) on client and server, with source maps uploaded privately and PII scrubbing on.
- [ ] Structured logs with request id and tenant id (but no PII payloads).
- [ ] Health check endpoint; uptime monitoring and alerting to a real person.
- [ ] Graceful degradation when AI, telephony or email providers are down (clear message, nothing corrupts).
- [ ] Queue jobs are retried with backoff and go to a dead-letter queue after max attempts.

### 8.3 Data safety and deployment
- [ ] Automated DB backups with point-in-time recovery; **a restore has been tested** (record date and result, or mark "needs human").
- [ ] Migrations are reversible or have a written rollback, run in CI against a copy, and don't lock large tables during deploy.
- [ ] Separate dev / staging / production environments, databases and third-party accounts (payments in live mode only in production).
- [ ] CI runs build, type check, lint, tests and the dependency audit on every PR; `main` is protected.
- [ ] A rollback path for a bad deploy is documented and takes under 15 minutes.

---

## 9. Phase 9: QA, end-to-end test plan

Write Playwright (or the repo's existing E2E tool) tests in `audit/e2e/`, run them against a local or staging build with seed data, and record results in `audit/09_QA.md`. Each journey runs for the listed roles, on desktop and on a 375 px mobile viewport.

| # | Journey | Roles |
|---|---|---|
| 1 | Sign up → verify email → create workspace → land on Home | New user |
| 2 | Invite member → accept → correct nav for role | Org Admin → Rep, Manager |
| 3 | Log in / log out / password reset / expired session redirect | All |
| 4 | Dialer: start calling → call → outcome via keys 1 to 6 → auto-advance → undo | Rep |
| 5 | Booked outcome → inline scheduler → meeting appears on Home and Pipeline | Rep |
| 6 | Contacts: import CSV → filter → bulk assign / split → open drawer → call | Manager |
| 7 | Pipeline: drag between stages → board/table toggle → values update | Rep, Manager |
| 8 | Lead Finder wizard: describe → preview → save & assign; credits deduct once | Rep, Org Admin |
| 9 | Outreach email: compose → checks → send; unsubscribe link works; DNC contact blocked | Rep |
| 10 | Inbox: reply arrives → threads correctly → reply with Copilot chip | Rep |
| 11 | Practice: pick persona → in-call → scorecard | Rep |
| 12 | Live floor: Listen / Whisper on a live call | Manager |
| 13 | Admin: change role, edit pipeline stages, call outcomes, playbook upload | Org Admin |
| 14 | Integrations: connect / disconnect Gmail, CRM; create and revoke API key; webhook test delivery | Org Admin |
| 15 | Billing: upgrade → downgrade → failed payment (test card) → access changes correctly | Org Admin |
| 16 | White-label: set brand, color, custom domain (test DNS), hide Powered by (plan-gated) | Agency Admin |
| 17 | Impersonation: Super Admin views workspace → banner → read-only enforced → exit → audit log entry | Super Admin |
| 18 | **Cross-tenant negative tests:** user in A can't see or modify anything in B via UI or API | All |
| 19 | **Role negative tests:** each role can't reach pages/APIs above its level (direct URL + direct API call) | All |
| 20 | Workspace data export and deletion | Org Admin |

Also run exploratory checks: double-click every submit, refresh mid-flow, back button after submit, two tabs editing the same record, slow 3G, offline then online, very long names, Unicode/emoji names, 10,000-row lists.

---

## 10. Phase 10: Commercial readiness

Write to `audit/10_COMMERCIAL.md`. Mark each item present / missing / needs human.
- [ ] Terms of Service, Privacy Policy, Acceptable Use Policy, Cookie notice, and a **Data Processing Agreement** for business customers, linked from signup and the footer.
- [ ] Sub-processor list (hosting, AI providers, telephony, email, payments).
- [ ] Cookie consent where required (EU/UK visitors).
- [ ] Philippine Data Privacy Act: privacy notice, a named Data Protection Officer contact, and NPC registration if thresholds apply. GDPR/CCPA if selling into the EU/US.
- [ ] Transactional email domain authenticated (SPF, DKIM, DMARC) and tested in Gmail and Outlook inboxes.
- [ ] Onboarding: first-run checklist, sample data or guided setup, help center links work.
- [ ] Support channel works end to end (ticket created → reaches the Platform Console desk → reply reaches the customer).
- [ ] Pricing page matches the plans and limits enforced in code.
- [ ] Status page and incident communication plan.
- [ ] SEO/meta for public pages; `robots.txt` blocks app routes; tenant custom domains don't get indexed as duplicates.
- [ ] Favicon, Open Graph images, 404 and 500 pages are branded (and white-labeled on tenant domains).

---

## 11. Fix phase (only after human approval)

1. Wait for the human to approve `audit/AUDIT_REPORT.md`.
2. Fix in order: **P0 → P1**, one finding per commit, message format `fix(audit-<ID>): <short summary>`.
3. Each fix includes a regression test (unit, integration or E2E) that fails before the fix and passes after.
4. Don't refactor unrelated code while fixing. Don't change APIs or business behavior beyond what the finding requires; leave a `// AUDIT-NOTE:` comment where a judgment call was made.
5. After all P0/P1 fixes, re-run Phases 2, 3.4, 7 and 9 and update the report.

---

## 12. Report format and Go / No-Go gate

### `audit/AUDIT_REPORT.md` structure
1. **Verdict:** `GO`, `GO WITH CONDITIONS`, or `NO-GO`, in one line, with the count of open P0/P1/P2/P3.
2. **Executive summary:** 5 to 10 bullets a non-technical founder can read in two minutes.
3. **Scorecard:**

| Area | Score (0–10) | Open P0 | Open P1 | Notes |
|---|---|---|---|---|
| Security | | | | |
| Tenant isolation | | | | |
| Auth & RBAC | | | | |
| Billing & entitlements | | | | |
| Compliance (DNC, TCPA, email, privacy) | | | | |
| System logic | | | | |
| Code quality & tests | | | | |
| UI vs spec & brand | | | | |
| Accessibility | | | | |
| Performance | | | | |
| Reliability & ops | | | | |
| Commercial readiness | | | | |

4. **Findings table:** `ID · Severity · Area · Title · File:line · Status`.
5. **Finding details** (one block each):
```
### SEC-001 · P0 · Tenant isolation
Title: Contacts API returns other workspaces' contacts by id
Where: src/app/api/contacts/[id]/route.ts:14-31
Evidence: <short excerpt>
Reproduce: log in as user in Workspace A, GET /api/contacts/<id from B> → 200 with B's data
Impact: any user can read any tenant's leads (data breach, contract and privacy-law exposure)
Fix: derive workspaceId from session; add `workspaceId` to the where clause; add RLS policy; add E2E test #18
Effort: S / M / L
```
6. **Unverified / needs human:** items the agent couldn't confirm (infra, backups, legal docs, provider settings).
7. **Launch-day checklist:** rotate any exposed keys, switch payments to live, confirm backups, enable monitoring alerts, confirm DNS/SSL for custom domains, smoke-test the 5 most important journeys in production.

### Go / No-Go rules
- **NO-GO** if any P0 is open, or if tenant isolation tests (#18) or role tests (#19) have any failure.
- **GO WITH CONDITIONS** if P0 = 0 and every open P1 has an owner and a fix date within 7 days of launch.
- **GO** if P0 = 0, P1 = 0, all 20 journeys pass, and the global acceptance checklist in the redesign spec passes.

---

## 13. Paste-ready kickoff prompts for Antigravity

**Prompt 1 (start):**
> You are a principal engineer running a pre-launch production readiness audit of the Appointmentlyy SaaS repository. Read `APPOINTMENTLYY_GO_LIVE_AUDIT.md`, `APPOINTMENTLYY_UI_REDESIGN.md` and `APPOINTMENTLYY_BRAND_GUIDE.md` fully. This audit is **read-only** until I approve fixes. Execute **Phase 1 (Discovery and inventory)** and **Phase 2 (Build, static analysis and dependency health)** only. Write `audit/01_INVENTORY.md` and `audit/02_BUILD.md`, start `audit/AUDIT_REPORT.md` using the format in §12, never print secrets, then stop and summarize the top findings for review.

**Prompt 2:**
> Execute **Phase 3 (End-to-end security review)** of `APPOINTMENTLYY_GO_LIVE_AUDIT.md`. Be exhaustive on §3.4 multi-tenant isolation: build the two-workspace IDOR test matrix and run it against a local build with seed data. Write `audit/03_SECURITY.md`, update `AUDIT_REPORT.md`, and stop immediately if you find any P0.

**Prompt 3:**
> Execute **Phases 4 and 5 (System logic and code quality)**. Write `audit/04_LOGIC.md` and `audit/05_CODE.md`, update the report, then stop for review.

**Prompt 4:**
> Execute **Phases 6 and 7 (UI vs spec and accessibility)**. Run the app, capture screenshots at 375 / 768 / 1280 / 1920 in light and dark for each role, run axe and Lighthouse, write `audit/06_UI.md` and `audit/07_A11Y.md`, update the report, then stop.

**Prompt 5:**
> Execute **Phases 8, 9 and 10 (Ops, E2E QA, commercial readiness)**. Write the Playwright journeys in `audit/e2e/`, run them on a local or staging build only (never production), write `audit/08_OPS.md`, `audit/09_QA.md` and `audit/10_COMMERCIAL.md`, then finalize `AUDIT_REPORT.md` with the verdict per §12 and stop.

**Prompt 6 (after approval):**
> I approve the findings. Execute **§11 Fix phase** for all P0 findings first, then P1, one commit per finding with a regression test each. When done, re-run Phases 2, 3.4, 7 and 9, update the verdict, list the commits, and stop.
