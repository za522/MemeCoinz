---
name: "MemeTrace"
description: "A legible forensic daylight desk with warm paper, graphite type, restrained evidence colour, and progressively disclosed research depth."
register: "product"
updated: "2026-08-28"
---

# Interface rules

This file is required design memory for every future interface change.

## Core rule

**Minimal composition, rich execution.**

MemeTrace should feel like a careful case file, not a dashboard template or crypto casino. Remove navigation, surfaces, labels, and effects until only the current task and its evidence remain. Finish those few elements with precise spacing, typography, focus, empty states, data formatting, and disclosure behavior.

## Use scene

A beginner or analyst uses MemeTrace mainly on a laptop in daylight, thinking rather than reacting, then checks the same evidence on a phone. This requires a light canvas, strong text contrast, calm density, generous touch targets, and motion that explains state without creating urgency.

## Exactly three screens

| Screen | Primary task | Leading content |
|---|---|---|
| **Coins** | Find a coin | Exact-mint search, returned identity/current evidence, and a separately labelled demo entry |
| **Coin report** | Understand one coin at a cutoff | Identity, data mode, cutoff/as-of time, four independent assessments, and the short interpretation |
| **Data & methods** | Audit the research | Source states, coverage and rights, method, validation, releases, and terminology |

Use a small three-destination header. Do not add a permanent sidebar, Research Lab screen, Live Shadow mode, or top-level feature-pillar tabs. Evidence pillars belong inside report disclosures; documentation sections belong inside Data & methods.

The screen's task is always the clearest heading: **Find a coin**, **Understand this coin**, or **Audit the research**. Brand copy, badges, provider status, and slogans never outrank it.

## Information hierarchy

### Coins

1. Task heading and exact-mint field.
2. Submitted lookup state: loading, result, partial result, empty, invalid, or provider error.
3. Real token identity and current source facts, when available.
4. A quiet divider and the separately labelled synthetic demo entry.
5. One short link to why ticker search is unsafe.

### Coin report

1. Token identity, mint, data-mode label, cutoff, and exact as-of time.
2. Visible truth notice: live current lookup, synthetic demo, or unavailable history.
3. Opportunity, integrity risk, tradability, and evidence quality in one comparable rail.
4. A two- or three-sentence interpretation and the facts that most changed it.
5. Progressive disclosures for flow, ownership/creator, coordination/wash, narrative/attention, execution, regime, provenance, formulas, and limitations.
6. Outcome information only after a clear hindsight boundary.

### Data & methods

1. Current connection and coverage summary.
2. Source ledger with exact interfaces, credentials, time coverage, rights, and limitations.
3. Method and validation contract.
4. Release notes.
5. Searchable terminology appendix.

## Typography

- Use Geist when it is available and fall back to the native system sans stack without changing hierarchy. Geist Mono, then the native system mono stack, is reserved for mints, timestamps, endpoint names, versions, and compact evidence values.
- Use no more than four text sizes on one screen: 13px metadata, 15–16px body/control, 20–24px section heading, and 32–40px task heading.
- Use no more than three weights: 400, 550/600, and 700.
- Body line-height is at least 1.5. Reading columns stay near 65–75 characters.
- Do not use all caps for sentences. Short evidence labels may use modest letter spacing, never below 12px.
- Numbers use tabular figures where comparison matters.

## Colour

Preserve the forensic daylight palette while raising muted-text and control contrast.

| Token | Value | Use |
|---|---|---|
| Canvas | `oklch(0.965 0.012 82)` | Warm page background |
| Paper | `oklch(0.989 0.006 82)` | Primary reading and task surface |
| Raised | `oklch(0.997 0.003 82)` | Menus and focused result surfaces only |
| Line | `oklch(0.82 0.018 76)` | Real boundaries, table rules, and input edges |
| Graphite | `oklch(0.225 0.018 67)` | Primary text |
| Muted graphite | `oklch(0.41 0.021 67)` | Secondary text; never lower contrast through opacity |
| Teal | `oklch(0.43 0.09 196)` | Links, focus, selected state, and one primary action |
| Green | `oklch(0.43 0.11 151)` | Positive evidence with a text label |
| Amber | `oklch(0.54 0.12 76)` | Caution or incomplete evidence with a text label |
| Rust | `oklch(0.48 0.15 38)` | Integrity concern or error with a text label |
| Blue | `oklch(0.45 0.105 252)` | Reconstructed evidence with a fidelity label |

