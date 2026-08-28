import assert from "node:assert/strict";
import test from "node:test";

import {
  COHORT_IMPORT_BATCH_LIMIT,
  RED_PUMP_DATASET,
  parseCohortFeatureAggregateRows,
  parseCohortFeatureRows,
  parseCohortImportRows,
} from "../lib/cohort/index";

const mint = "11111111111111111111111111111111";
const row = {
  mint,
  createdAtMs: Date.parse("2026-05-08T00:00:00.000Z"),
  seenAtMs: Date.parse("2026-05-08T00:00:12.000Z"),
  name: "Example",
  symbol: "EX",
  initialMarketCapSol: 30,
  hasX: true,
  hasWebsite: false,
  hasTelegram: true,
  descriptionLength: 120,
  observedStatus: 1,
  observedGraduationAtMs: Date.parse("2026-05-08T00:02:00.000Z"),
  observedGraduationMinutes: 2,
};

test("frozen cohort constants retain the corrected published counts", () => {
  assert.deepEqual(RED_PUMP_DATASET.expected, {
    launches: 860_194,
    confirmedFastGraduations: 1_651,
    rightCensored: 831_290,
    withoutPublishedOutcome: 27_253,
  });
  assert.match(RED_PUMP_DATASET.labelPolicy, /right-censored/);
  assert.doesNotMatch(RED_PUMP_DATASET.labelPolicy, /negative label/i);
});
test("a complete confirmed fast-graduation row is accepted", () => {
  const result = parseCohortImportRows([row]);
  assert.equal(result.error, null);
  assert.deepEqual(result.rows, [row]);
});

test("right-censored rows cannot smuggle in a graduation value", () => {
  const result = parseCohortImportRows([{
    ...row,
    observedStatus: 0,
  }]);
  assert.match(result.error ?? "", /cannot contain graduation values/);
});

test("unobserved rows remain distinct from negative labels", () => {
  const result = parseCohortImportRows([{
    ...row,
    observedStatus: -1,
    observedGraduationAtMs: null,
    observedGraduationMinutes: null,
  }]);
  assert.equal(result.error, null);
  assert.equal(result.rows[0]?.observedStatus, -1);
});

test("batch size and exact 32-byte base58 mint are enforced", () => {
  assert.match(parseCohortImportRows([]).error ?? "", /1–1000/);
  assert.match(
    parseCohortImportRows(new Array(COHORT_IMPORT_BATCH_LIMIT + 1).fill(row)).error ?? "",
    /1–1000/,
  );
  assert.match(parseCohortImportRows([{ ...row, mint: "not-a-mint" }]).error ?? "", /base58/);
});

test("calculated cohort rows require bounded, versioned research features", () => {
  const feature = {
    mint,
    featureSetVersion: "red-pump-metadata-v1",
    normalizedName: "example",
    normalizedSymbol: "ex",
    narrativeTheme: "other",
    narrativeTokens: [],
    themeConfidence0To100: 20,
    metadataCompleteness0To100: 75,
    socialLinkCount: 2,
    nameReusePrior24h: 0,
    symbolReusePrior24h: 3,
    themeLaunchesPrior1h: 12,
    themeLaunchesPrior24h: 300,
    themeMomentumRatio: 0.96,
    launchesPrior5m: 54,
    launchesPrior1h: 620,
    narrativeNovelty0To100: 80,
    copyPressure0To100: 16,
    observationLagMs: 4_000,
    computedAt: "2026-08-29T00:00:00.000Z",
  };
  assert.equal(parseCohortFeatureRows([feature]).error, null);
  assert.match(
    parseCohortFeatureRows([{ ...feature, narrativeNovelty0To100: 101 }]).error ?? "",
    /0 to 100/,
  );
});

test("descriptive association imports require internally consistent denominators", () => {
  const aggregate = {
    featureSetVersion: "red-pump-metadata-v1",
    dimension: "social_link_count",
    bucket: "3",
    bucketOrder: 3,
    launches: 100,
    confirmedFastGraduations: 2,
    rightCensored: 90,
    withoutPublishedOutcome: 8,
    lowerBoundRatePct: 2,
    computedAt: "2026-08-29T00:00:00.000Z",
  };
  assert.equal(parseCohortFeatureAggregateRows([aggregate]).error, null);
  assert.match(
    parseCohortFeatureAggregateRows([{ ...aggregate, launches: 99 }]).error ?? "",
    /sum to launches/,
  );
});
