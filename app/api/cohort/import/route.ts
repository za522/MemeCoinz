import { authorizeCohortImport } from "@/lib/cohort/auth";
import {
  finalizeCohortImport,
  initializeCohortImport,
  writeCohortRows,
} from "@/lib/cohort/repository";
import { parseCohortImportRows } from "@/lib/cohort/validation";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Research-Import": "bounded-idempotent-admin-only",
};

export async function POST(request: Request) {
  const authorization = authorizeCohortImport(request);
  if (!authorization.ok) return authorization.response;
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > 1_500_000) {
    return Response.json(
      { error: "payload_too_large", message: "Import requests are limited to 1.5 MB." },
      { status: 413, headers },
    );
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Body must be an object.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Body must be one JSON object." },
      { status: 400, headers },
    );
  }
  try {
    if (body.action === "manifest") {
      return Response.json({ action: "manifest", dataset: await initializeCohortImport() }, { headers });
    }
    if (body.action === "rows") {
      const parsed = parseCohortImportRows(body.rows);
      if (parsed.error) {
        return Response.json(
          { error: "invalid_rows", message: parsed.error },
          { status: 400, headers },
        );
      }
      return Response.json({
        action: "rows",
        accepted: parsed.rows.length,
        changed: await writeCohortRows(parsed.rows),
        lastMint: parsed.rows.at(-1)?.mint ?? null,
      }, { headers });
    }
    if (body.action === "finalize") {
      const dataset = await finalizeCohortImport();
      return Response.json(
        { action: "finalize", dataset },
        { status: dataset.status === "ready" ? 200 : 409, headers },
      );
    }
    return Response.json(
      { error: "invalid_action", message: "action must be manifest, rows, or finalize." },
      { status: 400, headers },
    );
  } catch (error) {
    return Response.json(
      {
        error: "cohort_import_failed",
        message: error instanceof Error ? error.message : "The cohort import failed.",
      },
      { status: 500, headers },
    );
  }
}