- Colour never carries meaning alone. Every state includes words, a value, or a fidelity grade.
- Ordinary chrome uses graphite neutrals and teal only. Evidence colours appear only when they encode evidence.
- No neon, gradient text, glass panels, low-opacity body text, decorative glow, or colour wash behind every section.
- Focus uses a visible teal outline with sufficient offset on both canvas and paper.

## Layout

- Main width: `min(1180px, calc(100% - 32px))` on desktop; 20px page gutters at tablet; 16px at phone.
- Reading width: 720px maximum for methodology and glossary definitions.
- Spacing follows a restrained 4, 8, 12, 16, 24, 32, 48, 64px rhythm.
- Primary radius: 12px. Search/result or command surfaces may use 16px. Pills are reserved for statuses and segmented controls.
- Prefer whitespace before lines, lines before surfaces, and surfaces before nested cards.
- A surface contains one real interaction or one evidence group. Do not place every number in a card.
- Do not default to equal card grids. Use a comparison rail, reading flow, table, timeline, or disclosure according to the content.
- At 768px, stack multi-column evidence without changing reading order. At 390px and 320px, use one column and allow data tables to scroll inside a labelled region, never the page itself.

## Core components

### Three-screen navigation

- Three text destinations only: Coins, Coin report, Data & methods.
- Use current-page semantics and a restrained underline or filled text state, not a floating dock.
- Coin report may be unavailable before a coin or demo is selected; explain this through disabled state or route behavior, not a tooltip-only secret.

### Mint search

- One labelled input and one verb button: **Find coin**.
- Submit on Enter or button activation. Never fetch a metered provider on every keystroke.
- Keep the entered mint visible through loading and error states.
- Validation explains base58 shape separately from whether the address is a token.
- The demo action is visually secondary and says **Open demo**, not “Try live.”

### Assessment rail

- Four adjacent or stacked rows: Opportunity, Integrity risk, Tradability, Evidence quality.
- Each row shows value or **Unavailable**, a plain one-line meaning, and a disclosure for components.
- Do not average the four outputs into one score or infer a trade action.
- On mobile, preserve the same order and labels. Do not replace exact values with colour-only gauges.

### Evidence disclosure

- Use semantic `<details>`/`<summary>` or an equivalently accessible disclosure.
- Default open only the evidence most relevant to the current interpretation; remember no hidden state is required across sessions.
- Opening one disclosure must not re-key the whole report or move focus unexpectedly.
- Long tables remain readable without hover and expose exact values.

### Documentation sections

- Use a compact local section index or native disclosures within Data & methods, not another product navigation layer.
- Provider rows show status, last check, exact interface, coverage, credential, limitation, and rights.
- Glossary search uses a standard input and optional category chips. Results announce count changes without stealing focus.

## Truth-state treatment

| State | Required treatment |
|---|---|
| Live current | Label **Live current lookup**, show checked time and provider status, and avoid historical/model claims |
| Synthetic | Label **Demo data** beside identity and keep the unvalidated notice above all assessments |
| Historical unavailable | Keep requested cutoff visible, mark affected outputs unavailable, and explain the missing collector or archive |
| Partial | Show returned facts and name each unavailable provider or field; do not collapse partial into failure |
| Empty | Say what was checked, what no result means, and offer edit/search or demo actions |
| Error | Preserve the mint, state whether validation, network, quota, or upstream failed, and offer a bounded retry |
| Loading | Use stable reserved space and concise status text; no indefinite decorative skeleton wall |

## Words

- Task screens use names, labels, values, states, and actions. Remove any sentence that does not change the next decision.
- Labels use one to three words. Buttons use a verb or destination.
- Use **Tradability** in the product interface; define **executability** in Data & methods as the technical synonym.
- Prefer “Evidence suggests” to “This wallet is.” Prefer “Unavailable” to a guessed number.
- Never use “safe,” “guaranteed,” “proven cabal,” “insider” as fact, “easy money,” or fear-of-missing-out copy.
- Put teaching, provenance, API terms, formulas, and legal notes behind Data & methods or report disclosures.

## Icons and content images

- A control uses an icon or a word, not both. Prefer words for the small number of actions in this product.
- An icon must be familiar without a visible explanation and keep an accessible name.
- Token artwork is untrusted content. Reserve dimensions, lazy-load, decode asynchronously, provide a fallback, and never let it outrank the name or mint.
- Do not add decorative illustrations, mascots, or generic crypto symbols to task screens.

