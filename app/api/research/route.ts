import {
  deriveResearchSummary,
  RESEARCH_CUTOFFS,
  researchFixture,
  type CutoffLabel,
} from "@/lib/research";

const VALID_CUTOFFS = new Set<CutoffLabel>(
  RESEARCH_CUTOFFS.map(({ label }) => label),
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedCutoff = url.searchParams.get("cutoff") ?? "5m";

  if (!VALID_CUTOFFS.has(requestedCutoff as CutoffLabel)) {
    return Response.json(
      {
        error: "invalid_cutoff",
        validCutoffs: RESEARCH_CUTOFFS.map(({ label }) => label),
      },
      { status: 400 },
    );
  }

  return Response.json(
    deriveResearchSummary(researchFixture, requestedCutoff as CutoffLabel),
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "X-Research-Data": "illustrative-fixture",
      },
    },
  );
}
