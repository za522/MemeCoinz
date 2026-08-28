import { getSourceRegistry } from "@/lib/providers";

export async function GET() {
  const registry = await getSourceRegistry();
  return Response.json(registry, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
      "X-Source-Policy": "no-scraping",
    },
  });
}
