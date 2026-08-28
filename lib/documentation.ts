export type GlossaryCategory =
  | "Market"
  | "Solana"
  | "Coordination"
  | "Narrative"
  | "Research"
  | "Execution"
  | "Data";

export interface GlossaryTerm {
  term: string;
  definition: string;
  category: GlossaryCategory;
  whyItMatters?: string;
}

export const GLOSSARY_CATEGORIES: Array<"All" | GlossaryCategory> = [
  "All",
  "Market",
  "Solana",
  "Coordination",
  "Narrative",
  "Research",
  "Execution",
  "Data",
];

export const RELEASE_NOTES = [
  {
    date: "29 Aug 2026",
    title: "First broad historical launch cohort",
    items: [
      "Added the corrected RED-PUMP-2026-v1 corpus as a separate historical dataset: 860,194 unique Pump launches observed from 8 May to 10 June 2026.",
      "The source files are hash-verified and privately archived; the compact launch index is paginated rather than mounted all at once.",
      "Kept 831,290 TIMEOUT records right-censored and visibly distinct from losses. Only 1,651 fast graduations are confirmed by this source.",
      "This establishes launch scale, not a profitability model: transaction paths, wallet graphs, narrative history, executable exits, and valid negative labels still require separate collection.",
    ],
  },
  {
    date: "28 Aug 2026",
    title: "Hosted live-feed recovery",
    items: [
      "Added a credential-free browser fallback to DEX Screener's public latest-profile and current-pair endpoints when the server returns no coins.",
      "Fallback rows are real current Pump-like tokens, but remain visibly partial, promoted, unpersisted, and excluded from model training.",
      "Kept the Coin report on the same real mint while showing unavailable point-in-time evidence instead of replacing it with a score.",
    ],
  },
  {
    date: "28 Aug 2026",
    title: "Real feed and point-in-time research pipeline",
    items: [
      "Replaced the synthetic-first home screen with a real bounded Pump/PumpSwap feed, exact instruction decoding, cursors, and honest fallback coverage.",
      "Added real per-mint history/current enrichment, provenance, missing reasons, and conditional D1 persistence.",
      "Added protected bounded Helius/Tracker/X/Jupiter/Jito collection plus a manual end-to-end pipeline runner; public status checks consume no quota or write.",
      "Added leakage-safe feature/outcome calculation plus a manual materializer that never turns missing paths into losses.",
      "Added strict walk-forward training, protected artifact persistence, and validated-only shadow predictions; the runner writes candidates only and insufficient data still produces no probability.",
      "Added a disabled-by-default, deduplicated Telegram research-alert runner; it cannot trade.",
      "No transaction-level outcome cohort, validated artifact, eligible alert, or trading edge is claimed in this environment.",
    ],
  },
  {
    date: "28 Aug 2026",
    title: "Three-screen product reset",
    items: [
      "Replaced the competing menus with Coins, Coin report, and Data & methods.",
      "Made current mint lookup and synthetic demo data unmistakably different.",
      "Removed the dominant unvalidated score and moved calculations behind disclosures.",
      "Separated the 2025 research paper from the app's own, still-unavailable historical coverage.",
      "Made the source ledger distinguish a declared capability from code that is actually running.",
      "Separated address shape from token confirmation and kept partial DEX evidence when one subrequest fails.",
    ],
  },
  {
    date: "28 Aug 2026",
    title: "Provider connection layer",
    items: [
      "Added server-side source adapters so API keys never enter the browser bundle.",
      "Added live provider health reporting and per-source connection states.",
      "Added a Solana address lookup with separate token confirmation and current market enrichment.",
      "Separated working public sources, key-gated sources, and partnership-only sources.",
      "Added this concise build log and a searchable 164-term appendix.",
    ],
  },
  {
    date: "27 Aug 2026",
    title: "All-pillar research console",
    items: [
      "Implemented point-in-time replay across lifecycle, execution, ownership, coordination, narrative, regime, and evidence quality.",
      "Separated opportunity, integrity risk, executability, and evidence confidence.",
      "Kept the included demonstration visibly synthetic and automatic trading disabled.",
    ],
  },
];
