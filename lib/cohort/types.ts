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

export interface CohortFeatureImportRow {
  mint: string;
  featureSetVersion: string;
  normalizedName: string;
  normalizedSymbol: string;
  narrativeTheme: string;
  narrativeTokens: string[];
  themeConfidence0To100: number;
  metadataCompleteness0To100: number;
  socialLinkCount: number;
  nameReusePrior24h: number;
  symbolReusePrior24h: number;
  themeLaunchesPrior1h: number;
  themeLaunchesPrior24h: number;
  themeMomentumRatio: number | null;
  launchesPrior5m: number;
  launchesPrior1h: number;
  narrativeNovelty0To100: number;
  copyPressure0To100: number;
  observationLagMs: number;
  computedAt: string;
}

export interface CohortCalculatedFeatures {
  featureSetVersion: string;
  narrativeTheme: string;
  narrativeTokens: string[];
  themeConfidence0To100: number;
  metadataCompleteness0To100: number;
  socialLinkCount: number;
  nameReusePrior24h: number;
  symbolReusePrior24h: number;
  themeLaunchesPrior1h: number;
  themeLaunchesPrior24h: number;
  themeMomentumRatio: number | null;
  launchesPrior5m: number;
  launchesPrior1h: number;
  narrativeNovelty0To100: number;
  copyPressure0To100: number;
  observationLagMs: number;
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
  calculated: CohortCalculatedFeatures | null;
}

export interface CohortLaunchesResponse {
  generatedAt: string;
  dataset: CohortManifestStatus;
  launches: CohortLaunchListItem[];
  calculatedCoverage: {
    featureSetVersion: string;
    rows: number;
    pct: number;
    status: "not-calculated" | "partial" | "complete";
    meaning: string;
  };
  featureAssociations: {
    method: string;
    rows: Array<{
      dimension: string;
      bucket: string;
      launches: number;
      confirmedFastGraduations: number;
      lowerBoundRatePct: number;
    }>;
  };
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}
