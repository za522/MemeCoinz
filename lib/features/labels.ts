import type {
  ExecutableOutcomeLabel,
  ExecutablePositionPath,
  OutcomeDefinition,
  PositionExitSample,
} from "./types";

export const DEFAULT_OUTCOME_DEFINITIONS: readonly OutcomeDefinition[] = [
  { horizonSeconds: 3_600, targetMultiple: 2, downsideMultiple: 0.5 },
  { horizonSeconds: 21_600, targetMultiple: 2, downsideMultiple: 0.5 },
  { horizonSeconds: 86_400, targetMultiple: 2, downsideMultiple: 0.5 },
] as const;

const timestamp = (value: string): number => Date.parse(value);

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const maxDrawdownPct = (values: readonly number[]): number | null => {
  if (values.length < 2) return null;
  let peak = values[0];
  let maximumDrawdown = 0;
  values.slice(1).forEach((value) => {
    peak = Math.max(peak, value);
    if (peak > 0) maximumDrawdown = Math.max(maximumDrawdown, ((peak - value) / peak) * 100);
  });
  return round(maximumDrawdown);
};

const sortedEligibleExits = (
  path: ExecutablePositionPath,
  horizonEndMs: number,
  labelAsOfMs: number,
): PositionExitSample[] =>
  path.exits
    .filter((sample) => {
      const eventMs = timestamp(sample.eventAt);
      const availableMs = timestamp(sample.availableAt);
      return (
        sample.canonical !== false &&
        Number.isFinite(eventMs) &&
        Number.isFinite(availableMs) &&
        eventMs > timestamp(path.entryAt) &&
        eventMs <= horizonEndMs &&
        availableMs <= labelAsOfMs
      );
    })
    .sort((left, right) => timestamp(left.eventAt) - timestamp(right.eventAt));

const unavailableLabel = (
  path: ExecutablePositionPath,
  definition: OutcomeDefinition,
  labelAvailableAt: string,
  status: "pending" | "unavailable",
  caveat: string,
): ExecutableOutcomeLabel => ({
  mint: path.mint,
  cutoffSeconds: path.cutoffSeconds,
  orderSizeUsd: path.orderSizeUsd,
  horizonSeconds: definition.horizonSeconds,
  status,
  labelAvailableAt,
  targetMultiple: definition.targetMultiple,
  downsideMultiple: definition.downsideMultiple,
  reachedTargetBeforeDownside: null,
  maximumNetReturnPct: null,
  maximumDrawdownPct: null,
  exitabilityPct: null,
  exitSucceededAtHorizon: null,
  observedExitSampleCount: 0,
  fidelity: path.coverage.fidelity,
  sourceIds: [...new Set(path.coverage.sourceIds)].sort(),
  caveats: [caveat],
});

/**
 * Derive one executable training label from a precomputed position path.
 *
 * A path is label-ready only after the horizon has elapsed and the collector
 * declares complete event coverage through that horizon. This prevents an
 * absence of late data from becoming a false negative.
 */
