import { env } from "cloudflare:workers";
import { authorizeCohortImport } from "@/lib/cohort/auth";
import { RED_PUMP_DATASET } from "@/lib/cohort/constants";
import {
  initializeCohortImport,
  recordRawObject,
} from "@/lib/cohort/repository";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Research-Storage": "private-immutable-r2",
};

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
export async function PUT(request: Request) {
  const authorization = authorizeCohortImport(request);
  if (!authorization.ok) return authorization.response;
  const filename = new URL(request.url).searchParams.get("filename");
  const file = filename === RED_PUMP_DATASET.launchesFile.name
    ? RED_PUMP_DATASET.launchesFile
    : filename === RED_PUMP_DATASET.outcomesFile.name
      ? RED_PUMP_DATASET.outcomesFile
      : null;
  if (!file) {
    return Response.json(
      { error: "invalid_file", message: "filename is not an allowed cohort source file." },
      { status: 400, headers },
    );
  }
  const length = Number.parseInt(request.headers.get("content-length") ?? "-1", 10);
  const declaredHash = request.headers.get("x-content-sha256")?.toLowerCase();
  if (length !== file.bytes || declaredHash !== file.sha256) {
    return Response.json(
      { error: "source_manifest_mismatch", message: "File length or declared SHA-256 does not match the frozen source manifest." },
      { status: 400, headers },
    );
  }
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength !== file.bytes) throw new Error("Received byte length changed during upload.");
    const actualHash = bytesToHex(await crypto.subtle.digest("SHA-256", body));
    if (actualHash !== file.sha256) throw new Error("Uploaded source SHA-256 does not match the frozen manifest.");
    await initializeCohortImport();
    const objectKey = `cohorts/${RED_PUMP_DATASET.id}/raw/${file.name}`;
    await env.RAW_RESEARCH.put(objectKey, body, {
      httpMetadata: { contentType: "application/gzip" },
      customMetadata: {
        dataset: RED_PUMP_DATASET.id,
        sha256: actualHash,
        source: RED_PUMP_DATASET.versionDoi,
      },
    });
    await recordRawObject(file.name, objectKey);
    return Response.json({
      stored: true,
      filename: file.name,
      bytes: body.byteLength,
      sha256: actualHash,
      objectKey,
    }, { headers });
  } catch (error) {
    return Response.json(
      {
        error: "raw_storage_failed",
        message: error instanceof Error ? error.message : "Raw source storage failed.",
      },
      { status: 500, headers },
    );
  }
}
