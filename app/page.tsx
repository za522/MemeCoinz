import { ResearchConsole, type AppScreen } from "./research-console";
import {
  deriveResearchSummary,
  RESEARCH_CUTOFFS,
  researchFixture,
  type CutoffLabel,
  type ResearchSummary,
} from "@/lib/research";

interface HomeProps {
  searchParams?: Promise<{
    screen?: string | string[];
    term?: string | string[];
  }>;
}

const SCREENS = new Set<AppScreen>(["coins", "report", "methods"]);

export default async function Home({ searchParams }: HomeProps) {
  const params = searchParams ? await searchParams : {};
  const requestedScreen = typeof params.screen === "string" ? params.screen : "coins";
  const initialScreen = SCREENS.has(requestedScreen as AppScreen)
    ? requestedScreen as AppScreen
    : "coins";
  const initialTerm = typeof params.term === "string" ? params.term.slice(0, 120) : "";
  const summaries = Object.fromEntries(
    RESEARCH_CUTOFFS.map(({ label }) => [
      label,
      deriveResearchSummary(researchFixture, label),
    ]),
  ) as Record<CutoffLabel, ResearchSummary>;

  return (
    <ResearchConsole
      initialScreen={initialScreen}
      initialTerm={initialTerm}
      replay={researchFixture}
      summaries={summaries}
    />
  );
}
