import type { CoinObservation, StorageState } from "@/lib/coins/types";
import { persistCoinBatch } from "@/lib/ingestion/storage";
import {
  getHeliusTransactionsForAddress,
  getJitoCurrentTipEvidence,
  getSolanaTrackerDeployerTokens,
  getSolanaTrackerHolderChart,
  getSolanaTrackerRiskSnapshot,
  getSolanaTrackerTokenBundlers,
  getSolanaTrackerTokenHolders,
  getSolanaTrackerTokenTrades,
  getXIdentityCounts,
  probeJupiterRoundTrips,
  searchXIdentityPosts,
} from "@/lib/providers";
import {
  getHeliusApiKey,
  getJupiterApiKey,
  getSolanaTrackerApiKey,
  getXBearerToken,
  isMeteredTokenEnrichmentEnabled,
} from "@/lib/providers/config";
import type {
  HeliusAddressHistoryData,
  HeliusHistoricalTransaction,
  JupiterRoundTripProbe,
  ProviderErrorCode,
  ProviderId,
  SolanaTrackerHolderChartData,
  UpstreamResult,
  XPostRecord,
} from "@/lib/providers/types";
import type {
  CollectionProviderResult,
  SolanaTrackerTokenCollectionData,
  TokenCollectionOptions,
  TokenCollectionResponse,
  XTokenCollectionData,
} from "./types";

const TWO_SECONDS_MS = 2_000;

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.round(value ?? fallback)));
}

function skipped<T>(
  providerId: ProviderId,
  startedAt: string,
  configured: boolean,
  meteredEnabled: boolean,
): CollectionProviderResult<T> {
  const completedAt = new Date().toISOString();
  return {
    providerId,
    state: meteredEnabled ? "skipped-not-configured" : "skipped-disabled",
    metered: true,
    configured,
    startedAt,
    completedAt,
    data: null,
    itemsCollected: 0,
    pagesFetched: 0,
    truncated: false,
    errorCode: meteredEnabled ? "not_configured" : "not_supported",
    caveats: [
      meteredEnabled
        ? "The server credential is not configured; no provider request was made."
        : "TOKEN_ENRICHMENT_METERED_ENABLED is false; no metered provider request was made.",
    ],
  };
}

function upstreamResult<T>(
  providerId: ProviderId,
  startedAt: string,
  result: UpstreamResult<T>,
  options: {
    metered: boolean;
    configured: boolean;
    itemCount: (data: T) => number;
    pageCount?: (data: T) => number;
    truncated?: (data: T) => boolean;
    caveats?: (data: T) => string[];
    partial?: (data: T) => boolean;
  },
): CollectionProviderResult<T> {
  if (!result.ok) {
    return {
      providerId,
      state: "failed",
      metered: options.metered,
      configured: options.configured,
      startedAt,
      completedAt: result.checkedAt,
      data: null,
      itemsCollected: 0,
      pagesFetched: 0,
      truncated: false,
      errorCode: result.code,
      caveats: ["The provider call failed; other collectors continue independently."],
    };
  }
  const truncated = options.truncated?.(result.data) ?? false;
  const partial = truncated || (options.partial?.(result.data) ?? false);
  return {
    providerId,
    state: partial ? "partial" : "collected",
    metered: options.metered,
    configured: options.configured,
    startedAt,
    completedAt: result.checkedAt,
    data: result.data,
    itemsCollected: options.itemCount(result.data),
    pagesFetched: options.pageCount?.(result.data) ?? 1,
    truncated,
    errorCode: null,
    caveats: options.caveats?.(result.data) ?? [],
  };
}

function componentError<T>(result: UpstreamResult<T>): ProviderErrorCode | null {
  return result.ok ? null : result.code;
}

