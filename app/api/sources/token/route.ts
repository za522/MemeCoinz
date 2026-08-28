import { getTokenEnrichment, isSolanaAddress } from "@/lib/providers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mint = url.searchParams.get("mint")?.trim() ?? "";

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

  const enrichment = await getTokenEnrichment(mint);
  return Response.json(enrichment, {
    headers: {
      "Cache-Control": "public, max-age=15, s-maxage=15, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
      "X-Research-Data": "live-point-in-time-enrichment",
    },
  });
}
