import {
  isValidCohortCursor,
  listCohortLaunches,
  readCohortStatus,
} from "@/lib/cohort/repository";
import type { CohortObservedStatus } from "@/lib/cohort/types";

const headers = {
  "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
  "X-Content-Type-Options": "nosniff",
  "X-Research-Data": "published-corrected-censored-cohort",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "launches";
  try {
    if (view === "status") {
      return Response.json(await readCohortStatus(), { headers });
    }
    if (view !== "launches") {
      return Response.json(
        { error: "invalid_view", message: "view must be launches or status." },
        { status: 400, headers },
      );
    }
    const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    const cursor = url.searchParams.get("cursor");
    if (cursor && !isValidCohortCursor(cursor)) {
      return Response.json(
        { error: "invalid_cursor", message: "cursor is malformed or incompatible." },
        { status: 400, headers },
      );
    }
    const rawStatus = url.searchParams.get("observedStatus") ?? "all";
    const allowed = new Set([
      "all",
      "confirmed-fast-graduation",
      "right-censored",
      "without-published-outcome",
    ]);
    if (!allowed.has(rawStatus)) {
      return Response.json(
        { error: "invalid_status", message: "observedStatus is invalid." },
        { status: 400, headers },
      );
    }
    return Response.json(await listCohortLaunches({
      limit,
      cursor,
      observedStatus: rawStatus as CohortObservedStatus | "all",
    }), { headers });
  } catch (error) {
    return Response.json(
      {
        error: "cohort_storage_unavailable",
        message: error instanceof Error ? error.message : "The cohort store did not respond.",
      },
      { status: 503, headers: { ...headers, "Cache-Control": "no-store" } },
    );
  }
}