async function collectX(
  mint: string,
  options: TokenCollectionOptions,
  maxPages: number,
  meteredEnabled: boolean,
): Promise<CollectionProviderResult<XTokenCollectionData>> {
  const startedAt = new Date().toISOString();
  const configured = Boolean(getXBearerToken());
  if (!meteredEnabled || !configured) {
    return skipped("x-api", startedAt, configured, meteredEnabled);
  }
  const identity = {
    contractAddress: mint,
    fullName: options.identity?.fullName,
    officialUrls: options.identity?.officialUrls,
  };
  const [posts, counts] = await Promise.all([
    searchXIdentityPosts({
      identity,
      startTime: options.from,
      endTime: options.to,
      mode: "auto",
      maxPages,
      maxResults: Math.min(500, maxPages * 100),
    }),
    getXIdentityCounts({
      identity,
      startTime: options.from,
      endTime: options.to,
      mode: "auto",
      maxPages,
      granularity: "minute",
    }),
  ]);
  if (!posts.ok && !counts.ok) {
    return upstreamResult("x-api", startedAt, posts, {
      metered: true,
      configured,
      itemCount: () => 0,
    });
  }
  const data: XTokenCollectionData = {
    posts: posts.ok ? posts.data : null,
    counts: counts.ok ? counts.data : null,
    componentErrors: {
      posts: componentError(posts),
      counts: componentError(counts),
    },
  };
  const completedAt = new Date().toISOString();
  const truncated = Boolean(data.posts?.truncated || data.counts?.truncated);
  const partial = !posts.ok || !counts.ok || truncated;
  return {
    providerId: "x-api",
    state: partial ? "partial" : "collected",
    metered: true,
    configured,
    startedAt,
    completedAt,
    data,
    itemsCollected: (data.posts?.posts.length ?? 0) + (data.counts?.buckets.length ?? 0),
    pagesFetched: (data.posts?.pagesFetched ?? 0) + (data.counts?.pagesFetched ?? 0),
    truncated,
    errorCode: null,
    caveats: [
      ...(data.posts ? [data.posts.caveat] : []),
      "Raw mentions are not credibility-weighted and can be manufactured. Contract, official URL, and full-name matches remain separate identity classes.",
    ],
  };
}

async function collectSolanaTracker(
  mint: string,
  options: TokenCollectionOptions,
  maxPages: number,
  meteredEnabled: boolean,
): Promise<CollectionProviderResult<SolanaTrackerTokenCollectionData>> {
  const startedAt = new Date().toISOString();
  const configured = Boolean(getSolanaTrackerApiKey());
  if (!meteredEnabled || !configured) {
    return skipped("solana-tracker", startedAt, configured, meteredEnabled);
  }
  const [trades, holders, holderChart, bundlers, risk] = await Promise.all([
    getSolanaTrackerTokenTrades(mint, {
      from: options.from,
      to: options.to,
      maxPages,
      pageSize: 100,
    }),
    getSolanaTrackerTokenHolders(mint, { maxPages: Math.min(2, maxPages), pageSize: 250 }),
    getSolanaTrackerHolderChart(mint, {
      from: options.from,
      to: options.to,
      interval: "1m",
    }),
    getSolanaTrackerTokenBundlers(mint),
    getSolanaTrackerRiskSnapshot(mint),
  ]);
  const deployer = risk.ok ? risk.data.deployer : null;
  const deployerHistory = deployer
    ? await getSolanaTrackerDeployerTokens(deployer, {
        maxPages: Math.min(2, maxPages),
        pageSize: 100,
      })
    : null;
  const data: SolanaTrackerTokenCollectionData = {
    trades: trades.ok ? trades.data : null,
    holders: holders.ok ? holders.data : null,
    holderChart: holderChart.ok ? holderChart.data : null,
    bundlers: bundlers.ok ? bundlers.data : null,
    risk: risk.ok ? risk.data : null,
    deployerHistory: deployerHistory?.ok ? deployerHistory.data : null,
    componentErrors: {
      trades: componentError(trades),
      holders: componentError(holders),
      holderChart: componentError(holderChart),
      bundlers: componentError(bundlers),
      risk: componentError(risk),
      deployerHistory: deployerHistory
        ? componentError(deployerHistory)
        : "missing_deployer",
    },
  };
  const errors = Object.values(data.componentErrors).filter(Boolean);
  const truncated = Boolean(
    data.trades?.truncated ||
      data.holders?.truncated ||
      data.deployerHistory?.truncated,
  );
  return {
    providerId: "solana-tracker",
    state: errors.length > 0 || truncated ? "partial" : "collected",
    metered: true,
    configured,
    startedAt,
    completedAt: new Date().toISOString(),
    data,
    itemsCollected:
      (data.trades?.trades.length ?? 0) +
      (data.holders?.holders.length ?? 0) +
      (data.holderChart?.points.length ?? 0) +
      (data.bundlers?.wallets.length ?? 0) +
      (data.deployerHistory?.tokens.length ?? 0) +
      (data.risk ? 1 : 0),
    pagesFetched:
      (data.trades?.pagesFetched ?? 0) +
      (data.holders?.pagesFetched ?? 0) +
      (data.holderChart ? 1 : 0) +
      (data.bundlers ? 1 : 0) +
      (data.risk ? 1 : 0) +
      (data.deployerHistory?.pagesFetched ?? 0),
    truncated,
    errorCode: null,
    caveats: [
      ...(data.trades ? [data.trades.caveat] : []),
      ...(data.holders ? [data.holders.caveat] : []),
      ...(data.holderChart ? [data.holderChart.caveat] : []),
      ...(data.bundlers ? [data.bundlers.caveat] : []),
      ...(data.risk ? [data.risk.caveat] : []),
      ...(data.deployerHistory ? [data.deployerHistory.caveat] : []),
    ],
  };
}

