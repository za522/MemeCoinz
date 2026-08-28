import type {
  DatasetAudit,
  DatasetAuditIssue,
  PointInTimeExample,
} from "./types";

const parseTime = (value: string): number => Date.parse(value);

function pushIssue(
  issues: DatasetAuditIssue[],
  rowId: string,
  code: DatasetAuditIssue["code"],
  detail: string,
) {
  issues.push({ rowId, code, detail });
}

/**
 * Rejects an entire row when any input could have been unavailable at its
 * decision time. This intentionally favours a smaller honest dataset over a
 * larger contaminated one.
 */
export function auditPointInTimeDataset(
  rows: readonly PointInTimeExample[],
  datasetAsOf = new Date().toISOString(),
): DatasetAudit {
  const issues: DatasetAuditIssue[] = [];
  const rejected = new Set<string>();
  const seenKeys = new Set<string>();
  const asOf = parseTime(datasetAsOf);
  const featureSetVersions = new Set(rows.map((row) => row.featureSetVersion));
  const labelKeys = new Set(
    rows.map(
      (row) =>
        `${row.outcome.name}:${row.outcome.version}:${row.outcome.horizonSeconds}:${row.outcome.orderSizeUsd}`,
    ),
  );

  for (const row of rows) {
    const key = `${row.tokenId}:${row.referenceClock}:${row.referenceAt}:${row.cutoffSeconds}`;
    if (seenKeys.has(key)) {
      pushIssue(issues, row.rowId, "duplicate-row-key", `Duplicate ${key}.`);
      rejected.add(row.rowId);
    }
    seenKeys.add(key);

    const referenceAt = parseTime(row.referenceAt);
    const decisionAt = parseTime(row.decisionAt);
    const labelAvailableAt = parseTime(row.outcome.labelAvailableAt);
    if (![referenceAt, decisionAt, labelAvailableAt, asOf].every(Number.isFinite)) {
      pushIssue(issues, row.rowId, "invalid-time", "A required timestamp is not valid ISO time.");
      rejected.add(row.rowId);
      continue;
    }
    if (!Number.isInteger(row.cutoffSeconds) || row.cutoffSeconds <= 0) {
      pushIssue(issues, row.rowId, "invalid-cutoff", "cutoffSeconds must be a positive integer.");
      rejected.add(row.rowId);
    }
    const expectedDecisionAt = referenceAt + row.cutoffSeconds * 1_000;
    if (Math.abs(decisionAt - expectedDecisionAt) > 1_000) {
      pushIssue(
        issues,
        row.rowId,
        "decision-time-mismatch",
        "decisionAt must equal referenceAt plus cutoffSeconds (±1 second).",
      );
      rejected.add(row.rowId);
    }

    for (const [name, feature] of Object.entries(row.features)) {
      const eventAt = parseTime(feature.eventAt);
      const availableAt = parseTime(feature.availableAt);
      if (!Number.isFinite(eventAt) || !Number.isFinite(availableAt)) {
        pushIssue(issues, row.rowId, "invalid-time", `Feature ${name} has an invalid timestamp.`);
        rejected.add(row.rowId);
        continue;
      }
      if (feature.value !== null && !Number.isFinite(feature.value)) {
        pushIssue(
          issues,
          row.rowId,
          "invalid-feature-value",
          `${name}.value must be finite or null.`,
        );
        rejected.add(row.rowId);
      }
      if (availableAt < eventAt) {
        pushIssue(
          issues,
          row.rowId,
          "availability-before-event",
          `${name}.availableAt precedes its eventAt.`,
        );
        rejected.add(row.rowId);
      }
      if (eventAt > decisionAt) {
        pushIssue(issues, row.rowId, "future-event", `${name}.eventAt is after decisionAt.`);
        rejected.add(row.rowId);
      }
      if (availableAt > decisionAt) {
        pushIssue(
          issues,
          row.rowId,
          "future-availability",
          `${name}.availableAt is after decisionAt.`,
        );
        rejected.add(row.rowId);
      }
      if (feature.taxonomy === "model-output") {
        pushIssue(
          issues,
          row.rowId,
          "model-output-as-input",
          `${name} is a prior model output and cannot be an input feature.`,
        );
        rejected.add(row.rowId);
      }
    }

    if (row.outcome.status !== "matured" || labelAvailableAt > asOf) {
      pushIssue(
        issues,
        row.rowId,
        "immature-label",
        "The label was not matured by datasetAsOf.",
      );
      rejected.add(row.rowId);
    }
    const earliestMaturity = decisionAt + row.outcome.horizonSeconds * 1_000;
    if (labelAvailableAt < earliestMaturity) {
      pushIssue(
        issues,
        row.rowId,
        "label-window-not-mature",
        "labelAvailableAt precedes the end of the declared outcome horizon.",
      );
      rejected.add(row.rowId);
    }
  }

  if (featureSetVersions.size > 1) {
    for (const row of rows) {
      pushIssue(issues, row.rowId, "mixed-feature-set", "Dataset contains multiple feature-set versions.");
      rejected.add(row.rowId);
    }
  }
  if (labelKeys.size > 1) {
    for (const row of rows) {
      pushIssue(issues, row.rowId, "mixed-label", "Dataset contains multiple target definitions.");
      rejected.add(row.rowId);
    }
  }

  return {
    accepted: rows.filter((row) => !rejected.has(row.rowId)),
    rejectedRowIds: [...rejected],
    issues,
    datasetAsOf,
  };
}
