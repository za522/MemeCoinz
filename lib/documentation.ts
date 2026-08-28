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