function canonicalAvailability(
  transaction: HeliusHistoricalTransaction,
  retrievedAt: string,
): string {
  if (transaction.blockTime === null) return retrievedAt;
  return new Date(transaction.blockTime * 1_000 + TWO_SECONDS_MS).toISOString();
}

function heliusObservations(
  mint: string,
  provider: CollectionProviderResult<HeliusAddressHistoryData>,
): CoinObservation[] {
  if (!provider.data) return [];
  return provider.data.transactions.map((transaction): CoinObservation => {
    const eventAt = transaction.blockTime === null
      ? provider.completedAt
      : new Date(transaction.blockTime * 1_000).toISOString();
    const availableAt = canonicalAvailability(transaction, provider.completedAt);
    const tokenOwnerDeltas = transaction.tokenBalanceChanges
      .filter((change) => change.mint === mint)
      .map((change) => ({
        owner: change.owner,
        accountIndex: change.accountIndex,
        rawDelta: change.rawDelta,
        uiDelta: change.uiDelta,
      }));
    return {
      id: `${mint}:helius-chain:${transaction.signature}`,
      mint,
      sourceId: "helius",
      observationType: "chain_transaction",
      eventAt,
      observedAt: provider.completedAt,
      availableAt,
      retrievedAt: provider.completedAt,
      slot: transaction.slot,
      transactionIndex: transaction.transactionIndex,
      instructionIndex: null,
      commitment: provider.data?.commitment ?? "finalized",
      canonicalStatus: transaction.success
        ? `${transaction.confirmationStatus ?? provider.data?.commitment ?? "finalized"}-success`
        : `${transaction.confirmationStatus ?? provider.data?.commitment ?? "finalized"}-failed`,
      fidelity: transaction.blockTime === null
        ? "canonical-confirmed"
        : "canonical-reconstructed",
      signature: transaction.signature,
      normalized: {
        kind: "balance-change",
        wallet: null,
        side: null,
        feePayer: transaction.feePayer,
        tokenAmount: null,
        priceUsd: null,
        volumeUsd: null,
        networkAndPriorityFeeUsd: null,
        feeLamports: transaction.feeLamports,
        tokenOwnerDeltas,
        nativeBalanceChanges: transaction.nativeBalanceChanges,
        transactionIndexAvailable: transaction.transactionIndex !== null,
        success: transaction.success,
        availabilityPolicy:
          transaction.blockTime === null
            ? "retrieval-time-only"
            : "block-time-plus-2s-confirmation-assumption-v1",
        availabilityAssumption:
          "The chain event is immutable, but actual historical RPC observation latency was not archived; two seconds is an explicit reconstruction assumption.",
        usdNormalizationMissingReason:
          "No historical as-of SOL/USD join was supplied; current prices are never backdated.",
      },
      nullReason:
        transaction.blockTime === null
          ? "Helius omitted blockTime; eventAt and availableAt use retrieval time."
          : null,
    };
  });
}

