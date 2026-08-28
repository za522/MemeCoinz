import assert from "node:assert/strict";
import test from "node:test";

import {
  COHORT_IMPORT_BATCH_LIMIT,
  RED_PUMP_DATASET,
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
