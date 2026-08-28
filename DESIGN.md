---
name: "MemeTrace"
description: "A legible forensic daylight desk where real coins lead, provenance stays visible, and research depth opens only when requested."
register: "product"
updated: "2026-08-28"
---

# Interface rules

This file is required design memory for every future interface change.

## Core rule

**Minimal composition, rich execution.**

MemeTrace should feel like a careful case file, not a dashboard template or crypto casino. Real coin rows and evidence lead. Remove navigation, panels, labels, and effects until each remaining element changes a research decision; then finish it with precise spacing, data formatting, focus, empty states, and responsive behavior.

## Use scene

A beginner or analyst uses MemeTrace mainly on a laptop in daylight, deliberately comparing very fast-moving launches, then checks one report on a phone. The interface needs a light canvas, high contrast, calm density, large targets, and no motion or copy that creates urgency.

## Exactly three screens

| Screen | Primary task | Leading content |
|---|---|---|
| **Coins** | Explore live coins | Real coin table, refresh state, filters, source coverage, and exact-mint lookup |
| **Coin report** | Understand this coin | Exact identity, reference clock/cutoff, observations, engineered features, outcomes, model state, and provenance |
| **Data & methods** | Audit the research | Source states and rights, collection coverage, feature/label/model definitions, releases, and terminology |

Use a small three-destination header. Do not add a sidebar, Research Lab screen, Live Shadow mode, top-level feature tabs, or a second navigation menu inside each screen.

The screen task is always the clearest heading: **Explore live coins**, **Understand this coin**, or **Audit the research**. “Explore” is intentional until discovery covers a complete launch denominator; brand copy, source badges, scores, and technical concepts never outrank it.

## Information hierarchy

### Coins

1. Task heading, feed state, automatic-refresh control, and manual refresh.
2. One compact toolbar for name/ticker/mint filter, lifecycle stage, and column family.
3. Real rows keyed by exact mint. Identity, age, and stage remain fixed while market, flow, or research columns change.
4. Row action to open the coin report.
5. A concise coverage strip naming discovery sources, bounded-scan counts, storage state, partial warnings, and the exact checked time.
6. Exact-mint lookup as a secondary path, not the only way into the product.

Do not lead with methodology, a score, provider cards, a synthetic fixture, or a large empty search form.

### Coin report

1. Token image fallback, name, ticker, exact mint, lifecycle stage, data mode, and as-of time.
2. Reference-clock and cutoff controls with an explicit decision time.
3. A truth notice that states whether the report uses canonical, indexed, reconstructed, current-only, partial, or unavailable evidence.
4. A concise answer: what was observed, what was calculated, whether an outcome has matured, and whether a trained model exists.
5. Separate opportunity, integrity risk, tradability, and evidence-quality rows; unavailable remains visible.
6. Progressive disclosures for lifecycle/flow, liquidity/execution, ownership/creator, coordination/wash clues, narrative/attention, market regime, provenance, formulas, and limitations.
7. Hindsight outcomes only after a visible boundary. Model output only after its artifact/version and validation state are named.

### Data & methods

1. Current collection, model-readiness, alert-delivery, and automatic-trading summary.
2. Source ledger with exact interface, status, credential, coverage, rights, and limitations.
3. Point-in-time feature, executable-label, and chronological-validation contracts.
4. Release notes.
5. Searchable terminology appendix.

## Typography

- Use Geist when available, then the native system sans stack. Use Geist Mono/native mono only for mints, timestamps, endpoint names, versions, and compact values.
- Use no more than four text sizes on one screen: 13px metadata, 15–16px body/control, 20–24px section heading, and 32–40px task heading.
- Use no more than three weights: 400, 550/600, and 700.
- Body line-height is at least 1.5. Reading columns stay near 65–75 characters.
- Do not use all caps for sentences. Numbers use tabular figures where comparison matters.

## Colour

| Token | Value | Use |
|---|---|---|
| Canvas | `oklch(0.965 0.012 82)` | Warm page background |
| Paper | `oklch(0.989 0.006 82)` | Primary task and reading surface |
| Raised | `oklch(0.997 0.003 82)` | Focused result, menu, or sticky table heading only |
| Line | `oklch(0.82 0.018 76)` | Real boundaries, table rules, and input edges |
| Graphite | `oklch(0.225 0.018 67)` | Primary text |
| Muted graphite | `oklch(0.41 0.021 67)` | Secondary text; never weakened with opacity |
| Teal | `oklch(0.43 0.09 196)` | Links, focus, selected state, and one primary action |
| Green | `oklch(0.43 0.11 151)` | Favorable evidence with a text label |
| Amber | `oklch(0.54 0.12 76)` | Incomplete evidence or caution with a text label |
| Rust | `oklch(0.48 0.15 38)` | Integrity concern or error with a text label |
| Blue | `oklch(0.45 0.105 252)` | Reconstructed/indexed evidence with a fidelity label |