function trackerTradeObservations(
  mint: string,
  tracker: CollectionProviderResult<SolanaTrackerTokenCollectionData>,
  helius: CollectionProviderResult<HeliusAddressHistoryData>,
): CoinObservation[] {
  const trades = tracker.data?.trades?.trades ?? [];
  const canonicalBySignature = new Map(
    (helius.data?.transactions ?? []).map((transaction) => [transaction.signature, transaction]),
  );
  return trades.map((trade): CoinObservation => {
    const canonical = canonicalBySignature.get(trade.signature) ?? null;
    return {
      id: `${mint}:tracker-trade:${trade.signature}`,
      mint,
      sourceId: "solana-tracker",
      observationType: "trade",
      eventAt: trade.eventAt,
      observedAt: tracker.completedAt,
      // Even when the signature is canonically reconciled, the USD price and
      // volume are Tracker-derived fields with unknown historical indexing
      // latency. The whole vendor trade row is therefore available only now.
      availableAt: tracker.completedAt,
      retrievedAt: tracker.completedAt,
      slot: canonical?.slot ?? null,
      transactionIndex: canonical?.transactionIndex ?? null,
      instructionIndex: null,
      commitment: canonical?.confirmationStatus ?? null,
      canonicalStatus: canonical
        ? "indexed-trade-canonically-reconciled"
        : "vendor-indexed-unreconciled",
      fidelity: "indexed",
      signature: trade.signature,
      normalized: {
        kind: trade.side ?? "unknown",
        side: trade.side,
        wallet: trade.wallet,
        feePayer: canonical?.feePayer ?? null,
        tokenAmount: trade.tokenAmount,
        priceUsd: trade.priceUsd,
        volumeUsd: trade.volumeUsd,
        volumeSol: trade.volumeSol,
        networkAndPriorityFeeUsd: null,
        feeLamports: canonical?.feeLamports ?? null,
        program: trade.program,
        pools: trade.pools,
        canonicalReconciledBy: canonical ? "helius" : null,
        providerEventAt: trade.eventAt,
        providerAvailabilityCaveat: canonical
          ? "The signature and ledger time were reconciled through Helius, but Tracker-derived USD fields keep retrieval-time availability and are never backdated."
          : "Actual provider indexing latency is unknown; availability is conservatively retrieval time.",
      },
      nullReason: trade.side ? null : "Solana Tracker did not provide a buy/sell side.",
    };
  });
}

function securityFieldObserved(
  data: SolanaTrackerTokenCollectionData,
  field: "mintAuthority" | "freezeAuthority",
): boolean {
  const raw = data.risk?.raw;
  const pools = raw && Array.isArray(raw.pools) ? raw.pools : [];
  return pools.some((pool) => {
    if (typeof pool !== "object" || pool === null || Array.isArray(pool)) return false;
    const security = (pool as Record<string, unknown>).security;
    return typeof security === "object" &&
      security !== null &&
      !Array.isArray(security) &&
      Object.hasOwn(security, field);
  });
}

