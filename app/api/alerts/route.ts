import {
  getTelegramAlertStatus,
  runTelegramShadowAlerts,
} from "@/lib/alerts";
import { getBackfillAdminToken } from "@/lib/providers/config";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Alert-Policy": "validated-shadow-predictions-only",
  "X-Trading-Enabled": "false",
};

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

export async function GET() {
  return Response.json(getTelegramAlertStatus(), { headers });
}

export async function POST(request: Request) {
  const configuredToken = getBackfillAdminToken();
  if (!configuredToken) {
    return Response.json(
      {
        status: "not-configured",
        reason: "Set BACKFILL_ADMIN_TOKEN before running the alert worker.",
      },
      { status: 503, headers },
    );
  }
  const providedToken = request.headers.get("x-backfill-token") ?? "";
  if (!constantTimeEqual(configuredToken, providedToken)) {
    return Response.json(
      { status: "unauthorized", reason: "A valid x-backfill-token header is required." },
      { status: 401, headers },
    );
  }

  let body: { dryRun?: unknown; limit?: unknown } = {};
  try {
    body = await request.json() as typeof body;
  } catch {
    // An empty body means a real run; the environment still gates delivery.
  }
  const limit = body.limit === undefined ? undefined : Number(body.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 25)) {
    return Response.json(
      { status: "invalid-request", reason: "limit must be an integer from 1 to 25." },
      { status: 400, headers },
    );
  }
  const result = await runTelegramShadowAlerts({
    dryRun: body.dryRun === true,
    limit,
  });
  return Response.json(result, {
    status: result.status === "not-configured" ? 503 : 200,
    headers,
  });
}

