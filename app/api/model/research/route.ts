import {
  predictResearchModel,
  trainResearchModel,
  type ModelArtifact,
  type PointInTimeExample,
  type PredictionExample,
} from "@/lib/model";
import { loadPersistedResearchDataset } from "@/lib/model/repository";
import { getBackfillAdminToken } from "@/lib/providers/config";
import {
  persistModelArtifact,
  RESEARCH_FEATURE_SET_VERSION,
} from "@/lib/research-pipeline";

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Research-Data": "persisted-point-in-time-only",
  "X-Automatic-Trading": "disabled",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetName = url.searchParams.get("target") ?? undefined;
  const featureSetVersion =
    url.searchParams.get("featureSetVersion") ?? undefined;
  const horizonParameter = url.searchParams.get("horizonSeconds");
  const horizonSeconds = horizonParameter
    ? Number.parseInt(horizonParameter, 10)
    : undefined;
  const orderSizeParameter = url.searchParams.get("orderSizeUsd");
  const orderSizeUsd = orderSizeParameter
    ? Number.parseFloat(orderSizeParameter)
    : undefined;
  if (
    horizonParameter &&
    (!Number.isInteger(horizonSeconds) || (horizonSeconds ?? 0) <= 0)
  ) {
    return Response.json(
      { status: "invalid-request", reason: "horizonSeconds must be a positive integer." },
      { status: 400, headers: responseHeaders },
    );
  }
  if (
    orderSizeParameter &&
    (!Number.isFinite(orderSizeUsd) || (orderSizeUsd ?? 0) <= 0)
  ) {
    return Response.json(
      { status: "invalid-request", reason: "orderSizeUsd must be a positive number." },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const dataset = await loadPersistedResearchDataset({
      targetName,
      featureSetVersion,
      horizonSeconds,
      orderSizeUsd,
    });
    const result = trainResearchModel(dataset.examples);
    return Response.json(
      { ...result, repository: dataset.repository },
      { status: 200, headers: responseHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        status: "insufficient-data",
        reason:
          error instanceof Error
            ? `Persisted research data is unavailable: ${error.message}`
            : "Persisted research data is unavailable.",
        acceptedExamples: 0,
      },
      { status: 503, headers: responseHeaders },
    );
  }
}

type ResearchRequest =
  | {
      action: "train";
      examples: PointInTimeExample[];
      datasetAsOf?: string;
    }
  | {
      action: "predict";
      artifact: ModelArtifact;
      example: PredictionExample;
    }
  | {
      action: "train-persist";
      targetName?: string;
      featureSetVersion?: string;
      horizonSeconds?: number;
      orderSizeUsd?: number;
      datasetAsOf?: string;
      artifactStatus?: "candidate" | "validated";
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
  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );
  if (contentLength > 5_000_000) {
    return Response.json(
      { status: "invalid-request", reason: "Request exceeds the 5 MB research API limit." },
      { status: 413, headers: responseHeaders },
    );
  }
  let body: ResearchRequest;
  try {
    body = (await request.json()) as ResearchRequest;
  } catch {
    return Response.json(
      { status: "invalid-request", reason: "Body must be valid JSON." },
      { status: 400, headers: responseHeaders },
    );
  }
  try {
    if (body.action === "train-persist") {
      const configuredToken = getBackfillAdminToken();
      if (!configuredToken) {
        return Response.json(
          {
            status: "not-configured",
            reason: "Set BACKFILL_ADMIN_TOKEN before persisting model artifacts.",
          },
          { status: 503, headers: responseHeaders },
        );
      }
      const providedToken = request.headers.get("x-backfill-token") ?? "";
      if (!constantTimeEqual(configuredToken, providedToken)) {
        return Response.json(
          { status: "unauthorized", reason: "A valid x-backfill-token header is required." },
          { status: 401, headers: responseHeaders },
        );
      }
      if (
        (body.horizonSeconds !== undefined &&
          (!Number.isInteger(body.horizonSeconds) || body.horizonSeconds <= 0)) ||
        (body.orderSizeUsd !== undefined &&
          (!Number.isFinite(body.orderSizeUsd) || body.orderSizeUsd <= 0))
      ) {
        return Response.json(
          { status: "invalid-request", reason: "horizonSeconds/orderSizeUsd must be positive." },
          { status: 400, headers: responseHeaders },
        );
      }
      const dataset = await loadPersistedResearchDataset({
        targetName: body.targetName ?? "net-executable-2x-before-minus-50",
        featureSetVersion:
          body.featureSetVersion ?? `${RESEARCH_FEATURE_SET_VERSION}:launch`,
        horizonSeconds: body.horizonSeconds ?? 86_400,
        orderSizeUsd: body.orderSizeUsd ?? 100,
      });
      const inferredDatasetAsOf = dataset.examples
        .map((example) => example.outcome.labelAvailableAt)
        .sort()
        .at(-1) ?? new Date(0).toISOString();
      const datasetAsOf = body.datasetAsOf ?? inferredDatasetAsOf;
      const result = trainResearchModel(dataset.examples, {
        datasetAsOf,
        createdAt: datasetAsOf,
      });
      if (result.status !== "trained") {
        return Response.json(
          { ...result, repository: dataset.repository, persistence: { state: "not-attempted" } },
          { status: 200, headers: responseHeaders },
        );
      }
      const artifactStatus = body.artifactStatus ?? "candidate";
      const persistence = await persistModelArtifact(
        result.artifact,
        artifactStatus,
      );
      return Response.json(
        { ...result, repository: dataset.repository, artifactStatus, persistence },
        {
          status: persistence.state === "written" ? 200 : 503,
          headers: { ...responseHeaders, "X-Research-Write": "model-artifact" },
        },
      );
    }
    if (body.action === "train" && Array.isArray(body.examples)) {
      return Response.json(
        trainResearchModel(body.examples, { datasetAsOf: body.datasetAsOf }),
        { headers: responseHeaders },
      );
    }
    if (body.action === "predict" && body.artifact && body.example) {
      return Response.json(predictResearchModel(body.artifact, body.example), {
        headers: responseHeaders,
      });
    }
    return Response.json(
      { status: "invalid-request", reason: "Use action=train, action=predict, or protected action=train-persist." },
      { status: 400, headers: responseHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        status: "invalid-request",
        reason: error instanceof Error ? error.message : "Research request failed validation.",
      },
      { status: 400, headers: responseHeaders },
    );
  }
}