function trackerSnapshotObservations(
  mint: string,
  tracker: CollectionProviderResult<SolanaTrackerTokenCollectionData>,
): CoinObservation[] {
  const data = tracker.data;
  if (!data) return [];
  const observations: CoinObservation[] = [];
  const holders = data.holders;
  const risk = data.risk;
  if (holders) {
    const mintAuthorityObserved = securityFieldObserved(data, "mintAuthority");
    const freezeAuthorityObserved = securityFieldObserved(data, "freezeAuthority");
    const balances = holders.holders.flatMap((holder) =>
      holder.percentage === null
        ? []
        : [{ ownerWallet: holder.wallet, sharePct: holder.percentage }],
    );
    observations.push({
      id: `${mint}:tracker-holder:${holders.asOf}`,
      mint,
      sourceId: "solana-tracker",
      observationType: "holder_snapshot",
      eventAt: holders.asOf,
      observedAt: holders.asOf,
      availableAt: holders.asOf,
      retrievedAt: tracker.completedAt,
      slot: null,
      transactionIndex: null,
      instructionIndex: null,
      commitment: null,
      canonicalStatus: "vendor-current",
      fidelity: "indexed",
      signature: null,
      normalized: {
        holderCount: holders.totalHolders,
        balances,
        creatorSharePct: risk?.developerPercentage ?? null,
        ownerResolutionCoveragePct: balances.reduce((sum, row) => sum + row.sharePct, 0),
        mintAuthorityRevoked: mintAuthorityObserved ? risk?.mintAuthority === null : null,
        freezeAuthorityRevoked: freezeAuthorityObserved ? risk?.freezeAuthority === null : null,
        metadataMutable: null,
        snapshotTruncated: holders.truncated,
        beneficiaryResolutionWarning:
          "Wallet addresses are not resolved to beneficial owners; shared exchanges and bots remain possible.",
      },
      nullReason: holders.totalHolders === null
        ? "Solana Tracker did not return total holder count."
        : null,
    });
  }
  const holderChart = data.holderChart;
  if (holderChart) {
    for (const point of holderChart.points) {
      observations.push(holderChartObservation(mint, point, holderChart, tracker.completedAt));
    }
  }
  if (risk) {
    observations.push({
      id: `${mint}:tracker-risk:${risk.asOf}`,
      mint,
      sourceId: "solana-tracker",
      observationType: "risk_snapshot",
      eventAt: risk.asOf,
      observedAt: risk.asOf,
      availableAt: risk.asOf,
      retrievedAt: tracker.completedAt,
      slot: null,
      transactionIndex: null,
      instructionIndex: null,
      commitment: null,
      canonicalStatus: "vendor-current-classification",
      fidelity: "indexed",
      signature: null,
      normalized: {
        score:
          risk.score === null
            ? null
            : risk.score <= 10
              ? risk.score * 10
              : risk.score,
        providerScore: risk.score,
        normalizedScoreScale: "0-100",
        rugged: risk.rugged,
        deployer: risk.deployer,
        mintAuthority: risk.mintAuthority,
        freezeAuthority: risk.freezeAuthority,
        topTenPercentage: risk.topTenPercentage,
        developerPercentage: risk.developerPercentage,
        insiderPercentage: risk.insiderPercentage,
        sniperPercentage: risk.sniperPercentage,
        bundlerCount: risk.bundlerCount,
        bundlerPercentage: risk.bundlerPercentage,
        factors: risk.factors,
        classificationCaveat: risk.caveat,
      },
      nullReason: null,
    });
  }
  const bundlers = data.bundlers;
  if (bundlers) {
    observations.push({
      id: `${mint}:tracker-coordination:${bundlers.asOf}`,
      mint,
      sourceId: "solana-tracker",
      observationType: "coordination_snapshot",
      eventAt: bundlers.asOf,
      observedAt: bundlers.asOf,
      availableAt: bundlers.asOf,
      retrievedAt: tracker.completedAt,
      slot: null,
      transactionIndex: null,
      instructionIndex: null,
      commitment: null,
      canonicalStatus: "vendor-current-classification",
      fidelity: "indexed",
      signature: null,
      normalized: {
        bundlerCount: bundlers.count,
        totalBalance: bundlers.totalBalance,
        totalPercentage: bundlers.totalPercentage,
        totalInitialBalance: bundlers.totalInitialBalance,
        totalInitialPercentage: bundlers.totalInitialPercentage,
        wallets: bundlers.wallets,
        probabilisticEvidenceOnly: true,
        classificationCaveat: bundlers.caveat,
      },
      nullReason: null,
    });
  }
  const creatorHistory = data.deployerHistory;
  if (creatorHistory && risk?.deployer) {
    const priorTokens = creatorHistory.tokens.filter((token) => token.mint !== mint);
    observations.push({
      id: `${mint}:tracker-creator:${creatorHistory.asOf}`,
      mint,
      sourceId: "solana-tracker",
      observationType: "creator_snapshot",
      eventAt: creatorHistory.asOf,
      observedAt: creatorHistory.asOf,
      availableAt: creatorHistory.asOf,
      retrievedAt: tracker.completedAt,
      slot: null,
      transactionIndex: null,
      instructionIndex: null,
      commitment: null,
      canonicalStatus: "vendor-current-attribution",
      fidelity: "indexed",
      signature: null,
      normalized: {
        creatorWallet: risk.deployer,
        currentSharePct: risk.developerPercentage,
        cumulativeNetSoldUsd: null,
        cumulativeFeeExtractionUsd: null,
        priorLaunchCount: priorTokens.length,
        priorGraduationCount: priorTokens.filter((token) => token.graduated).length,
        priorTwentyFourHourSurvivorCount: null,
        historyTruncated: creatorHistory.truncated,
        attributionCaveat: creatorHistory.caveat,
      },
      nullReason: creatorHistory.truncated
        ? "Deployer history was page-bounded; prior launch totals are lower bounds."
        : null,
    });
  }
  return observations;
}