## Interaction and motion

- Ordinary feedback lasts 150–220ms and uses colour, opacity, or small transforms.
- Cutoff changes update the report as one state transition; the control remains responsive and exposes `aria-pressed` or equivalent selection state.
- Copy actions use a short live-region confirmation without changing the button's width.
- Do not use autoplay, price-tick animation, parallax, particle effects, blur reveals, or ambient motion.
- Reduced Motion removes travel and scale while preserving every state and action.
- Never read layout geometry on each pointer or scroll event.

## Component intake

No external UI package is adopted in release 0.3.0. Existing React, semantic HTML, and CSS are sufficient for the three-screen contract. See `docs/UI-DECISIONS.md` for the evaluated sources and borrow/reject decisions.

| Slot | Candidate | Why considered | Signature kept | Dependencies | A11y | Performance | Decision |
|---|---|---|---|---|---|---|---|
| Mint search | shadcn Command / Kokonut search patterns | Familiar lookup and result states | Label, explicit submit, result/empty separation | None added | Native input and button | No new runtime cost | **Borrow structure** |
| Report details | shadcn Accordion / beUI Accordion | Progressive evidence disclosure | Clear summary, state, and keyboard behavior | None added | Native details preferred | No new runtime cost | **Borrow structure** |
| Assessment change | Motion / Transitions.dev | Explain cutoff state updates | Brief opacity transition only | None added | Reduced Motion through CSS | No animation dependency | **Reject install** |
| Source/glossary records | Beautiful UI table/filter patterns | Dense audit and local filtering | Scan order and explicit state labels | None added | Semantic table/form controls | Paginate/batch if records exceed 100 | **Borrow structure** |
| Research charts | Bklit | Historical time-series and cohort views | None until real data exists | None added | Not applicable | Avoids false and unused chart payload | **Defer** |

## Performance budget

Production measurements were taken on 2026-08-28 from clean `vinext build` output. The comparable client asset set fell from about **150,814 bytes gzip** (139,377 JavaScript + 11,437 CSS) to **139,968 bytes gzip** (135,076 JavaScript + 4,892 CSS), a measured reduction of about **7.2%**. The production Coins screen renders 34 elements inside `main` and has no page-level horizontal overflow.

- The primary research-console chunk fell from 28,310 to 24,015 bytes gzip; no external UI runtime was added.
- Treat these figures as release baselines, not permanent budgets. Re-measure after any chart, animation, provider SDK, or component-library intake.
- No unexplained build-tool oversized-bundle warning.
- No horizontal page overflow at 320px.
- No layout read on every pointer or scroll event.
- No repeated blur, filter, backdrop, or shader across lists.
- Batch, paginate, or virtualize rich repeated content around 100+ items unless measurement proves full rendering safe.
- Lazy-load feature-only code and data.
- Reserve image dimensions, lazy-load offscreen content images, and decode asynchronously.
- Test the production build, not only the development server.

## Responsive and accessible behavior

- Verify 1440×900, 768px, 390px, and 320px for interface changes.
- Keep touch targets at least 44×44px where practical and separate destructive actions from navigation.
- Preserve logical keyboard order, visible focus, control labels, current-page state, table captions, live-region announcements, Escape where applicable, and focus restoration.
- Test Reduced Motion, 200% zoom, long mints, long token names, partial data, loading, empty, error, maximum-data, and slow-network states.
- No essential interaction depends on hover, drag, colour, or animation.

## Explicit exclusions

- No neon-on-black casino styling, flashing ticker, confetti, or FOMO copy.
- No hero metric surrounded by generic cards.
- No opaque buy score, winner-only leaderboard, or automatic-trade control.
- No implication that clustering proves identity, intent, or guilt.
- No old research-tab or live-shadow mode architecture.
- No external component package without a recorded intake decision and production measurement.

## Acceptance check

1. Are there exactly three top-level screens?
2. Is each screen's task its clearest heading?
3. Can a new user find the next action without reading a paragraph?
4. Are demo, live-current, partial, and unavailable states unmistakable?
5. Do opportunity, integrity risk, tradability, and evidence quality remain separate?
6. Does every visible word, line, surface, and colour explain a real decision or state?
7. Are evidence depth and specialist teaching progressively disclosed?
8. Does the interface work with keyboard, touch, 200% zoom, and Reduced Motion?
9. Does it avoid false history, model performance, provider completeness, and execution claims?
10. Do tests, type-checking, linting, and the production build pass?