export function deriveExecutableOutcomeLabel(
  path: ExecutablePositionPath,
  definition: OutcomeDefinition,
  labelAsOf: string,
): ExecutableOutcomeLabel {
  if (definition.horizonSeconds <= 0) throw new Error("horizonSeconds must be positive");
  if (definition.targetMultiple <= 1) throw new Error("targetMultiple must exceed 1");
  if (definition.downsideMultiple <= 0 || definition.downsideMultiple >= 1) {
    throw new Error("downsideMultiple must be between 0 and 1");
  }

  const entryMs = timestamp(path.entryAt);
  const entryAvailableMs = timestamp(path.entryAvailableAt);
  const labelAsOfMs = timestamp(labelAsOf);
  const horizonEndMs = entryMs + definition.horizonSeconds * 1_000;
  const coverageThroughMs = timestamp(path.coverage.eventThrough);
  const coverageAvailableMs = timestamp(path.coverage.availableAt);
  if (
    ![
      entryMs,
      entryAvailableMs,
      labelAsOfMs,
      coverageThroughMs,
      coverageAvailableMs,
    ].every(Number.isFinite)
  ) {
    throw new Error("Executable path timestamps must be valid ISO date-times");
  }

  const nominalAvailableMs = Math.max(horizonEndMs, coverageAvailableMs);
  const nominalAvailableAt = new Date(nominalAvailableMs).toISOString();
  if (path.coverage.status === "unavailable") {
    return unavailableLabel(
      path,
      definition,
      nominalAvailableAt,
      "unavailable",
      "Execution-path coverage is unavailable; no outcome was inferred.",
    );
  }
  if (entryAvailableMs > entryMs || !path.entryRouteAvailable || path.totalEntryCostUsd === null) {
    return unavailableLabel(
      path,
      definition,
      nominalAvailableAt,
      "unavailable",
      entryAvailableMs > entryMs
        ? "The entry quote was not available at the entry cutoff."
        : "The standardized position could not be entered at the cutoff.",
    );
  }
  if (path.totalEntryCostUsd <= 0) throw new Error("totalEntryCostUsd must be positive");
  const totalEntryCostUsd = path.totalEntryCostUsd;
  if (
    labelAsOfMs < horizonEndMs ||
    coverageThroughMs < horizonEndMs ||
    coverageAvailableMs > labelAsOfMs ||
    path.coverage.status !== "complete"
  ) {
    return unavailableLabel(
      path,
      definition,
      nominalAvailableAt,
      "pending",
      "The horizon or complete execution-path coverage has not matured; no label exists yet.",
    );
  }

  const exits = sortedEligibleExits(path, horizonEndMs, labelAsOfMs);
  if (exits.length === 0) {
    return unavailableLabel(
      path,
      definition,
      nominalAvailableAt,
      "unavailable",
      "Complete coverage was declared but no exit probes were recorded; no outcome was inferred.",
    );
  }

  const successful = exits.filter(
    (sample) => sample.exitRouteAvailable && sample.netExitValueUsd !== null,
  );
  let reachedTargetBeforeDownside = false;
  for (const sample of successful) {
    const multiple = (sample.netExitValueUsd as number) / totalEntryCostUsd;
    if (multiple <= definition.downsideMultiple) break;
    if (multiple >= definition.targetMultiple) {
      reachedTargetBeforeDownside = true;
      break;
    }
  }

  const returns = successful.map(
    (sample) => (((sample.netExitValueUsd as number) / totalEntryCostUsd) - 1) * 100,
  );
  const exitValues = successful.map((sample) => sample.netExitValueUsd as number);
  const lastSample = exits[exits.length - 1];
  const allSourceIds = [
    ...path.coverage.sourceIds,
    ...exits.map((sample) => sample.sourceId),
  ];
  const sampleAvailabilityMs = Math.max(
    nominalAvailableMs,
    ...exits.map((sample) => timestamp(sample.availableAt)),
  );

  return {
    mint: path.mint,
    cutoffSeconds: path.cutoffSeconds,
    orderSizeUsd: path.orderSizeUsd,
    horizonSeconds: definition.horizonSeconds,
    status: "available",
    labelAvailableAt: new Date(sampleAvailabilityMs).toISOString(),
    targetMultiple: definition.targetMultiple,
    downsideMultiple: definition.downsideMultiple,
    reachedTargetBeforeDownside,
    maximumNetReturnPct: returns.length ? round(Math.max(...returns)) : null,
    maximumDrawdownPct: maxDrawdownPct([totalEntryCostUsd, ...exitValues]),
    exitabilityPct: round((successful.length / exits.length) * 100),
    exitSucceededAtHorizon:
      lastSample.exitRouteAvailable && lastSample.netExitValueUsd !== null,
    observedExitSampleCount: exits.length,
    fidelity: path.coverage.fidelity,
    sourceIds: [...new Set(allSourceIds)].sort(),
    caveats: [
      "Returns use executable exit values after estimated execution costs, not chart-price peaks.",
      "An available label describes the recorded path and order size; it is not a trading recommendation.",
    ],
  };
}

export function deriveExecutableOutcomeLabels(
  paths: readonly ExecutablePositionPath[],
  definitions: readonly OutcomeDefinition[] = DEFAULT_OUTCOME_DEFINITIONS,
  labelAsOf: string,
): ExecutableOutcomeLabel[] {
  return paths.flatMap((path) =>
    definitions.map((definition) => deriveExecutableOutcomeLabel(path, definition, labelAsOf)),
  );
}
