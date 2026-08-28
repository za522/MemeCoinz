import { decodeCoinsCursor, listCoins } from "@/lib/ingestion/service";

function boundedNumber(
  value: string | null,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceValue = url.searchParams.get("source");
  const statusValue = url.searchParams.get("status");
  const source = sourceValue === "rpc" || sourceValue === "tracker"
    ? sourceValue
    : "auto";
  const status = statusValue === "bonding" || statusValue === "graduated"
    ? statusValue
    : "all";
  const cursor = decodeCoinsCursor(url.searchParams.get("cursor"));
  if (cursor === null) {
    return Response.json(
      { error: "invalid_cursor", message: "cursor must be a cursor returned by this API" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = await listCoins({
    limit: boundedNumber(url.searchParams.get("limit"), 1, 100),
    cursor,
    source,
    status,
    enrich: url.searchParams.get("enrich") !== "false",
    minLiquidityUsd: boundedNumber(
      url.searchParams.get("minLiquidityUsd"),
      0,
      1_000_000_000_000,
    ),
    minVolume24hUsd: boundedNumber(
      url.searchParams.get("minVolume24hUsd"),
      0,
      1_000_000_000_000,
    ),
    query: url.searchParams.get("q")?.slice(0, 100),
  });
  return Response.json(response, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Research-Data": "real-live-and-stored-observations",
      "X-Source-Policy": "supported-apis-and-public-ledger-only",
    },
  });
}
