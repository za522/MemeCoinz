"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- vinext 1.0.0-beta.2's Next Link prefetch shim throws in production; these anchors retain URL-addressable routes and client-side interception. */

import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CoinListItem,
  CoinsListResponse,
} from "@/lib/coins/types";
import type { ReferenceClock } from "@/lib/model";
import type { CoinResearchResponse } from "@/lib/research-pipeline";
import {
  GLOSSARY_CATEGORIES,
  RELEASE_NOTES,
  type GlossaryCategory,
} from "@/lib/documentation";
import { FULL_GLOSSARY_TERMS } from "@/lib/glossary-full";
import {
  RESEARCH_CUTOFFS,
  type CutoffLabel,
} from "@/lib/research";
import type {
  DexPairSnapshot,
  ProviderConnectionState,
  ProviderId,
  ProviderRegistryEntry,
  SourceRegistryResponse,
  TokenEnrichmentResponse,
} from "@/lib/providers/types";

export type AppScreen = "coins" | "report" | "methods";
type LookupState = "idle" | "loading" | "success" | "error";
type CoinFeedState = "loading" | "ready" | "error";

interface ResearchConsoleProps {
  initialScreen?: AppScreen;
  initialTerm?: string;
}

const PRIMARY_NAV: Array<{ id: AppScreen; label: string }> = [
  { id: "coins", label: "Coins" },
  { id: "report", label: "Coin report" },
  { id: "methods", label: "Data & methods" },
];

const CUTOFF_SECONDS: Record<CutoffLabel, 30 | 60 | 300 | 900 | 3600> = {
  "30s": 30,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
};

const TOKEN_LOOKUP_PROVIDER_IDS: readonly ProviderId[] = [
  "solana-rpc",
  "dex-screener",
  "jupiter",
  "helius",
  "solana-tracker",
  "x-api",
];

const PROVIDER_SHORT_LABELS: Partial<Record<ProviderId, string>> = {
  "solana-rpc": "Solana RPC",
  "dex-screener": "DEX Screener",
  jupiter: "Jupiter",
  helius: "Helius",
  "solana-tracker": "Solana Tracker",
};

const PROVIDER_STATE_LABELS: Record<ProviderConnectionState, string> = {
  connected: "Connected",
  degraded: "Unavailable now",
  "configured-unverified": "Configured, unchecked",
  "not-configured": "Needs a server key",
  "manual-only": "Manual reference",
  disabled: "Disabled by policy",
};

const COVERAGE_LABELS: Record<ProviderRegistryEntry["historicalCoverage"], string> = {
  "canonical-archive": "Archive, provider-dependent",
  "vendor-archive": "Vendor archive",
  mixed: "Mixed coverage",
  "live-only": "Current only",
  none: "No automated history",
};

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function formatUsd(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${formatNumber(value, digits)}%`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function shortAddress(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function formatAge(value: string | null, now: number) {
  if (!value) return "Unknown";
  const elapsed = Math.max(0, Math.floor((now - Date.parse(value)) / 1_000));
  if (!Number.isFinite(elapsed)) return "Unknown";
  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3_600) return `${Math.floor(elapsed / 60)}m`;
  if (elapsed < 86_400) return `${Math.floor(elapsed / 3_600)}h`;
  return `${Math.floor(elapsed / 86_400)}d`;
}

function formatCutoffSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${seconds / 60}m`;
  return `${seconds / 3_600}h`;
}

function coinDisplayName(coin: CoinListItem) {
  return coin.name?.trim() || "Unnamed token";
}

function coinDisplaySymbol(coin: CoinListItem) {
  return coin.symbol?.trim() || "?";
}

function stageLabel(coin: CoinListItem) {
  if (coin.lifecycle.stage === "bonding") return "Bonding";
  if (coin.lifecycle.stage === "graduated") return "Graduated";
  if (coin.lifecycle.stage === "pool") return "DEX pool";
  return "Stage unknown";
}

function matchingDexPair(
  enrichment: TokenEnrichmentResponse | null,
  requireBaseToken = false,
): DexPairSnapshot | null {
  const pairs = enrichment?.providers.dexScreener.data?.pairs ?? [];
  const matches = pairs.filter((pair) => (
    pair.baseToken.address === enrichment?.mint ||
    (!requireBaseToken && pair.quoteToken.address === enrichment?.mint)
  ));
  return matches.sort(
    (left, right) => (right.liquidityUsd ?? -1) - (left.liquidityUsd ?? -1),
  )[0] ?? null;
}

function currentIdentity(enrichment: TokenEnrichmentResponse) {
  const pair = matchingDexPair(enrichment);
  const dexIdentity = pair?.baseToken.address === enrichment.mint
    ? pair.baseToken
    : pair?.quoteToken.address === enrichment.mint
      ? pair.quoteToken
      : null;
  const helius = enrichment.providers.helius.data?.id === enrichment.mint
    ? enrichment.providers.helius.data
    : null;
  const tracker = enrichment.providers.solanaTracker.data?.mint === enrichment.mint
    ? enrichment.providers.solanaTracker.data
    : null;
  return {
    name: helius?.name ?? tracker?.name ?? dexIdentity?.name ?? "Solana token",
    symbol: helius?.symbol ?? tracker?.symbol ?? dexIdentity?.symbol ?? "Unknown ticker",
  };
}

function lookupRegistryCoverage(registry: SourceRegistryResponse | null) {
  const sources = registry?.sources.filter((source) => (
    TOKEN_LOOKUP_PROVIDER_IDS.includes(source.id)
  )) ?? [];
  return {
    connected: sources.filter((source) => source.status.state === "connected").length,
    total: TOKEN_LOOKUP_PROVIDER_IDS.length,
  };
}

