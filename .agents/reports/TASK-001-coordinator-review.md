# TASK-001 — Coordinator Verification Review

**Reviewed:** 2026-09-22  
**Source audit:** `.agents/reports/TASK-001-mobile-ux-audit-report.md`  
**Verification target:** `main` (commit `d1aeddb34a043fc9f46d1930538967d8c3ecbd3e`)

## Result

The specialist audit is useful and mostly grounded in the repository. The coordinator independently checked the reported locations against the current `main` implementation.

### Confirmed findings

| Specialist priority | Finding | Coordinator result | Notes |
|---|---|---|---|
| P1 | Purchase review dialog has no focus trap / initial focus / restore focus | **CONFIRMED** | `purchaseReviewModal()` emits `role="dialog" aria-modal="true"`; `openPurchaseReview()` only changes state/renders; global keyboard handling only handles Escape and the search shortcut. No focus capture/trap/restore exists. |
| P1 | Overlay background scrolling is not explicitly locked | **CONFIRMED — implementation gap** | `.purchase-overlay` and `.security-overlay` are fixed overlays, but there is no body/app scroll-lock state or `overflow:hidden` mechanism. Actual gesture behavior should be device-tested, but the missing lock is real. |
| P2 | Mobile typography contains very small text | **CONFIRMED — readability concern** | Several status/table/navigation/kicker rules are 8–10px. The exact usability impact is device-dependent, but the CSS sizing is real. |
| P2 | Narrow tables require horizontal scrolling | **CONFIRMED** | `.table-panel` is `overflow:auto` and global `table` has `min-width:850px`. This affects order history and admin tables on narrow viewports. |
| P2 | Category chips use horizontal overflow without an explicit affordance | **PARTIALLY CONFIRMED** | `.category-scroll` is horizontally scrollable. The absence of an edge/fade affordance is a UX observation rather than a broken behavior. |
| P2 | Purchase → wallet loses selected service/server | **CONFIRMED** | `[data-purchase-wallet]` calls `resetPurchaseFlow()` before navigating to `wallet`; no return-state is stored. |
| P2 | Activation polling is sequential | **CONFIRMED** | `tick()` iterates active activations with a sequential `for...of` + `await api(...)`. With many activations this increases sync latency and can create unnecessary network/battery work. |
| P3 | Slash shortcut is globally active outside text inputs | **CONFIRMED** | Global keydown handler focuses `#service-search` whenever `event.key === '/'` and the active element is not INPUT/TEXTAREA. |
| P3 | Auth card has no short-height/landscape-specific layout | **CONFIRMED — polish opportunity** | `.auth-shell` remains vertically centered with `place-items:center`; no short-height or landscape override exists. |

### Not confirmed as a current defect

| Specialist priority | Finding | Coordinator result | Reason |
|---|---|---|---|
| P1 | `expiresAt` may be an ISO string causing `NaN` in `activeCard()` | **NOT CONFIRMED on current code path** | `api/_lib/activation-repository.js` maps DB timestamps with `new Date(...).getTime()`, so the persistent API returns numeric `expiresAt`. The local mock path also creates `expiresAt` as a numeric millisecond timestamp. A defensive normalizer is still reasonable, but this is not presently evidenced as a production bug. |

### Additional finding

**P1 accessibility — security modal has the same focus-management gap.**

`securityModal()` also emits `role="dialog" aria-modal="true"` without initial focus, focus trapping, or focus restoration. This should be handled by the same reusable dialog-focus utility used for the purchase modal.

### Polling nuance

The specialist's sequential-polling finding is valid. There is also a possible overlap edge case: `lastActivationSync` is updated before the sequential network loop completes. If a sync takes longer than 2.5 seconds, the 1-second interval can start another sync before the previous one has finished. This deserves a regression test before changing the polling strategy.

## Coordinator decision

TASK-001 should become an implementation task focused first on:

1. Reusable accessible dialog behavior for purchase + security modals.
2. Explicit overlay scroll locking with correct restoration for nested/active overlays.
3. Purchase-to-wallet return-state preservation.
4. Activation polling redesign plus overlap regression coverage.
5. Mobile table/readability improvements.
6. Lower-priority category affordance, shortcut, and auth-layout polish.

The `expiresAt` item should be treated as defensive hardening rather than a confirmed P1 defect unless a separate API contract demonstrates a string-valued response.

## Scope discipline

No application code was changed by this verification review. This file records validation only.
