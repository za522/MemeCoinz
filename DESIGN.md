# MemeTrace interface system

## Direction

MemeTrace is a forensic daylight research desk, not a casino terminal. The interface uses warm paper, graphite ink, compact mono labels, restrained evidence colors, and editorial spacing. Urgency comes from the investigation, never from flashing price decoration.

## Information hierarchy

1. The selected token, decision cutoff, and exact as-of time.
2. A visible fixture or source-quality warning.
3. Four independent judgments: opportunity, integrity risk, executability, and evidence confidence.
4. The underlying evidence by research pillar.
5. Base rates, limitations, provenance, and validation state.

The default question is “Could this have been known at this cutoff?” rather than “Should I buy?”

## Tokens

- Canvas: `oklch(0.965 0.012 82)`
- Paper: `oklch(0.989 0.006 82)`
- Graphite ink: `oklch(0.225 0.018 67)`
- Teal investigation accent: `oklch(0.47 0.09 196)`
- Green positive evidence: `oklch(0.53 0.12 151)`
- Amber caution: `oklch(0.67 0.13 76)`
- Rust integrity concern: `oklch(0.55 0.15 38)`
- Blue reconstructed evidence: `oklch(0.5 0.105 252)`
- Primary radius: 12px; large command surfaces: 18px
- Type: Geist Sans for interface language and Geist Mono for addresses, timestamps, metrics, versions, and evidence labels

Color never carries meaning alone. Every status includes a text label, score, fidelity grade, or shape.

## Core patterns

- Command bar: token identity, cutoff selector, and point-in-time timestamp in one surface.
- Score rails: compact, independent outputs with definitions. No single opaque buy score.
- Evidence panels: varied layouts selected for the evidence type, including timelines, tables, funnels, and relationship flows.
- Fidelity badges: `A exact`, `B reconstructed`, `C proxy`, and `D unavailable`.
- Fixture notice: always visible while synthetic data is active.
- Live empty state: refuses to generate a score until real provider adapters are authenticated.
- Outcome label: visually separated from cutoff-safe inputs to reinforce hindsight boundaries.

## Interaction

- Cutoff buttons update every derived metric together.
- Research tabs preserve one investigative context and expose every pillar.
- Score breakdowns use native disclosure controls and remain keyboard accessible.
- Copying the mint provides a short, polite confirmation.
- Live shadow is a distinct mode, not a cosmetic badge on historical data.

## Responsive behavior

Desktop prioritizes parallel comparison. Tablet collapses secondary panels while preserving the command bar and cutoffs. Mobile uses a one-column evidence stream, horizontally scrollable research tabs, and overflow-safe data tables. Dense charts use fixed semantic labels and never rely on hover alone.

## Accessibility

Target WCAG 2.2 AA. Controls have visible focus, buttons expose pressed state, meters expose numeric values, tables include captions, and reduced-motion preferences are respected. Body copy remains plain enough for a beginner while specialist definitions stay available beside the metric.

## Explicit exclusions

- No neon-on-black casino styling.
- No confetti, flashing tickers, decorative price motion, or FOMO copy.
- No winner-only leaderboard.
- No implication that wallet evidence proves identity, intent, or guilt.
- No automatic-trade control before prospective validation and safety gates.
