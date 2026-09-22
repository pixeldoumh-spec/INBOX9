# TASK-001 — Mobile UX + Browser Behavior Audit Report

**Date:** 2026-09-22 14:47 IST  
**Branch audited:** `agent-collaboration/protocol-v1`  
**Repo:** `pixeldoumh-spec/INBOX9`  
**Auditor:** Specialist agent (external)

## Summary
Completed a repository-based audit of the INBOX9 customer-facing web app covering marketplace/catalog, 832-service rendering, 11-server selection panels, purchase review flow, active numbers, orders/history, wallet/UPI recharge, responsive navigation, dialogs/forms, and loading/error/success states.

### Audit outcome
- No clear **P0 blocking failures** found from repository inspection.
- Found multiple **P1–P3** mobile UX, accessibility, and browser-behavior issues.
- Confirmed several strong existing patterns: mobile drawer navigation, capped catalog rendering, debounced search, `content-visibility:auto`, responsive wallet/recharge layout, and consistent `:focus-visible` styling on interactive elements.

## Prioritized findings

| Priority | Screen/component | Exact problem | Evidence/location | User impact | Recommended fix |
|---|---|---|---|---|---|
| P1 | Purchase review modal | No focus trap / initial focus management in dialog; background remains keyboard reachable | `app.js` → `purchaseReviewModal()`, `openPurchaseReview()`, global `keydown` handler; modal markup uses dialog roles but no focus management | Keyboard and assistive-tech users can tab into background UI while review sheet is open | Move focus into modal on open, trap focus inside, restore focus on close |
| P1 | Active numbers countdown | `expiresAt` is used as if numeric; if API returns ISO string, timer/progress can compute `NaN` | `app.js` → `activeCard(activation)` uses `activation.expiresAt - Date.now()` directly | Timer/progress may break or show incorrect remaining time | Normalize with `Date.parse()` / numeric coercion and guard invalid values |
| P1 | Security / purchase overlays | Background scroll is not locked when overlays are open | `styles.css` → `.security-overlay`, `.purchase-overlay`; `app.js` does not add any body/app scroll lock class | On small phones, users can accidentally scroll underlying page while modal is open | Add `overflow:hidden` lock to body/app shell while overlays are active |
| P2 | Dense small text on mobile | Many important labels/statuses are 8–10px, too small on 320–360px devices | `styles.css` → `.table-status`, `th`, `.nav-label`, `.kicker`, ledger/admin microcopy | Reduced readability and scanability on mobile | Increase key text to ~12–13px for important status/body info |
| P2 | Orders/admin tables on narrow screens | Tables rely on horizontal scrolling due to fixed minimum width | `styles.css` → `table{min-width:850px}` and `.table-panel{overflow:auto}` | Hard to review order/admin data on small devices | Add mobile card layout or reduce visible columns below small breakpoints |
| P2 | Category chip discoverability | Horizontal category scroll has weak affordance; hidden categories may not be obvious | `styles.css` → `.category-scroll{overflow:auto}`; `buyPage()` renders long horizontal chip list | Users may miss categories on 320–390px widths | Add edge fade/overflow affordance or allow wrap on smallest screens |
| P2 | Purchase → wallet transition | “Add funds” from review resets purchase flow and loses selected service/server | `app.js` click handler for `[data-purchase-wallet]` calls `resetPurchaseFlow(); state.page = 'wallet'; render();` | User must re-find service/server after recharge | Preserve selected `serviceId/serverId` and reopen review after recharge/back navigation |
| P2 | Active polling behavior | Polling is sequential per activation every ~2.5s, which may be heavy on slow mobile networks | `app.js` → `tick()` loops `for...of` and awaits each `/api/activations/:id` call | Potential lag, battery/network waste with multiple active numbers | Batch requests or back off polling when active count grows |
| P3 | Slash keyboard shortcut | `/` shortcut focuses search even though mostly desktop-oriented | `app.js` global `keydown` listener | Minor unexpected behavior with hardware keyboards / some IMEs | Enable shortcut only for desktop-like environments |
| P3 | Auth screen short-height behavior | Fully centered auth card may feel cramped with virtual keyboard or landscape short viewport | `styles.css` → `.auth-shell{display:grid;place-items:center}` | Submit button/card can feel crowded on short viewports | Switch to top-aligned layout on short-height or landscape mobile screens |

## Positive findings to preserve

- Marketplace rendering is constrained with `marketVisibleCount` and debounced search.
- Service search index is precomputed in `prepareServiceCatalog()`.
- `.market-service-group` uses `content-visibility:auto`, `contain`, and intrinsic sizing to reduce off-screen work.
- Sidebar becomes a mobile drawer below `780px`.
- Purchase sheet has a dedicated mobile bottom-sheet treatment below `620px`.
- Wallet recharge flow has clear 2-step structure and QR asset is present (`public/upi-qr.jpg`).
- Interactive controls have `:focus-visible` styling in multiple key button classes.

## Evidence base / files reviewed

- `index.html`
- `app.js`
- `styles.css`
- `public/upi-qr.jpg` reference presence verified
- `.agents/tasks/TASK-001-mobile-ux-audit.md`

## Repro / audit notes

This was a code-and-structure audit based on the current repository implementation on `agent-collaboration/protocol-v1`. Findings were limited to behavior supported by the code and CSS. No unrelated code changes were made.

## Recommended implementation order

1. Fix modal focus management and background scroll lock.
2. Harden active countdown against non-numeric `expiresAt`.
3. Improve mobile typography/readability for status/table-heavy views.
4. Reduce mobile friction in tables, category navigation, and purchase-to-wallet return path.
5. Optimize activation polling strategy.
6. Apply low-priority polish to auth layout and desktop-only shortcuts.
