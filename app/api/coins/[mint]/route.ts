import { getCoinDetail } from "@/lib/ingestion/service";
import { isSolanaAddress } from "@/lib/providers";

export async function GET(
  request: Request,
  context: { params: Promise<{ mint: string }> },
) {
  const params = await context.params;
  const mint = decodeURIComponent(params.mint ?? "").trim();
  if (!isSolanaAddress(mint)) {
    return Response.json(
      {
        error: "invalid_mint",
        message: "mint must be one base58-encoded Solana address",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("historyLimit") ?? 100);
  const historyLimit = Number.isFinite(requestedLimit)
    ? Math.min(200, Math.max(1, Math.round(requestedLimit)))
    : 100;
  const response = await getCoinDetail(mint, { historyLimit });
  return Response.json(response, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Research-Data": "real-current-and-bounded-ledger-history",
    },
  });
}
