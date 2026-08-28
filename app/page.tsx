import { ResearchConsole } from "./research-console";
import {
  deriveResearchSummary,
  RESEARCH_CUTOFFS,
  researchFixture,
  type CutoffLabel,
  type ResearchSummary,
} from "@/lib/research";

export default function Home() {
  const summaries = Object.fromEntries(
    RESEARCH_CUTOFFS.map(({ label }) => [
      label,
      deriveResearchSummary(researchFixture, label),
    ]),
  ) as Record<CutoffLabel, ResearchSummary>;

  return <ResearchConsole replay={researchFixture} summaries={summaries} />;
}