- Colour never carries meaning alone.
- Ordinary chrome uses graphite and teal. Evidence colours appear only when they encode evidence.
- No neon, gradient text, glass, decorative glow, low-opacity body text, or colour wash behind every section.
- Focus uses a visible teal outline with sufficient offset.

## Layout

- Main width: `min(1280px, calc(100% - 32px))` on desktop; 20px gutters at tablet; 16px at phone.
- Reading width: 720px maximum for method and glossary prose.
- Spacing follows a restrained 4, 8, 12, 16, 24, 32, 48, 64px rhythm.
- Primary radius: 12px. Pills are for statuses and segmented controls only.
- Prefer whitespace before lines, lines before surfaces, and surfaces before nested cards.
- One surface contains one interaction or evidence group. Do not put every number in a card.
- The coin table scrolls inside a labelled region at narrow widths; the page itself must not overflow horizontally.
- At 768px, compact or stack toolbars without changing reading order. At 390px and 320px, keep identity/actions visible and permit deliberate table scrolling.

## Core components

### Three-screen navigation

- Three text destinations only: Coins, Coin report, Data & methods.
- Use current-page semantics and a restrained text state, not a floating dock.
- If no coin is selected, Coin report shows a clear selection-required state and a route back to Coins. It must not silently open a demo.

### Live coin table

- Include a caption that explains the rows are returned by active discovery sources and that missing values are not zero.
- Every row is keyed by the full mint even when the visible mint is shortened. Show the full value through an accessible title, copy action, or report.
- Keep name, ticker, age, lifecycle stage, and open action stable across column-family switches.
- Preserve a visible loading row/region, source error state, no-match state, partial-coverage warning, and last-updated time without changing table geometry excessively.
- Token images are untrusted: reserve dimensions, lazy-load, decode asynchronously, suppress referrer data, and provide a deterministic text fallback.
- Do not animate prices, resort rows under the pointer, or hide unavailable fields.

### Feed controls

- Use native labelled fields and buttons. Automatic refresh is an explicit user-controlled state; manual refresh remains available.
- Filters act locally and immediately after data arrives. They do not imply that the source queried by ticker or stage.
- Keep touch targets at least 44×44px where practical and maintain a logical keyboard order: refresh, query, stage, column family, then rows.

### Reference-clock and cutoff selection

- Use familiar segmented buttons with a visible selected state and `aria-pressed` or equivalent semantics.
- Registered cutoff labels are `30s`, `1m`, `5m`, `15m`, and `1h`.
- When the selected clock lacks a defensible reference time, keep the control visible, mark the report unavailable, and explain why.
- A control change updates the report as one state transition without moving focus.

### Assessment rail

- Four adjacent or stacked rows: Opportunity, Integrity risk, Tradability, Evidence quality.
- Each row shows a value or **Unavailable**, one plain-language meaning, and a disclosure for inputs/calculation.
- Never average these outputs or infer a trade action.

### Evidence disclosure

- Use semantic `<details>`/`<summary>` or an equivalently accessible disclosure.
- Each family states input coverage, observed versus engineered taxonomy, event/availability time, fidelity, and missing reason.
- Long evidence tables work without hover and expose exact values.

### Documentation sections

- Use a compact local section index or native disclosures inside Data & methods, never another product navigation layer.
- Provider rows show status, last check, exact interface, coverage, credential, limitation, and rights.
- Alert status states enabled/configured/threshold separately. It must also say that only validated shadow predictions are eligible and that trading is disabled; do not turn delivery into a fourth screen or a trade control.
- Glossary search uses a standard input and optional category chips. Result counts update without stealing focus.

## Truth-state treatment

| State | Required treatment |
|---|---|
| Canonical | Say which Pump/PumpSwap discriminator matched, plus signature/slot when present |
| Accelerated/indexed | Name the vendor and keep canonical confirmation separate |
| Paid-profile fallback | Label the DEX profile source as partial and selection-biased |
| Current | Show checked time and never imply the value existed at an earlier cutoff |
| Reconstructed | Show the availability-time assumption and fidelity; do not equate it with prospectively captured latency |
| Historical partial | Keep scan bounds, event range, continuation, and missing reasons visible |
| Stored | Say whether D1 wrote, read only, failed, or was unavailable; storage is not a fidelity upgrade |
| Feature unavailable | Keep the feature name and reason; do not substitute zero |
| Outcome pending | State the horizon or coverage has not matured; do not call it a loss |
| Model insufficient | Say **Not trained** or **Insufficient data**, show accepted counts/requirements when known, and do not render a probability |
| Validated prediction | Name the immutable artifact, target, clock/cutoff, interval, and shadow persistence state; never imply an order was placed |
| Alert disabled/unconfigured | State the exact gate and threshold without implying monitoring is running; Telegram delivery is not a data source or trading action |
| Empty | Say whether there were no returned launches or no local filter matches and offer a bounded retry/reset |
| Error | Preserve filters/mint, name the failing layer, and offer retry |
| Loading | Reserve stable space with concise status text; no decorative skeleton wall |

