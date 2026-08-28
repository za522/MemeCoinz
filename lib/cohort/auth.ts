import { getBackfillAdminToken } from "@/lib/providers/config";

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
export function authorizeCohortImport(request: Request):
  | { ok: true }
  | { ok: false; response: Response } {
  const configuredToken = getBackfillAdminToken();
  if (!configuredToken) {
    return {
      ok: false,
      response: Response.json(
        { error: "import_not_configured", message: "Set BACKFILL_ADMIN_TOKEN before importing a cohort." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  const providedToken = request.headers.get("x-backfill-token") ?? "";
  if (!constantTimeEqual(configuredToken, providedToken)) {
    return {
      ok: false,
      response: Response.json(
        { error: "unauthorized", message: "A valid x-backfill-token header is required." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return { ok: true };
}