function navigateClient(
  event: MouseEvent<HTMLAnchorElement>,
  nextScreen: AppScreen,
  setScreen: (screen: AppScreen) => void,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) return;
  event.preventDefault();
  setScreen(nextScreen);
  updateScreenUrl(nextScreen);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function updateScreenUrl(nextScreen: AppScreen, mint?: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.set("screen", nextScreen);
  if (nextScreen !== "methods") url.searchParams.delete("term");
  if (nextScreen === "report" && mint) url.searchParams.set("mint", mint);
  if (nextScreen !== "report" || mint === null) url.searchParams.delete("mint");
  const nextUrl = `${url.pathname}${url.search}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl !== currentUrl) window.history.pushState(null, "", nextUrl);
}

function screenFromLocation(): AppScreen {
  const requested = new URLSearchParams(window.location.search).get("screen");
  return PRIMARY_NAV.some((item) => item.id === requested)
    ? requested as AppScreen
    : "coins";
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function SourceState({ state }: { state: ProviderConnectionState }) {
  return (
    <span className={`source-state source-state-${state}`}>
      <span aria-hidden="true" />
      {PROVIDER_STATE_LABELS[state]}
    </span>
  );
}

function ScreenHeading({
  section,
  title,
  description,
}: {
  section: string;
  title: string;
  description: string;
}) {
  return (
    <header className="screen-heading">
      <span className="kicker">{section}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function LookupProviderRow({
  label,
  state,
  value,
}: {
  label: string;
  state: ProviderConnectionState;
  value: string;
}) {
  return (
    <li>
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <SourceState state={state} />
    </li>
  );
}

function CurrentLookupResult({
  enrichment,
  onOpen,
}: {
  enrichment: TokenEnrichmentResponse;
  onOpen: () => void;
}) {
  const pair = matchingDexPair(enrichment, true);
  const matchingPairs = enrichment.providers.dexScreener.data?.pairs.filter(
    (candidate) => (
      candidate.baseToken.address === enrichment.mint ||
      candidate.quoteToken.address === enrichment.mint
    ),
  ) ?? [];
  const dexAvailability = enrichment.providers.dexScreener.data?.availability;
  const identity = currentIdentity(enrichment);
  const price = enrichment.providers.jupiter.data?.usdPrice ?? pair?.priceUsd;
  const returned = Object.values(enrichment.providers).filter(
    (provider) => provider.data !== null,
  ).length;
  const confirmed = enrichment.confirmation.confirmed;
  const confirmationSources = enrichment.confirmation.confirmingProviderIds
    .map((providerId) => PROVIDER_SHORT_LABELS[providerId] ?? providerId)
    .join(", ");

  return (
    <section className="lookup-result" aria-labelledby="lookup-result-title">
      <div className="result-heading">
        <div>
          <span className={`truth-label ${confirmed ? "truth-live" : "truth-unconfirmed"}`}>
            {confirmed ? "Confirmed current token" : "Unconfirmed address"}
          </span>
          <h2 id="lookup-result-title">
            {confirmed ? <>{identity.name} <small>{identity.symbol}</small></> : "No token mint confirmed"}
          </h2>
          <code>{enrichment.mint}</code>
        </div>
        {confirmed ? (
          <button className="button-primary" type="button" onClick={onOpen}>
            Open research report
          </button>
        ) : null}
      </div>

      <dl className="result-facts">
        <div><dt>Token confirmation</dt><dd>{confirmed ? confirmationSources : "No matching provider evidence"}</dd></div>
        <div><dt>Current price</dt><dd>{formatUsd(price, 8)}</dd></div>
        <div><dt>Pool liquidity</dt><dd>{formatUsd(pair?.liquidityUsd)}</dd></div>
        <div><dt>Token supply</dt><dd>{formatNumber(enrichment.providers.solana.data?.uiAmount, 2)}</dd></div>
        <div><dt>Providers returned</dt><dd>{returned} of 6</dd></div>
      </dl>

      <details className="compact-disclosure">
        <summary>See provider checks</summary>
        <ul className="lookup-provider-list">
          <LookupProviderRow
            label="Solana"
            state={enrichment.providers.solana.status.state}
            value={enrichment.providers.solana.status.message}
          />
          <LookupProviderRow
            label="DEX Screener"
            state={enrichment.providers.dexScreener.status.state}
            value={`${matchingPairs.length} matching pools · paid orders ${dexAvailability?.paidOrders.available ? enrichment.providers.dexScreener.data?.paidOrders.length ?? 0 : "unavailable"}`}
          />
          <LookupProviderRow
            label="Jupiter"
            state={enrichment.providers.jupiter.status.state}
            value={enrichment.providers.jupiter.status.message}
          />
          <LookupProviderRow
            label="Helius"
            state={enrichment.providers.helius.status.state}
            value={enrichment.providers.helius.status.message}
          />
          <LookupProviderRow
            label="Solana Tracker"
            state={enrichment.providers.solanaTracker.status.state}
            value={enrichment.providers.solanaTracker.status.message}
          />
          <LookupProviderRow
            label="X"
            state={enrichment.providers.xRecentCounts.status.state}
            value={enrichment.providers.xRecentCounts.status.message}
          />
        </ul>
      </details>

      <p className="fine-print">
        Checked {formatTime(enrichment.generatedAt)}. {confirmed
          ? "This is a current snapshot, not historical evidence, a forecast, or a trade instruction."
          : "Valid base58 shape is not token proof. No confirmation can mean a non-mint address or unavailable upstream evidence."}
      </p>
    </section>
  );
}

type CoinColumnGroup = "market" | "flow" | "research";

function CoinFeedTable({
  coins,
  group,
  asOfMs,
  onOpen,
}: {
  coins: CoinListItem[];
  group: CoinColumnGroup;
  asOfMs: number;
  onOpen: (coin: CoinListItem) => void;
}) {
  return (
    <div className="table-scroll coin-table-scroll" role="region" aria-label="Live Pump and Solana coin feed">
      <table className="coin-table">
        <caption>Real coins returned by the active discovery sources. Missing values are not treated as zero.</caption>
        <thead>
          <tr>
            <th>Coin</th>
            <th>Age</th>
            <th>Stage</th>
            {group === "market" ? (
              <>
                <th>Price</th>
                <th>Market cap</th>
                <th>Liquidity</th>
                <th>24h volume</th>
              </>
            ) : null}
            {group === "flow" ? (
              <>
                <th>24h buys</th>
                <th>24h sells</th>
                <th>24h change</th>
                <th>Discovery</th>
              </>
            ) : null}
            {group === "research" ? (
              <>
                <th>Latest cutoff</th>
                <th>Pump probability</th>
                <th>Integrity evidence</th>
                <th>Tradability</th>
              </>
            ) : null}
            <th><span className="sr-only">Open report</span></th>
          </tr>
        </thead>
        <tbody>
          {coins.map((coin) => {
            const primaryProvenance = coin.provenance[0];
            return (
              <tr key={coin.mint}>
                <td>
                  <div className="coin-identity-cell">
                    {coin.imageUri ? (
                      // Token artwork is untrusted remote content. Native img avoids
                      // proxying arbitrary origins through the image optimiser.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" decoding="async" height="36" loading="lazy" referrerPolicy="no-referrer" src={coin.imageUri} width="36" />
                    ) : <span aria-hidden="true">{coinDisplaySymbol(coin).slice(0, 2).toUpperCase()}</span>}
                    <div>
                      <strong>{coinDisplayName(coin)} <small>${coinDisplaySymbol(coin)}</small></strong>
                      <code title={coin.mint}>{shortAddress(coin.mint)}</code>
                    </div>
                  </div>
                </td>
                <td>{formatAge(coin.createdAt, asOfMs)}</td>
                <td><span className={`stage-label stage-${coin.lifecycle.stage}`}>{stageLabel(coin)}</span></td>
                {group === "market" ? (
                  <>
                    <td>{formatUsd(coin.market.priceUsd, 8)}</td>
                    <td>{formatUsd(coin.market.marketCapUsd)}</td>
                    <td>{formatUsd(coin.market.liquidityUsd)}</td>
                    <td>{formatUsd(coin.market.volume24hUsd)}</td>
                  </>
                ) : null}
                {group === "flow" ? (
                  <>
                    <td>{formatNumber(coin.market.buys24h, 0)}</td>
                    <td>{formatNumber(coin.market.sells24h, 0)}</td>
                    <td>{formatPct(coin.market.priceChange24hPct)}</td>
                    <td>{primaryProvenance?.sourceId ?? "Unavailable"}</td>
                  </>
                ) : null}
                {group === "research" ? (
                  <>
                    <td>{coin.research ? `${formatCutoffSeconds(coin.research.cutoffSeconds)} ${coin.research.referenceClock}` : "Not calculated"}</td>
                    <td>{coin.research?.status === "predicted" && coin.research.probability !== null ? formatPct(coin.research.probability * 100) : <span className="data-pending">Not trained</span>}</td>
                    <td>{coin.research?.coordinationEvidence0To100 === null || coin.research?.coordinationEvidence0To100 === undefined ? <span className="data-pending">Unavailable</span> : `${formatNumber(coin.research.coordinationEvidence0To100, 0)} / 100`}</td>
                    <td>{coin.research?.roundTripRetentionPct === null || coin.research?.roundTripRetentionPct === undefined ? "Unavailable" : formatPct(coin.research.roundTripRetentionPct)}</td>
                  </>
                ) : null}
                <td><button className="table-action" onClick={() => onOpen(coin)} type="button">Open</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CoinsScreen({
  registry,
  registryLoading,
  feed,
  feedState,
  feedError,
  autoRefresh,
  enrichment,
  lookupState,
  lookupError,
  mint,
  onMintChange,
  onSubmit,
  onOpenCurrent,
  onOpenCoin,
  onLoadMore,
  onRefresh,
  onToggleAutoRefresh,
}: {
  registry: SourceRegistryResponse | null;
  registryLoading: boolean;
  feed: CoinsListResponse | null;
  feedState: CoinFeedState;
  feedError: string | null;
  autoRefresh: boolean;
  enrichment: TokenEnrichmentResponse | null;
  lookupState: LookupState;
  lookupError: string | null;
  mint: string;
  onMintChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenCurrent: () => void;
  onOpenCoin: (coin: CoinListItem) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onToggleAutoRefresh: () => void;
}) {
  const lookupCoverage = lookupRegistryCoverage(registry);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"all" | "bonding" | "graduated">("all");
  const [group, setGroup] = useState<CoinColumnGroup>("market");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCoins = useMemo(() => (feed?.coins ?? []).filter((coin) => {
    const matchesStage = stage === "all" || coin.lifecycle.stage === stage;
    const haystack = `${coin.name ?? ""} ${coin.symbol ?? ""} ${coin.mint}`.toLowerCase();
    return matchesStage && (!normalizedQuery || haystack.includes(normalizedQuery));
  }), [feed?.coins, normalizedQuery, stage]);
  const canonicalCount = feed?.coins.filter((coin) => coin.canonicalConfirmed).length ?? 0;
  const feedAsOfMs = feed?.generatedAt ? Date.parse(feed.generatedAt) : 0;

  return (
    <>
      <ScreenHeading
        section="Coins"
        title="Explore live coins"
        description="These are real Solana tokens returned now. Canonical launches and partial discovery rows stay visibly distinct; open any row for its evidence."
      />

      <section className="feed-status" aria-labelledby="feed-status-title">
        <div>
          <span className="kicker">Live discovery</span>
          <h2 id="feed-status-title">{feedState === "loading" && !feed ? "Loading real coins" : `${feed?.coins.length ?? 0} coins returned`}</h2>
          <p>{feed?.generatedAt ? `Last refreshed ${formatTime(feed.generatedAt)}.` : "Waiting for the first discovery response."}</p>
        </div>
        <div className="feed-actions">
          <button aria-pressed={autoRefresh} className="button-secondary" onClick={onToggleAutoRefresh} type="button">
            Auto-refresh {autoRefresh ? "on" : "off"}
          </button>
          <button className="button-primary" disabled={feedState === "loading"} onClick={onRefresh} type="button">
            {feedState === "loading" ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </section>

      <section className="coin-feed" aria-labelledby="coin-feed-title">
        <div className="coin-feed-toolbar">
          <div className="feed-search">
            <label htmlFor="coin-feed-search">Filter returned coins</label>
            <input
              id="coin-feed-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, ticker, or exact mint"
              type="search"
              value={query}
            />
          </div>
          <div>
            <span className="control-label">Lifecycle</span>
            <div className="compact-segments" role="group" aria-label="Filter by lifecycle stage">
              {(["all", "bonding", "graduated"] as const).map((value) => (
                <button aria-pressed={stage === value} key={value} onClick={() => setStage(value)} type="button">
                  {value === "all" ? "All" : value === "bonding" ? "Bonding" : "Graduated"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="control-label">Columns</span>
            <div className="compact-segments" role="group" aria-label="Choose coin table columns">
              {(["market", "flow", "research"] as const).map((value) => (
                <button aria-pressed={group === value} key={value} onClick={() => setGroup(value)} type="button">
                  {value === "market" ? "Market" : value === "flow" ? "Flow" : "Research"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div aria-live="polite" className="feed-message">
          {feedState === "loading" && !feed ? <p>Scanning configured discovery sources and enriching returned mints.</p> : null}
          {feedError ? <p className="error-copy">Live discovery failed: {feedError}</p> : null}
          {feedState !== "loading" && !feedError && visibleCoins.length === 0 ? (
            <p>No real coins match this filter. This is an empty source response, not a synthetic replacement.</p>
          ) : null}
        </div>

        {visibleCoins.length > 0 ? <CoinFeedTable asOfMs={feedAsOfMs} coins={visibleCoins} group={group} onOpen={onOpenCoin} /> : null}
        {feed?.pagination.hasMore ? (
          <div className="feed-pagination">
            <span>Showing {feed.coins.length} observed coins</span>
            <button className="button-secondary" disabled={feedState === "loading"} onClick={onLoadMore} type="button">
              {feedState === "loading" ? "Loading…" : "Load older observations"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="coverage-strip" aria-labelledby="coverage-title">
        <div>
          <span className="kicker">Feed evidence</span>
          <h2 id="coverage-title">What this response actually covers</h2>
        </div>
        <dl>
          <div>
            <dt>Canonical launches</dt>
            <dd>{canonicalCount} of {feed?.coins.length ?? 0}</dd>
          </div>
          <div>
            <dt>Sources attempted</dt>
            <dd>{feed?.ingestion.discoverySources.join(", ") || "Unavailable"}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{feed?.ingestion.storage.state ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Lookup providers</dt>
            <dd>{registryLoading ? "Checking" : `${lookupCoverage.connected} of ${lookupCoverage.total} online`}</dd>
          </div>
        </dl>
        {feed?.ingestion.warnings.length ? (
          <details className="compact-disclosure feed-warnings">
            <summary>Coverage warnings ({feed.ingestion.warnings.length})</summary>
            <ul>{feed.ingestion.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </details>
        ) : null}
      </section>

      <section className="search-surface exact-lookup" aria-labelledby="mint-search-title">
        <div className="section-title-row">
          <div><span className="kicker">Exact lookup</span><h2 id="mint-search-title">Open a mint not shown above</h2></div>
          <p>Use the exact address; tickers are reused.</p>
        </div>
        <form onSubmit={onSubmit}>
          <label htmlFor="mint-search">Solana contract address</label>
          <div className="search-control">
            <input id="mint-search" name="mint" onChange={(event) => onMintChange(event.target.value)} placeholder="Paste a base58 mint address" spellCheck={false} value={mint} />
            <button className="button-primary" disabled={lookupState === "loading"} type="submit">{lookupState === "loading" ? "Checking…" : "Find coin"}</button>
          </div>
        </form>
        <div aria-live="polite" className="lookup-status">
          {lookupState === "loading" ? <p>Checking current providers.</p> : null}
          {lookupState === "error" ? <p className="error-copy">{lookupError}</p> : null}
        </div>
        {lookupState === "success" && enrichment ? <CurrentLookupResult enrichment={enrichment} onOpen={onOpenCurrent} /> : null}
      </section>
    </>
  );
}

function EvidenceDisclosure({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="evidence-disclosure" open={defaultOpen}>
      <summary>
        <span><strong>{title}</strong><small>{summary}</small></span>
        <span aria-hidden="true">+</span>
      </summary>
      <div className="evidence-body">{children}</div>
    </details>
  );
}

function DiscoveredCoinReport({
  coin,
  research,
  researchLoading,
  error,
  cutoff,
  referenceClock,
  onCutoff,
  onReferenceClock,
  onBack,
}: {
  coin: CoinListItem | null;
  research: CoinResearchResponse | null;
  researchLoading: boolean;
  error: string | null;
  cutoff: CutoffLabel;
  referenceClock: ReferenceClock;
  onCutoff: (cutoff: CutoffLabel) => void;
  onReferenceClock: (clock: ReferenceClock) => void;
  onBack: () => void;
}) {
  const features = research?.features;
  const mappingCounts = research ? Object.entries(research.evidence.mapping.mappedCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]) : [];
  const prediction = research?.prediction;
  const predictedProbability = prediction?.status === "predicted"
    ? prediction.probability * 100
    : null;
  const executionProbe = features?.liquidityExecution.probes.find((probe) => probe.orderSizeUsd === 100)
    ?? features?.liquidityExecution.probes[0];
  const coordination = features?.coordinationWash.coordinationEvidence0To100 ?? null;
  const outcomeReason = !research
    ? "No cutoff-aligned executable outcome has been loaded."
    : "reason" in research.outcome
      ? research.outcome.reason
      : research.outcome.caveats[0] ?? "The outcome record has no additional note.";

  return (
    <>
      <div className="report-heading-row">
        <ScreenHeading
          section="Coin report"
          title="Understand this coin"
          description="Replay what the system actually observed by each cutoff. Uncollected evidence stays unavailable instead of being estimated from the future."
        />
        <button className="text-button" type="button" onClick={onBack}>Back to coins</button>
      </div>

      {researchLoading ? <section className="report-loading" aria-live="polite"><h2>Replaying real observations</h2><p>Applying the selected clock and cutoff without using later evidence.</p></section> : null}
      {error ? <section className="report-error" role="alert"><h2>This report could not be loaded</h2><p>{error}</p></section> : null}

      {coin ? (
        <>
          <section className="identity-bar" aria-label="Selected real token">
            <div className="token-monogram" aria-hidden="true">{coinDisplaySymbol(coin).slice(0, 2).toUpperCase()}</div>
            <div className="identity-main">
              <span className={`truth-label ${coin.canonicalConfirmed ? "truth-live" : "truth-unconfirmed"}`}>
                {coin.canonicalConfirmed ? "Canonical launch confirmed" : "Indexed discovery, canonical launch unconfirmed"}
              </span>
              <strong>{coinDisplayName(coin)} <small>${coinDisplaySymbol(coin)}</small></strong>
              <code title={coin.mint}>{coin.mint}</code>
            </div>
            <div className="identity-time">
              <span>{coin.createdAt ? "Launched" : "Discovery time unavailable"}</span>
              <strong>{coin.createdAt ? formatTime(coin.createdAt) : "Unavailable"}</strong>
            </div>
          </section>

          <section className="cutoff-section" aria-labelledby="real-cutoff-title">
            <div>
              <span className="kicker">Point in time</span>
              <h2 id="real-cutoff-title">What was knowable at this moment?</h2>
            </div>
            <div className="point-controls">
              <div className="clock-control" role="group" aria-label="Reference event">
                <button aria-pressed={referenceClock === "launch"} onClick={() => onReferenceClock("launch")} type="button">After launch</button>
                <button aria-pressed={referenceClock === "graduation"} onClick={() => onReferenceClock("graduation")} type="button">After graduation</button>
              </div>
              <div className="cutoff-control" role="group" aria-label={`Evidence cutoff after ${referenceClock}`}>
                {RESEARCH_CUTOFFS.map((item) => (
                  <button
                    aria-pressed={cutoff === item.label}
                    className={cutoff === item.label ? "active" : ""}
                    key={item.label}
                    onClick={() => onCutoff(item.label)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="live-assessments" aria-label="Four independent research outputs">
            <article>
              <span>Pump probability</span>
              <strong>{predictedProbability === null ? "Not trained" : formatPct(predictedProbability)}</strong>
              <p>{prediction?.status === "predicted" ? "Calibrated estimate for the stated target and order size." : "No validated artifact has passed the training gate."}</p>
            </article>
            <article>
              <span>Integrity evidence</span>
              <strong>{coordination === null ? "Unavailable" : `${formatNumber(coordination, 0)} / 100`}</strong>
              <p>Coordination clues, never proof of identity, intent, or wrongdoing.</p>
            </article>
            <article>
              <span>Tradability</span>
              <strong>{executionProbe?.roundTripRetentionPct === null || executionProbe?.roundTripRetentionPct === undefined ? "Unavailable" : formatPct(executionProbe.roundTripRetentionPct)}</strong>
              <p>{executionProbe ? `${formatUsd(executionProbe.orderSizeUsd)} reconstructed round-trip retention.` : "No cutoff-aligned buy and sell quote pair."}</p>
            </article>
            <article>
              <span>Evidence quality</span>
              <strong>{research ? formatPct(research.evidence.overallCoveragePct, 0) : "Loading"}</strong>
              <p>{research ? `${research.evidence.mapping.eligibleObservationCount} eligible of ${research.evidence.mapping.inputObservationCount} observed records.` : "Checking timestamp and source coverage."}</p>
            </article>
          </section>

          <section className="interpretation" aria-labelledby="real-interpretation-title">
            <span className="kicker">Answer at {cutoff} after {referenceClock}</span>
            <h2 id="real-interpretation-title">
              {predictedProbability === null
                ? "No validated pump probability is available at this cutoff."
                : `Estimated pump probability: ${formatPct(predictedProbability)}.`}
            </h2>
            <p>
              {research?.status === "pending"
                ? "This cutoff has not elapsed, so the report is waiting instead of using future evidence."
                : research?.missingPrerequisites[0] ?? "The displayed inputs passed the point-in-time eligibility check."}
            </p>
            <dl className="decision-facts">
              <div><dt>Price at cutoff</dt><dd>{formatUsd(features?.lifecycleFlow.priceUsd, 8)}</dd></div>
              <div><dt>Buy / sell count</dt><dd>{features ? `${formatNumber(features.lifecycleFlow.buyCount, 0)} / ${formatNumber(features.lifecycleFlow.sellCount, 0)}` : "Unavailable"}</dd></div>
              <div><dt>Unique buyers</dt><dd>{formatNumber(features?.lifecycleFlow.uniqueBuyers, 0)}</dd></div>
              <div><dt>Net USD flow</dt><dd>{formatUsd(features?.lifecycleFlow.netFlowUsd)}</dd></div>
            </dl>
          </section>

          <section className="evidence-list" aria-labelledby="real-evidence-title">
            <div className="section-title-row">
              <div><span className="kicker">Real evidence</span><h2 id="real-evidence-title">What has actually been collected</h2></div>
              <p>{research?.decision.decisionAt ? `Decision time ${formatTime(research.decision.decisionAt)}` : "Reference time unavailable"}</p>
            </div>
            <EvidenceDisclosure defaultOpen title="Launch and market" summary={`${stageLabel(coin)} · ${formatUsd(coin.market.liquidityUsd)} liquidity`}>
              <dl className="evidence-grid">
                <div><dt>Created slot</dt><dd>{formatNumber(coin.createdSlot, 0)}</dd></div>
                <div><dt>Creator</dt><dd>{coin.creator ? shortAddress(coin.creator) : "Unavailable"}</dd></div>
                <div><dt>Creation signature</dt><dd>{coin.creationSignature ? shortAddress(coin.creationSignature) : "Unavailable"}</dd></div>
                <div><dt>Venue</dt><dd>{coin.lifecycle.venue}</dd></div>
                <div><dt>24h buys</dt><dd>{formatNumber(coin.market.buys24h, 0)}</dd></div>
                <div><dt>24h sells</dt><dd>{formatNumber(coin.market.sells24h, 0)}</dd></div>
              </dl>
            </EvidenceDisclosure>
            <EvidenceDisclosure title="Cutoff-safe observations" summary={`${research?.evidence.mapping.eligibleObservationCount ?? 0} eligible records · ${research?.evidence.historyCoverage.partial ? "partial range" : "reported range"}`}>
              {mappingCounts.length ? (
                <dl className="evidence-grid">
                  {mappingCounts.map(([kind, count]) => <div key={kind}><dt>{kind}</dt><dd>{count}</dd></div>)}
                </dl>
              ) : <p>No retained observation matched a supported point-in-time feature schema at this cutoff.</p>}
              <p className="fine-print">
                Scanned {formatNumber(research?.evidence.historyCoverage.signaturesScanned, 0)} signatures and decoded {formatNumber(research?.evidence.historyCoverage.transactionsDecoded, 0)} transactions.
              </p>
            </EvidenceDisclosure>
            <EvidenceDisclosure title="Provenance and coverage" summary={`${coin.provenance.length} source records · ${coin.missing.length} explicit gaps`}>
              <ul className="caveat-list">
                {coin.provenance.map((record, index) => (
                  <li key={`${record.sourceId}-${record.role}-${index}`}><strong>{record.sourceId}</strong> · {record.role} · {record.fidelity}</li>
                ))}
                {coin.missing.map((item) => <li key={`${item.field}-${item.reason}`}><strong>{item.field}</strong>: {item.reason}</li>)}
                {research?.missingPrerequisites.map((reason) => <li key={reason}>{reason}</li>)}
                {research?.evidence.historyCoverage.missingReasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </EvidenceDisclosure>
            <EvidenceDisclosure title="Later outcome" summary={research?.outcome.status === "available" ? "Matured label, never an input" : "Not yet available as a valid label"}>
              <div className="hindsight-boundary" role="note">
                <strong>Hindsight boundary</strong>
                <p>{outcomeReason}</p>
              </div>
              {research?.outcome.status === "available" ? (
                <dl className="evidence-grid">
                  <div><dt>2× before −50%</dt><dd>{"value" in research.outcome && research.outcome.value === 1 ? "Yes" : "No"}</dd></div>
                  <div><dt>Maximum net return</dt><dd>{formatPct(research.outcome.maximumNetReturnPct)}</dd></div>
                  <div><dt>Maximum drawdown</dt><dd>{formatPct(research.outcome.maximumDrawdownPct)}</dd></div>
                </dl>
              ) : null}
            </EvidenceDisclosure>
          </section>
        </>
      ) : null}
    </>
  );
}

function MethodSteps() {
  return (
    <ol className="method-steps">
      <li><span>1</span><div><strong>Include every launch</strong><p>Freeze a contiguous date range before looking at winners.</p></div></li>
      <li><span>2</span><div><strong>Replay each cutoff</strong><p>Use only evidence that was actually available by 30s, 1m, 5m, 15m, or 1h.</p></div></li>
      <li><span>3</span><div><strong>Price a real exit</strong><p>Label returns after fees, slippage, failures, latency, and unsold inventory.</p></div></li>
      <li><span>4</span><div><strong>Walk forward</strong><p>Train on the past, test on untouched later launches, and report false positives.</p></div></li>
    </ol>
  );
}

function DataMethodsScreen({
  registry,
  registryLoading,
  registryError,
  initialTerm,
}: {
  registry: SourceRegistryResponse | null;
  registryLoading: boolean;
  registryError: string | null;
  initialTerm: string;
}) {
  const [term, setTerm] = useState(initialTerm);
  const [category, setCategory] = useState<"All" | GlossaryCategory>("All");
  const [modelAudit, setModelAudit] = useState<{
    status: string;
    acceptedExamples?: number;
    reason?: string;
    repository?: { featureSnapshotCount: number; outcomeCount: number; assetCount: number };
  } | null>(null);
  const [alertAudit, setAlertAudit] = useState<{
    enabled: boolean;
    configured: boolean;
    probabilityThreshold: number;
  } | null>(null);
  const normalizedTerm = term.trim().toLowerCase();
  const glossaryMatches = useMemo(() => {
    if (!normalizedTerm) return [];
    return FULL_GLOSSARY_TERMS.filter((item) => {
      const categoryMatch = category === "All" || item.category === category;
      const text = `${item.term} ${item.definition} ${item.whyItMatters ?? ""}`.toLowerCase();
      return categoryMatch && text.includes(normalizedTerm);
    }).slice(0, 30);
  }, [category, normalizedTerm]);
  const connected = registry?.sources.filter((source) => source.status.state === "connected").length ?? 0;
  const automated = registry?.sources.filter((source) => source.automated).length ?? 0;

  useEffect(() => {
    let active = true;
    async function loadAudits() {
      await Promise.all([
        (async () => {
          try {
            const response = await fetch("/api/model/research", { cache: "no-store" });
            const body = await response.json() as {
              status?: string;
              acceptedExamples?: number;
              reason?: string;
              repository?: { featureSnapshotCount: number; outcomeCount: number; assetCount: number };
            };
            if (active) setModelAudit({
              status: body.status ?? (response.ok ? "unknown" : "unavailable"),
              acceptedExamples: body.acceptedExamples,
              reason: body.reason,
              repository: body.repository,
            });
          } catch {
            if (active) setModelAudit({ status: "unavailable", reason: "The model audit endpoint did not respond." });
          }
        })(),
        (async () => {
          try {
            const response = await fetch("/api/alerts", { cache: "no-store" });
            const body = await response.json() as {
              enabled?: boolean;
              configured?: boolean;
              probabilityThreshold?: number;
            };
            if (active && response.ok) setAlertAudit({
              enabled: body.enabled === true,
              configured: body.configured === true,
              probabilityThreshold: body.probabilityThreshold ?? 0.8,
            });
          } catch {
            if (active) setAlertAudit(null);
          }
        })(),
      ]);
    }
    void loadAudits();
    return () => { active = false; };
  }, []);

  return (
    <>
      <ScreenHeading
        section="Data & methods"
        title="Audit the research"
        description="Check what the app can know, where each fact comes from, and which claims have not earned trust yet."
      />

      <section className="audit-summary" aria-labelledby="audit-summary-title">
        <div><span className="kicker">Current status</span><h2 id="audit-summary-title">Connected is not complete</h2></div>
        <dl>
          <div><dt>Automated sources online</dt><dd>{registryLoading ? "Checking" : `${connected} of ${automated}`}</dd></div>
          <div><dt>Feature snapshots</dt><dd>{modelAudit?.repository ? formatNumber(modelAudit.repository.featureSnapshotCount, 0) : "Unavailable"}</dd></div>
          <div><dt>Matured outcomes</dt><dd>{modelAudit?.repository ? formatNumber(modelAudit.repository.outcomeCount, 0) : "Unavailable"}</dd></div>
          <div><dt>Historical model fit</dt><dd>{modelAudit?.status === "trained" ? "Ready to review" : "Not enough data"}</dd></div>
          <div><dt>Telegram alerts</dt><dd>{alertAudit?.enabled && alertAudit.configured ? `On ≥ ${formatPct(alertAudit.probabilityThreshold * 100, 0)}` : "Off"}</dd></div>
          <div><dt>Automatic trading</dt><dd>Disabled</dd></div>
        </dl>
      </section>

      <section className="method-section" aria-labelledby="sources-title">
        <div className="section-title-row">
          <div><span className="kicker">Sources</span><h2 id="sources-title">Exact connection ledger</h2></div>
          <p>Health means an endpoint answered. It does not mean history was collected or licensed for redistribution.</p>
        </div>
        {registryError ? <p className="error-copy">Source checks failed: {registryError}</p> : null}
        {registryLoading ? <p className="loading-copy">Checking public endpoints and server configuration.</p> : null}
        {registry ? (
          <div className="table-scroll source-table-scroll" role="region" aria-label="Source connection ledger">
            <table className="source-table">
              <caption>Current adapters, access, history, and use boundaries</caption>
              <thead><tr><th>Source</th><th>State</th><th>Historical coverage</th><th>Access</th><th>Details</th></tr></thead>
              <tbody>
                {registry.sources.map((source) => (
                  <tr key={source.id}>
                    <td><strong>{source.label}</strong><small>{source.category}</small></td>
                    <td><SourceState state={source.status.state} /></td>
                    <td>{COVERAGE_LABELS[source.historicalCoverage]}</td>
                    <td>{source.access.replaceAll("-", " ")}</td>
                    <td>
                      <details className="table-details">
                        <summary>View</summary>
                        <div>
                          <strong>Interfaces</strong>
                          <code>{source.interfaces.join(" · ") || "None"}</code>
                          <strong>Declared data scope</strong>
                          <p>{source.collects.join("; ") || "No automated collection"}</p>
                          <strong>Implementation state</strong>
                          <p>{source.implementationNote ?? source.status.message}</p>
                          <strong>Credential</strong>
                          <code>{source.environmentVariable ?? "None"}</code>
                          <strong>Last check</strong>
                          <p>{formatTime(source.status.checkedAt)}{source.status.latencyMs === null ? "" : ` · ${formatNumber(source.status.latencyMs, 0)} ms`}</p>
                          <strong>Limits</strong>
                          <p>{source.limitations.join("; ")}</p>
                          <strong>Rights boundary</strong>
                          <p>{source.commercialUseNote}</p>
                          <p className="source-links">
                            <a href={source.officialUrl} rel="noreferrer" target="_blank">Official source</a>
                            {source.documentationUrl ? <a href={source.documentationUrl} rel="noreferrer" target="_blank">API documentation</a> : null}
                          </p>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="method-section" aria-labelledby="method-title">
        <div className="section-title-row">
          <div><span className="kicker">Research method</span><h2 id="method-title">How a signal would earn trust</h2></div>
          <p>The protocol exists. A real cohort and performance result do not.</p>
        </div>
        <MethodSteps />
        <details className="compact-disclosure method-contract">
          <summary>Point-in-time and leakage rules</summary>
          <dl className="term-grid">
            <div><dt>event_at</dt><dd>When an event happened.</dd></div>
            <div><dt>observed_at</dt><dd>When a collector first saw it.</dd></div>
            <div><dt>available_at</dt><dd>The earliest time it may enter a prediction.</dd></div>
            <div><dt>computed_at</dt><dd>When this version of the calculation ran.</dd></div>
          </dl>
        </details>
      </section>

      <aside className="external-benchmark" aria-labelledby="benchmark-title">
        <span className="truth-label">External research, not app coverage</span>
        <div>
          <span className="benchmark-number">0.66%</span>
          <div>
            <h2 id="benchmark-title">Most launches in one study did not graduate</h2>
            <p>
              A September–October 2025 Pump.fun study observed 655,770 launches and 4,338 graduations.
              Graduation is an early-demand threshold, not evidence of durable or executable profit.
            </p>
          </div>
        </div>
        <a href="https://arxiv.org/abs/2602.14860" rel="noreferrer" target="_blank">Read the research paper</a>
      </aside>

      <section className="method-section" aria-labelledby="updates-title">
        <div className="section-title-row">
          <div><span className="kicker">Release notes</span><h2 id="updates-title">What changed</h2></div>
        </div>
        <div className="release-list">
          {RELEASE_NOTES.map((release) => (
            <article key={`${release.date}-${release.title}`}>
              <time>{release.date}</time>
              <div><h3>{release.title}</h3><ul>{release.items.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </article>
          ))}
        </div>
      </section>

      <section className="method-section glossary-section" aria-labelledby="glossary-title">
        <div className="section-title-row">
          <div><span className="kicker">Terminology</span><h2 id="glossary-title">Search a term</h2></div>
          <p>Definitions stay hidden until you ask, so the appendix does not become another wall of text.</p>
        </div>
        <div className="glossary-controls">
          <label htmlFor="glossary-search">Term or idea</label>
          <input
            id="glossary-search"
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Try: HHI, slippage, cabal, available_at"
            type="search"
            value={term}
          />
          <div className="category-filter" aria-label="Filter glossary by category">
            {GLOSSARY_CATEGORIES.map((item) => (
              <button
                aria-pressed={category === item}
                className={category === item ? "active" : ""}
                key={item}
                onClick={() => setCategory(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div aria-live="polite" className="glossary-results">
          {!normalizedTerm ? <p className="glossary-prompt">Search for a term to see its plain-English definition.</p> : null}
          {normalizedTerm && glossaryMatches.length === 0 ? <p>No matching terms. Try a shorter word or choose All.</p> : null}
          {glossaryMatches.length > 0 ? (
            <>
              <p>{glossaryMatches.length} matching {glossaryMatches.length === 1 ? "term" : "terms"}</p>
              <dl>
                {glossaryMatches.map((item) => (
                  <div key={item.term}>
                    <dt><strong>{item.term}</strong><span>{item.category}</span></dt>
                    <dd>{item.definition}{item.whyItMatters ? <small>{item.whyItMatters}</small> : null}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}

export function ResearchConsole({
  initialScreen = "coins",
  initialTerm = "",
}: ResearchConsoleProps) {
  const [screen, setScreen] = useState<AppScreen>(initialScreen);
  const [cutoff, setCutoff] = useState<CutoffLabel>("5m");
  const [registry, setRegistry] = useState<SourceRegistryResponse | null>(null);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [feed, setFeed] = useState<CoinsListResponse | null>(null);
  const [feedState, setFeedState] = useState<CoinFeedState>("loading");
  const [feedError, setFeedError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<CoinListItem | null>(null);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [referenceClock, setReferenceClock] = useState<ReferenceClock>("launch");
  const [coinResearch, setCoinResearch] = useState<CoinResearchResponse | null>(null);
  const [coinResearchLoading, setCoinResearchLoading] = useState(false);
  const [coinResearchError, setCoinResearchError] = useState<string | null>(null);
  const [mint, setMint] = useState("");
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [enrichment, setEnrichment] = useState<TokenEnrichmentResponse | null>(null);
  const researchRequestId = useRef(0);

  const loadFeed = useCallback(async (cursor?: string | null, append = false) => {
    setFeedState("loading");
    try {
      const params = new URLSearchParams({ limit: "50", source: "auto", enrich: "true" });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/coins?${params.toString()}`, {
        cache: "no-store",
      });
      const body = await response.json() as CoinsListResponse & { error?: string; message?: string };
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Coin discovery request failed.");
      setFeed((current) => {
        if (!append || !current) return body;
        const byMint = new Map(current.coins.map((coin) => [coin.mint, coin]));
        body.coins.forEach((coin) => byMint.set(coin.mint, coin));
        return {
          ...body,
          coins: [...byMint.values()],
          ingestion: {
            ...body.ingestion,
            warnings: [...new Set([...current.ingestion.warnings, ...body.ingestion.warnings])],
          },
        };
      });
      setFeedError(null);
      setFeedState("ready");
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : "Coin discovery request failed.");
      setFeedState("error");
    }
  }, []);

  const loadCoinResearch = useCallback(async (
    requestedMint: string,
    requestedClock: ReferenceClock,
    requestedCutoff: CutoffLabel,
  ) => {
    const requestId = researchRequestId.current + 1;
    researchRequestId.current = requestId;
    setCoinResearchLoading(true);
    setCoinResearchError(null);
    setCoinResearch(null);
    try {
      const params = new URLSearchParams({
        referenceClock: requestedClock,
        cutoffSeconds: String(CUTOFF_SECONDS[requestedCutoff]),
        orderSizeUsd: "100",
        horizonSeconds: "86400",
      });
      const response = await fetch(`/api/coins/${encodeURIComponent(requestedMint)}/research?${params.toString()}`, {
        cache: "no-store",
      });
      const body = await response.json() as CoinResearchResponse & { error?: string; message?: string };
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Coin report request failed.");
      if (researchRequestId.current !== requestId) return;
      setCoinResearch(body);
      setSelectedCoin(body.coin);
    } catch (error) {
      if (researchRequestId.current !== requestId) return;
      setCoinResearch(null);
      setCoinResearchError(error instanceof Error ? error.message : "Coin report request failed.");
    } finally {
      if (researchRequestId.current === requestId) setCoinResearchLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadRegistry() {
      try {
        const response = await fetch("/api/sources", { cache: "no-store" });
        const body = await response.json() as SourceRegistryResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Source registry request failed.");
        if (active) {
          setRegistry(body);
          setRegistryError(null);
        }
      } catch (error) {
        if (active) setRegistryError(error instanceof Error ? error.message : "Source registry request failed.");
      } finally {
        if (active) setRegistryLoading(false);
      }
    }
    void loadRegistry();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadFeed(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFeed]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => { void loadFeed(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadFeed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestedMint = new URLSearchParams(window.location.search).get("mint");
    if (initialScreen === "report" && requestedMint) {
      const timer = window.setTimeout(() => { setSelectedMint(requestedMint); }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [initialScreen]);

  useEffect(() => {
    if (!selectedMint) return;
    const timer = window.setTimeout(() => {
      void loadCoinResearch(selectedMint, referenceClock, cutoff);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cutoff, loadCoinResearch, referenceClock, selectedMint]);

  useEffect(() => {
    function syncScreenFromHistory() {
      const nextScreen = screenFromLocation();
      setScreen(nextScreen);
      const requestedMint = new URLSearchParams(window.location.search).get("mint");
      if (nextScreen === "report" && requestedMint) {
        setSelectedMint(requestedMint);
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    window.addEventListener("popstate", syncScreenFromHistory);
    return () => window.removeEventListener("popstate", syncScreenFromHistory);
  }, []);

  async function submitMint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedMint = mint.trim();
    setLookupState("loading");
    setLookupError(null);
    setEnrichment(null);

    try {
      const response = await fetch(`/api/sources/token?mint=${encodeURIComponent(requestedMint)}`, {
        cache: "no-store",
      });
      const body = await response.json() as TokenEnrichmentResponse & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.message ?? "That mint could not be checked.");
      }
      setEnrichment(body);
      setLookupState("success");
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "That mint could not be checked.");
      setLookupState("error");
    }
  }

  function openLookupReport() {
    const reportMint = enrichment?.mint ?? null;
    if (reportMint) {
      setSelectedMint(reportMint);
      setSelectedCoin(null);
      setCoinResearch(null);
    }
    setScreen("report");
    updateScreenUrl("report", reportMint);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function openCoin(coin: CoinListItem) {
    setSelectedCoin(coin);
    setSelectedMint(coin.mint);
    setCoinResearch(null);
    setScreen("report");
    updateScreenUrl("report", coin.mint);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function backToCoins() {
    setScreen("coins");
    updateScreenUrl("coins");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const connectedCount = registry?.sources.filter((source) => source.status.state === "connected").length ?? 0;

  return (
    <div className="app-shell">
      <header className="global-header">
        <a
          className="brand"
          href="/?screen=coins"
          onClick={(event) => navigateClient(event, "coins", setScreen)}
        >
          <BrandMark />
          <span><b>MEME</b>TRACE</span>
        </a>
        <nav aria-label="Primary navigation" className="primary-nav">
          {PRIMARY_NAV.map((item) => (
            <a
              aria-current={screen === item.id ? "page" : undefined}
              href={`/?screen=${item.id}`}
              key={item.id}
              onClick={(event) => navigateClient(event, item.id, setScreen)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-evidence" aria-label="Source check summary">
          <span className={connectedCount > 0 ? "online" : "checking"} aria-hidden="true" />
          {registryLoading ? "Checking sources" : `${connectedCount} public checks passed`}
        </div>
      </header>

      <main>
        {screen === "coins" ? (
          <CoinsScreen
            autoRefresh={autoRefresh}
            enrichment={enrichment}
            feed={feed}
            feedError={feedError}
            feedState={feedState}
            lookupError={lookupError}
            lookupState={lookupState}
            mint={mint}
            onMintChange={setMint}
            onOpenCoin={openCoin}
            onOpenCurrent={openLookupReport}
            onLoadMore={() => { void loadFeed(feed?.pagination.nextCursor, true); }}
            onRefresh={() => { void loadFeed(); }}
            onSubmit={submitMint}
            onToggleAutoRefresh={() => setAutoRefresh((value) => !value)}
            registry={registry}
            registryLoading={registryLoading}
          />
        ) : null}

        {screen === "report" ? (
          selectedMint || selectedCoin || coinResearchLoading || coinResearchError ? (
            <DiscoveredCoinReport
              coin={coinResearch?.coin ?? selectedCoin}
              cutoff={cutoff}
              error={coinResearchError}
              onBack={backToCoins}
              onCutoff={setCutoff}
              onReferenceClock={setReferenceClock}
              referenceClock={referenceClock}
              research={coinResearch}
              researchLoading={coinResearchLoading}
            />
          ) : (
            <section className="report-empty">
              <ScreenHeading
                section="Coin report"
                title="Choose a coin first"
                description="Open a real row from Coins or paste an exact mint address. Reports never default to invented token data."
              />
              <button className="button-primary" onClick={backToCoins} type="button">Go to live coins</button>
            </section>
          )
        ) : null}

        {screen === "methods" ? (
          <DataMethodsScreen
            initialTerm={initialTerm}
            registry={registry}
            registryError={registryError}
            registryLoading={registryLoading}
          />
        ) : null}
      </main>

      <footer>
        <span>MEMETRACE</span>
        <p>Research preview. No validated forecast or automatic trading.</p>
      </footer>
    </div>
  );
}
