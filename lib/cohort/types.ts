export type CohortObservedStatus =
  | "confirmed-fast-graduation"
  | "right-censored"
  | "without-published-outcome";

export interface CohortImportRow {
  mint: string;
  createdAtMs: number;
  seenAtMs: number;
  name: string | null;
  symbol: string | null;
  initialMarketCapSol: number | null;
  hasX: boolean;
  hasWebsite: boolean;
  hasTelegram: boolean;
  descriptionLength: number;
  observedStatus: -1 | 0 | 1;
  observedGraduationAtMs: number | null;
  observedGraduationMinutes: number | null;
}
export interface CohortManifestStatus {
  datasetId: string;
  datasetVersion: string;
  status: "not-imported" | "importing" | "ready" | "failed-validation";
  source: {
    versionDoi: string;
    sourceUrl: string;
    licenseId: string;
    windowStart: string;
    windowEnd: string;
    rawFilesStored: boolean;
  };
  counts: {
    launches: number;
    confirmedFastGraduations: number;
    rightCensored: number;
    withoutPublishedOutcome: number;
  };
  expectedCounts: {
    launches: number;
    confirmedFastGraduations: number;
    rightCensored: number;
    withoutPublishedOutcome: number;
  };
  labelPolicy: string;
  knownLimitation: string;
  importedAt: string | null;
  updatedAt: string | null;
}

export interface CohortLaunchListItem {
  mint: string;
  name: string | null;
  symbol: string | null;
  createdAt: string;
  firstObservedAt: string;
  initialMarketCapSol: number | null;
  hasX: boolean;
  hasWebsite: boolean;
  hasTelegram: boolean;
  descriptionLength: number;
  observedStatus: CohortObservedStatus;
  observedGraduationAt: string | null;
  observedGraduationMinutes: number | null;
}

export interface CohortLaunchesResponse {
  generatedAt: string;
  dataset: CohortManifestStatus;
  launches: CohortLaunchListItem[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}