## Words

- Use names, labels, values, states, and actions on task screens. Remove sentences that do not change the next decision.
- Labels use one to three words. Buttons use a verb or destination.
- Use **Tradability** in the interface; define **executability** as the technical synonym.
- Prefer “Evidence suggests” to “This wallet is.” Prefer “Unavailable” to a guessed number.
- Never use “safe,” “guaranteed,” “proven cabal,” “insider” as fact, “easy money,” “buy now,” or fear-of-missing-out copy.
- Put teaching, provenance, formulas, API terms, and legal boundaries in report disclosures or Data & methods.

## Interaction and motion

- Ordinary feedback lasts 150–220ms and uses colour, opacity, or small transforms.
- Do not use autoplay, price-tick animation, parallax, particles, blur reveals, confetti, or ambient motion.
- Reduced Motion removes travel and scale while preserving every state and action.
- Never read layout geometry on every pointer or scroll event.

## Component intake

No external UI runtime is adopted for release 0.4.0. Existing React, semantic HTML, and CSS are sufficient for the real-feed vertical slice. See `docs/UI-DECISIONS.md`.

| Slot | Candidate | Why considered | Signature kept | Dependencies | A11y | Performance | Decision |
|---|---|---|---|---|---|---|---|
| Live feed | Native table / shadcn Table / Beautiful UI records | Dense comparable evidence | Caption, stable identity, explicit states, local filters | None added | Semantic headers and labelled scroll region | Bound API to 100 rows; batch/virtualize richer rows later | **Borrow structure** |
| Feed filters | Native inputs/buttons / shadcn Input and Toggle Group | Familiar query and view switching | Persistent value, pressed state, keyboard order | None added | Native labels and focus | Local filtering only | **Borrow structure** |
| Evidence detail | Native `details` / shadcn or beUI Accordion | Progressive depth | Clear summary and exact content | None added | Native keyboard behavior | No dependency or re-keying | **Borrow structure** |
| Historical charts | Bklit | Time paths, distributions, and ablations | None until real cohort data supports a chart | None added | Table alternative required later | Avoids false/unused payload now | **Defer** |
| Motion | Motion / Transitions.dev | State changes | Brief CSS feedback only | None added | Reduced Motion safe | No animation runtime | **Reject install** |

## Performance evidence and budget

The 0.3.0 production baseline was approximately 139,968 bytes gzip across the comparable client assets (135,076 JavaScript + 4,892 CSS), with a 24,015-byte gzip research-console chunk. A clean 0.4.0 build on 28 August 2026 measured 143,844 bytes gzip (138,117 JavaScript + 5,727 CSS); the research-console chunk measured 26,544 bytes. This is a recorded 3,876-byte gzip (+2.8%) cost for the real feed/report client behavior, not a performance improvement.

- No unexplained build-tool oversized-bundle warning.
- No horizontal page overflow at 320px.
- No layout read on every pointer or scroll event.
- No repeated blur/filter/backdrop/shader work across feed rows.
- Keep API pages at 100 rows or fewer; paginate, batch, or virtualize before mounting hundreds of rich rows.
- Lazy-load feature-only code/data and offscreen token images.
- Test a production build, not only the development server.

## Responsive and accessible behavior

- Verify 1440×900, 768px, 390px, and 320px after interface changes.
- Test keyboard order, visible focus, touch, Reduced Motion, 200% zoom, long mints/names, loading, no results, upstream error, partial coverage, missing features, pending outcome, insufficient model data, and maximum rows.
- No essential interaction depends on hover, drag, colour, or animation.
- Auto-refresh must not steal focus, reset the user's filters, or announce every unchanged polling cycle.

## Explicit exclusions

- No neon-on-black casino styling, flashing ticker, confetti, or FOMO copy.
- No hero score surrounded by generic cards.
- No synthetic coin as the default report.
- No opaque Buy Score, winner-only leaderboard, automatic-trade control, or implication that clustering proves misconduct.
- No external component package without a recorded intake decision and production measurement.

## Acceptance check

1. Are there exactly three top-level screens with one obvious task each?
2. Does the Coins screen lead with real rows and honest feed coverage?
3. Does a report require a selected exact mint and preserve clock/cutoff truth?
4. Are observed inputs, engineered features, hindsight outcomes, and model outputs unmistakable?
5. Do opportunity, integrity risk, tradability, and evidence quality remain separate?
6. Are partial, reconstructed, unavailable, pending, and insufficient-data states explicit?
7. Does every visible word, line, surface, and colour explain a real decision or state?
8. Does the interface work with keyboard, touch, 200% zoom, and Reduced Motion?
9. Does it avoid false completeness, model performance, profitability, and execution claims?
10. Do tests, type-checking, linting, production build, and browser checks pass?
