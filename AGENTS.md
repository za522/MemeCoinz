# Repository working rules

These rules govern the `web/` repository. Preserve stricter instructions from the user or a more specific `AGENTS.md`.

## Before editing

1. Read this file and every more specific `AGENTS.md` that applies.
2. Read `PRODUCT.md` and `DESIGN.md` before changing the interface, navigation, user-visible copy, or information architecture.
3. Read the relevant source and documentation before editing. Executable behavior outranks aspirational prose.
4. Inspect `git status` and preserve unrelated work, including untracked duplicate files. Never “clean up” files outside the requested scope.
5. Do not install a UI library until the exact component slot, task fit, license, dependencies, accessibility, responsive behavior, and production cost are recorded in `docs/UI-DECISIONS.md`.

## Product contract

- Keep exactly three top-level screens: **Coins**, **Coin report**, and **Data & methods**.
- Give each screen one primary task and make that task its clearest heading.
- Keep feature pillars inside progressive Coin report disclosures. Do not restore Research Lab, feature-tab, Data Coverage, or Live Shadow screen architecture.
- Preserve the forensic daylight language, high legibility, restrained evidence colours, and minimal composition in `DESIGN.md`.
- Keep opportunity, integrity risk, tradability, and evidence quality separate. Never replace them with one Buy Score.
- Clearly distinguish synthetic demo data, live current lookups, historical observations, unavailable fields, and validated results.
- Do not infer historical cutoffs or model scores from a current provider response.
- Treat wallet coordination and wash-trading features as probabilistic evidence, not proof of identity, intent, or wrongdoing.
- Keep automatic trading disabled unless a later request explicitly authorizes it after the documented evidence, safety, terms, and jurisdiction gates.

## Implementation

- Preserve unrelated changes and do not modify duplicate untracked files unless the user names them.
- Prefer existing React, semantic HTML, and CSS when they solve the task. Release 0.3.0 intentionally adopts no external UI package.
- Use familiar controls, visible focus, touch-safe targets, and Reduced Motion behavior.
- Put explanations, formulas, provenance, and specialist definitions behind accessible disclosures or Data & methods.
- Never expose provider secrets to the browser or through `NEXT_PUBLIC_` variables.
- Do not scrape Pump.fun consumer pages, Fomo.family, Photon, memescope.net, or private endpoints.
- Add or update tests for changed behavior, edge cases, accessibility semantics, and truthful data states.
- Do not make deployments, account connections, data purchases, trading actions, or other external writes unless the user's request authorizes them.

## Documentation

After completing an implementation:

- update `PRODUCT.md` only when capability, screen, data, or non-goal truth changed;
- update `DESIGN.md` when a durable interface rule or token changed;
- update relevant technical or source documentation;
- add a dated, user-visible entry to `CHANGELOG.md`;
- define new specialist language in the terminology appendix;
- record significant UI-source, API, data-rights, architecture, and rejection decisions.

Markdown is the source of truth. In-app documentation may render or mirror it, but must not contradict it.

## Required checks

Run every command from this repository root before a completed implementation is committed:

- tests: `npm test`
- linting: `npm run lint`
- type-checking: `npx tsc --noEmit`
- production build: `npm run build`

Do not report success for a command that did not run or did not pass. If the toolchain or an external dependency blocks a check, state the exact blocker.

For interface changes, also verify:

- 1440×900, 768px, 390px, and 320px;
- keyboard order and visible focus;
- Reduced Motion and 200% zoom;
- loading, empty, partial, error, long-content, and maximum-data states;
- no horizontal page overflow or browser console error;
- a production baseline and final measurement for any performance claim.

## Safe Git updates

After a requested implementation is complete:

1. Review the final diff, staged diff, and `git status`.
2. Confirm all required checks pass.
3. Confirm the current branch, upstream, `origin`, and remote divergence.
4. Fetch the current upstream when network access is available.
5. If the remote is ahead or branches diverged, stop and explain. Do not merge, rebase, overwrite, or force-push automatically.
6. Stage only the completed in-scope files explicitly.
7. Commit the complete passing change with a clear message.
8. Push the current branch to its configured upstream or `origin`, unless the user says `do not push`.

Never push partial work, failing code, secrets, generated build output, or unrelated changes. Never force-push or bypass branch protection. If no GitHub remote exists, ask which repository and branch to use.

A request to review, explain, plan, or diagnose does not authorize implementation, a commit, or a push.
