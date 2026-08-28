import { getBackfillAdminToken } from "@/lib/providers/config";
import { parseProtectedIngestionPayload } from "@/lib/ingestion/bridge";
import { persistCoinBatch } from "@/lib/ingestion/storage";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Research-Ingestion": "bounded-protected-normalized-evidence",
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
  const configured = getBackfillAdminToken();
  if (!configured) {
    return Response.json({ error: "not_configured", message: "Protected ingestion is not configured." }, { status: 503, headers });
  }
  if (!constantTimeEqual(configured, request.headers.get("x-backfill-token") ?? "")) {
    return Response.json({ error: "unauthorized", message: "A valid x-backfill-token is required." }, { status: 401, headers });
  }
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > 5_000_000) {
    return Response.json({ error: "payload_too_large", message: "Payload exceeds 5 MB." }, { status: 413, headers });
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return Response.json({ error: "invalid_json", message: "Body must be valid JSON." }, { status: 400, headers });
  }
  const parsed = parseProtectedIngestionPayload(value);
  if (parsed.error) {
    return Response.json({ error: "invalid_payload", message: parsed.error }, { status: 400, headers });
  }
  const storage = await persistCoinBatch(parsed.coins, parsed.observations);
  return Response.json({
    status: storage.state === "written" ? "written" : "not-written",
    accepted: { coins: parsed.coins.length, observations: parsed.observations.length },
    storage,
  }, { status: storage.state === "failed" ? 503 : 200, headers });
}
