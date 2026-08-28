export const RED_PUMP_DATASET = {
  id: "red-pump-2026-v1",
  version: "1.4-corrigendum",
  conceptDoi: "10.5281/zenodo.20633486",
  versionDoi: "10.5281/zenodo.21923106",
  licenseId: "CC-BY-4.0",
  sourceUrl: "https://zenodo.org/records/21923106",
  sourceWindowStart: "2026-05-08",
  sourceWindowEnd: "2026-06-10",
  launchesFile: {
    name: "red_pump_2026_v1_launches.jsonl.gz",
    bytes: 47_910_391,
    sha256: "042940379e8c897ac97403e6b25a5b302fb32b6902a8fc0cef4ab70ac11e8f84",
  },
  outcomesFile: {
    name: "red_pump_2026_v1_outcomes.csv.gz",
    bytes: 43_624_372,
    sha256: "c0a327ea442d91c6f970b2bad9a2a9b778e163d8c3eb38f71eccd3e92209a974",
  },
  expected: {
    launches: 860_194,
    confirmedFastGraduations: 1_651,
    rightCensored: 831_290,
    withoutPublishedOutcome: 27_253,
  },
  labelPolicy:
    "GRADUATED is a confirmed observer event in the source's short visibility regime. TIMEOUT is right-censored and is never a negative or 24-hour outcome label.",
  knownLimitation:
    "The source repeatedly polled a rolling top-50 Pump.fun endpoint. Median visibility was about 2.77 minutes, so the corpus is a launch census with confirmed fast graduations—not complete 24-hour outcomes or transaction-level point-in-time history.",
} as const;
export const COHORT_IMPORT_BATCH_LIMIT = 1_000;
export const COHORT_PUBLIC_PAGE_LIMIT = 100;

export const OBSERVED_STATUS = {
  withoutPublishedOutcome: -1,
  rightCensored: 0,
  confirmedFastGraduation: 1,
} as const;