function holderChartObservation(
  mint: string,
  point: SolanaTrackerHolderChartData["points"][number],
  chart: SolanaTrackerHolderChartData,
  retrievedAt: string,
): CoinObservation {
  return {
    id: `${mint}:tracker-holder-chart:${point.eventAt}`,
    mint,
    sourceId: "solana-tracker",
    observationType: "holder_snapshot",
    eventAt: point.eventAt,
    observedAt: retrievedAt,
    availableAt: retrievedAt,
    retrievedAt,
    slot: null,
    transactionIndex: null,
    instructionIndex: null,
    commitment: null,
    canonicalStatus: "vendor-historical-retrieved-now",
    fidelity: "indexed",
    signature: null,
    normalized: {
      holderCount: point.holderCount,
      balances: [],
      creatorSharePct: null,
      ownerResolutionCoveragePct: 0,
      mintAuthorityRevoked: null,
      freezeAuthorityRevoked: null,
      metadataMutable: null,
      historicalSeriesCaveat: chart.caveat,
    },
    nullReason:
      "Only historical holder count was returned; owner balances and original vendor availability time are unavailable.",
  };
}

function engagementCount(post: XPostRecord): number | null {
  const values = [
    post.publicMetrics.retweetCount,
    post.publicMetrics.replyCount,
    post.publicMetrics.likeCount,
    post.publicMetrics.quoteCount,
    post.publicMetrics.bookmarkCount,
  ];
  return values.every((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function xObservations(
  mint: string,
  provider: CollectionProviderResult<XTokenCollectionData>,
): CoinObservation[] {
  if (!provider.data) return [];
  const posts = (provider.data.posts?.posts ?? []).flatMap((post): CoinObservation[] => {
    const identityMatch = post.identityMatches.includes("exact-contract")
      ? "exact-contract"
      : post.identityMatches.includes("official-url")
        ? "official-url"
        : post.identityMatches.includes("full-name")
          ? "full-name"
          : null;
    if (!identityMatch) return [];
    return [{
      id: `${mint}:x-post:${post.id}`,
      mint,
      sourceId: "x-api",
      observationType: "social_post",
      eventAt: post.createdAt,
      observedAt: provider.completedAt,
      // Archive search proves publication time, not when this application or
      // X's search index first exposed the row. Retrieval-time availability
      // prevents a backfill from masquerading as a live historical signal.
      availableAt: provider.completedAt,
      retrievedAt: provider.completedAt,
      slot: null,
      transactionIndex: null,
      instructionIndex: null,
      commitment: null,
      canonicalStatus: "platform-post-indexed",
      fidelity: "indexed",
      signature: null,
      normalized: {
        platformPostId: post.id,
        authorId: post.authorId ?? "unknown",
        identityMatch,
        automatedLikelihood0To1: null,
        sentimentMinus1To1: null,
        authorFollowers: null,
        authorVerified: null,
        engagementCount: null,
        narrativeClusterId: null,
        narrativeNovelty0To100: null,
        text: post.text,
        lang: post.lang,
        currentEngagementCount: engagementCount(post),
        currentEngagementObservedAt: post.publicMetricsObservedAt,
        currentAuthorFollowers: post.author?.followersCount ?? null,
        currentAuthorVerified: post.author?.verified ?? null,
        currentAuthorProfileObservedAt: post.author?.profileObservedAt ?? null,
        mutableMetricsExcludedFromHistoricalFeatureFields: true,
        availabilityPolicy: "retrieval-time-for-archive-and-recent-search-v1",
      },
      nullReason: null,
    }];
  });
  const counts = (provider.data.counts?.buckets ?? []).map((bucket): CoinObservation => ({
    id: `${mint}:x-count:${bucket.start}:${bucket.end}`,
    mint,
    sourceId: "x-api",
    observationType: "social_count",
    eventAt: bucket.end,
    observedAt: provider.completedAt,
    availableAt: provider.completedAt,
    retrievedAt: provider.completedAt,
    slot: null,
    transactionIndex: null,
    instructionIndex: null,
    commitment: null,
    canonicalStatus: "platform-aggregate-indexed",
    fidelity: "indexed",
    signature: null,
    normalized: {
      bucketStart: bucket.start,
      bucketEnd: bucket.end,
      postCount: bucket.postCount,
      query: provider.data?.counts?.query ?? null,
      granularity: provider.data?.counts?.granularity ?? null,
      identityClasses: provider.data?.counts?.identityClasses ?? ["exact-contract"],
      manipulationCaveat: "Post volume can be manufactured and is not a credibility score.",
      availabilityPolicy: "retrieval-time-for-post-counts-v1",
    },
    nullReason: null,
  }));
  return [...posts, ...counts];
}

function quoteObservation(
  probe: JupiterRoundTripProbe,
  side: "buy" | "sell",
): CoinObservation | null {
  const quote = side === "buy" ? probe.buy : probe.sell;
  if (!quote) return null;
  const expectedValueUsd = side === "sell"
    ? probe.expectedRoundTripUsd
    : quote.routeAvailable
      ? probe.orderSizeUsd
      : null;
  return {
    id: `${probe.mint}:jupiter-quote:${probe.orderSizeUsd}:${side}:${quote.completedAt}`,
    mint: probe.mint,
    sourceId: "jupiter",
    observationType: "execution_quote",
    eventAt: quote.completedAt,
    observedAt: quote.completedAt,
    availableAt: quote.completedAt,
    retrievedAt: quote.completedAt,
    slot: quote.contextSlot,
    transactionIndex: null,
    instructionIndex: null,
    commitment: null,
    canonicalStatus: "read-only-current-quote",
    fidelity: "market-derived",
    signature: null,
    normalized: {
      side,
      orderSizeUsd: probe.orderSizeUsd,
      routeAvailable: quote.routeAvailable,
      priceImpactPct: quote.priceImpactPct,
      networkAndPriorityFeeUsd: null,
      expectedValueUsd,
      latencyMs: quote.latencyMs,
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      otherAmountThreshold: quote.otherAmountThreshold,
      slippageBps: probe.slippageBps,
      routePlan: quote.routePlan,
      endpointMode: probe.endpointMode,
      failureCode: quote.failureCode,
      currentOnly: true,
      executionCaveat: probe.caveat,
    },
    nullReason: quote.routeAvailable
      ? null
      : `Jupiter returned no usable ${side} route (${quote.failureCode ?? "unknown"}).`,
  };
}

export function jupiterProbeObservations(
  probes: JupiterRoundTripProbe[],
): CoinObservation[] {
  return probes.flatMap((probe) => [
    quoteObservation(probe, "buy"),
    quoteObservation(probe, "sell"),
  ].filter((observation): observation is CoinObservation => observation !== null));
}

function jupiterQuoteObservations(
  provider: CollectionProviderResult<JupiterRoundTripProbe[]>,
): CoinObservation[] {
  return jupiterProbeObservations(provider.data ?? []);
}

function jitoObservations(
  mint: string,
  provider: TokenCollectionResponse["providers"]["jito"],
): CoinObservation[] {
  const data = provider.data;
  if (!data) return [];
  const eventAt = data.latestTipFloor?.eventAt ?? data.observedAt;
  return [{
    id: `${mint}:jito-tip-context:${data.observedAt}`,
    mint,
    sourceId: "jito",
    observationType: "jito_tip_context",
    eventAt,
    observedAt: data.observedAt,
    availableAt: data.observedAt,
    retrievedAt: provider.completedAt,
    slot: null,
    transactionIndex: null,
    instructionIndex: null,
    commitment: null,
    canonicalStatus: "public-current-network-context",
    fidelity: "market-derived",
    signature: null,
    normalized: {
      tipAccounts: data.tipAccounts,
      latestTipFloor: data.latestTipFloor,
      globalNetworkContextOnly: true,
      bundleMembership: null,
      historicalBundleCoverage: "unavailable",
      caveat: data.caveat,
    },
    nullReason: null,
  }];
}

function deduplicate(observations: CoinObservation[]): CoinObservation[] {
  return observations.filter(
    (observation, index, rows) =>
      rows.findIndex((candidate) => candidate.id === observation.id) === index,
  );
}

function noPersistence(reason: string): StorageState {
  return {
    state: "read-only",
    reason,
    assetsWritten: 0,
    observationsWritten: 0,
  };
}

/**
 * Collect all currently implemented research inputs for one mint. Provider
 * failures are isolated. No scraper, transaction builder, signer, or sender is
 * invoked anywhere in this service.
 */
export async function collectTokenResearchInputs(
  mint: string,
  options: TokenCollectionOptions,
): Promise<TokenCollectionResponse> {
  const maxPages = boundedInteger(options.maxPages, 2, 5);
  const meteredEnabled = Boolean(
    options.allowMetered === true && isMeteredTokenEnrichmentEnabled(),
  );
  const heliusStartedAt = new Date().toISOString();
  const heliusConfigured = Boolean(getHeliusApiKey());
  const heliusPromise: Promise<CollectionProviderResult<HeliusAddressHistoryData>> =
    !meteredEnabled || !heliusConfigured
      ? Promise.resolve(skipped("helius", heliusStartedAt, heliusConfigured, meteredEnabled))
      : getHeliusTransactionsForAddress(mint, {
          from: options.from,
          to: options.to,
          commitment: "finalized",
          maxPages,
          maxTransactions: Math.min(500, maxPages * 100),
          tokenAccounts: "none",
        }).then((result) => upstreamResult("helius", heliusStartedAt, result, {
          metered: true,
          configured: true,
          itemCount: (data) => data.transactions.length,
          pageCount: (data) => data.pagesFetched,
          truncated: (data) => data.truncated,
          caveats: (data) => [data.caveat],
        }));

  const jupiterStartedAt = new Date().toISOString();
  const jitoStartedAt = new Date().toISOString();
  const [helius, solanaTracker, x, jupiterRaw, jitoRaw] = await Promise.all([
    heliusPromise,
    collectSolanaTracker(mint, options, maxPages, meteredEnabled),
    collectX(mint, options, maxPages, meteredEnabled),
    probeJupiterRoundTrips(mint, {
      orderSizesUsd: options.orderSizesUsd,
      slippageBps: options.slippageBps,
      allowMeteredCredential: meteredEnabled,
    }),
    getJitoCurrentTipEvidence(),
  ]);
  const jupiter = upstreamResult("jupiter", jupiterStartedAt, jupiterRaw, {
    metered: Boolean(meteredEnabled && getJupiterApiKey()),
    configured: true,
    itemCount: (data) => data.reduce(
      (count, probe) => count + 1 + (probe.sell ? 1 : 0),
      0,
    ),
    partial: (data) => data.some(
      (probe) => !probe.buy.routeAvailable || !probe.sell?.routeAvailable,
    ),
    caveats: (data) => data[0] ? [data[0].caveat] : [],
  });
  const jito = upstreamResult("jito", jitoStartedAt, jitoRaw, {
    metered: false,
    configured: true,
    itemCount: (data) => data.tipAccounts.length + (data.latestTipFloor ? 1 : 0),
    partial: (data) => !data.availability.tipAccounts || !data.availability.tipFloor,
    caveats: (data) => [data.caveat],
  });
  const coinObservations = deduplicate([
    ...heliusObservations(mint, helius),
    ...trackerTradeObservations(mint, solanaTracker, helius),
    ...trackerSnapshotObservations(mint, solanaTracker),
    ...xObservations(mint, x),
    ...jupiterQuoteObservations(jupiter),
    ...jitoObservations(mint, jito),
  ]);
  const persistence = options.persistCoin
    ? await persistCoinBatch([options.persistCoin], coinObservations)
    : noPersistence(
        "No existing coin row was supplied. Observations are returned but persistence is not claimed; pass persistCoin from getCoinDetail to use the existing ingestion storage path.",
      );
  const providers = { helius, solanaTracker, x, jupiter, jito };
  const warnings = Object.values(providers).flatMap((provider) => {
    if (provider.state === "collected") return [];
    return [
      `${provider.providerId}: ${provider.state}; ${provider.caveats[0] ?? "see provider status"}`,
    ];
  });
  if (persistence.state !== "written") {
    warnings.push(`persistence: ${persistence.reason ?? persistence.state}`);
  }
  return {
    schemaVersion: "memetrace-token-collection/v1",
    mint,
    generatedAt: new Date().toISOString(),
    window: {
      from: options.from,
      to: options.to,
      endExclusive: true,
      maxPagesPerProvider: maxPages,
    },
    policy: {
      scraping: "disabled",
      trading: "disabled",
      transactionSubmission: "disabled",
      meteredProvidersEnabled: meteredEnabled,
      note:
        "Metered X, Helius, Solana Tracker, and keyed Jupiter calls require explicit caller authorization, the global gate, and a server credential. Jupiter public-lite and Jito read-only probes may run without them.",
    },
    providers,
    coinObservations,
    persistence,
    warnings,
  };
}
