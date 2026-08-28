import { getBackfillAdminToken } from "@/lib/providers/config";
import { materializeMaturedOutcomes } from "@/lib/research-pipeline";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Research-Data": "manual-matured-outcome-materialization",
  "X-Automatic-Trading": "disabled",
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

export async function POST(request: Request) {
  const configuredToken = getBackfillAdminToken();
  if (!configuredToken) {
    return Response.json(
      {
        status: "not-configured",
        reason: "Set BACKFILL_ADMIN_TOKEN before materializing outcome rows.",
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
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json(
      { status: "invalid-request", reason: "Body must be a JSON object." },
      { status: 400, headers },
    );
  }
  const maxSnapshots = body.maxSnapshots === undefined ? 50 : Number(body.maxSnapshots);
  const horizonSeconds = body.horizonSeconds === undefined
    ? 86_400
    : Number(body.horizonSeconds);
  const orderSizeUsd = body.orderSizeUsd === undefined ? 100 : Number(body.orderSizeUsd);
  if (
    !Number.isInteger(maxSnapshots) || maxSnapshots < 1 || maxSnapshots > 100 ||
    !Number.isInteger(horizonSeconds) || horizonSeconds < 1 ||
    !Number.isFinite(orderSizeUsd) || orderSizeUsd <= 0
  ) {
    return Response.json(
      {
        status: "invalid-request",
        reason: "maxSnapshots must be 1–100; horizonSeconds and orderSizeUsd must be positive.",
      },
      { status: 400, headers },
    );
  }
  const result = await materializeMaturedOutcomes({
    maxSnapshots,
    horizonSeconds,
    orderSizeUsd,
    dryRun: body.dryRun === true,
  });
  return Response.json(result, {
    status: result.storage.state === "failed" || result.storage.state === "unavailable"
      ? 503
      : 200,
    headers,
  });
}
