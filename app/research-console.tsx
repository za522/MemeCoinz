"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- vinext 1.0.0-beta.2's Next Link prefetch shim throws in production; these anchors retain URL-addressable routes and client-side interception. */

import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  GLOSSARY_CATEGORIES,
  RELEASE_NOTES,
  type GlossaryCategory,
} from "@/lib/documentation";
import { FULL_GLOSSARY_TERMS } from "@/lib/glossary-full";
import {
  RESEARCH_CUTOFFS,
  type CutoffLabel,
  type IllustrativeAssessment,
  type ResearchReplay,
  type ResearchSummary,
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
type ReportMode = "demo" | "current";
type LookupState = "idle" | "loading" | "success" | "error";

interface ResearchConsoleProps {
  replay: ResearchReplay;
  summaries: Record<CutoffLabel, ResearchSummary>;
  initialScreen?: AppScreen;
  initialTerm?: string;
}

const PRIMARY_NAV: Array<{ id: AppScreen; label: string }> = [
  { id: "coins", label: "Coins" },
  { id: "report", label: "Coin report" },
  { id: "methods", label: "Data & methods" },
];

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

function assessmentRead(
  kind: "opportunity" | "integrity" | "tradability" | "evidence",
  assessment: IllustrativeAssessment,
) {
  const band = assessment.band;
  if (kind === "integrity") {
    return {
      low: "Fewer warning clues",
      moderate: "Some warning clues",
      high: "Many warning clues",
      "very-high": "Severe warning clues",
    }[band];
  }
  if (kind === "tradability") {
    return {
      low: "Difficult to trade",
      moderate: "Limited at this size",
      high: "Plausible in the demo",
      "very-high": "Strong in the demo",
    }[band];
  }
  if (kind === "evidence") {
    return {
      low: "Weak coverage",
      moderate: "Mixed coverage",
      high: "Good demo coverage",
      "very-high": "Strong demo coverage",
    }[band];
  }
  return {
    low: "Little supporting evidence",
    moderate: "Mixed supporting evidence",
    high: "Supportive in the demo",
    "very-high": "Strong in the demo",
  }[band];
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

function updateScreenUrl(nextScreen: AppScreen) {
  const url = new URL(window.location.href);
  url.searchParams.set("screen", nextScreen);
  if (nextScreen !== "methods") url.searchParams.delete("term");
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
            Open current snapshot
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

function CoinsScreen({
  replay,
  registry,
  registryLoading,
  enrichment,
  lookupState,
  lookupError,
  mint,
  onMintChange,
  onSubmit,
  onOpenDemo,
  onOpenCurrent,
}: {
  replay: ResearchReplay;
  registry: SourceRegistryResponse | null;
  registryLoading: boolean;
  enrichment: TokenEnrichmentResponse | null;
  lookupState: LookupState;
  lookupError: string | null;
  mint: string;
  onMintChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenDemo: () => void;
  onOpenCurrent: () => void;
}) {
  const lookupCoverage = lookupRegistryCoverage(registry);

  return (
    <>
      <ScreenHeading
        section="Coins"
        title="Find a coin"
        description="Paste the exact Solana contract address. Tickers and names are reused, so they are not safe identifiers."
      />

      <section className="search-surface" aria-labelledby="mint-search-title">
        <form onSubmit={onSubmit}>
          <label htmlFor="mint-search" id="mint-search-title">Solana contract address</label>
          <div className="search-control">
            <input
              id="mint-search"
              name="mint"
              onChange={(event) => onMintChange(event.target.value)}
              placeholder="Paste a base58 mint address"
              spellCheck={false}
              value={mint}
            />
            <button className="button-primary" disabled={lookupState === "loading"} type="submit">
              {lookupState === "loading" ? "Checking…" : "Find coin"}
            </button>
          </div>
        </form>

        <div aria-live="polite" className="lookup-status">
          {lookupState === "idle" ? <p>Nothing is queried until you press Find coin.</p> : null}
          {lookupState === "loading" ? <p>Checking current public sources for this mint.</p> : null}
          {lookupState === "error" ? <p className="error-copy">{lookupError}</p> : null}
        </div>

        {lookupState === "success" && enrichment ? (
          <CurrentLookupResult enrichment={enrichment} onOpen={onOpenCurrent} />
        ) : null}
      </section>

      <section className="coverage-strip" aria-labelledby="coverage-title">
        <div>
          <span className="kicker">App coverage</span>
          <h2 id="coverage-title">What works today</h2>
        </div>
        <dl>
          <div>
            <dt>Current lookup</dt>
            <dd>{registryLoading ? "Checking sources" : `${lookupCoverage.connected} of ${lookupCoverage.total} lookup providers online`}</dd>
          </div>
          <div>
            <dt>Historical launches</dt>
            <dd>Not ingested</dd>
          </div>
          <div>
            <dt>Validated forecasts</dt>
            <dd>Not available</dd>
          </div>
        </dl>
      </section>

      <section className="demo-entry" aria-labelledby="demo-title">
        <div className="demo-monogram" aria-hidden="true">AF</div>
        <div>
          <span className="truth-label truth-demo">Demo data</span>
          <h2 id="demo-title">{replay.identity.name} <small>${replay.identity.ticker}</small></h2>
          <p>A synthetic launch for learning how the report works. It is not a real token or a backtest result.</p>
        </div>
        <button className="button-secondary" type="button" onClick={onOpenDemo}>Open demo</button>
      </section>
    </>
  );
}

function AssessmentRow({
  label,
  kind,
  assessment,
  meaning,
}: {
  label: string;
  kind: "opportunity" | "integrity" | "tradability" | "evidence";
  assessment: IllustrativeAssessment;
  meaning: string;
}) {
  return (
    <article className={`assessment-row assessment-${kind}`}>
      <div className="assessment-copy">
        <span>{label}</span>
        <strong>{assessmentRead(kind, assessment)}</strong>
        <p>{meaning}</p>
      </div>
      <details>
        <summary>How this was calculated</summary>
        <p className="formula-status">
          Unvalidated rule score: {formatNumber(assessment.score0To100, 1)} of 100. This is not a probability.
        </p>
        <ul className="component-list">
          {assessment.components.map((component) => (
            <li key={component.key}>
              <div><strong>{component.label}</strong><span>{component.explanation}</span></div>
              <code>{formatNumber(component.normalized0To100, 0)} / 100</code>
            </li>
          ))}
        </ul>
      </details>
    </article>
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

function DemoReport({
  replay,
  summary,
  cutoff,
  onCutoff,
  onBack,
}: {
  replay: ResearchReplay;
  summary: ResearchSummary;
  cutoff: CutoffLabel;
  onCutoff: (cutoff: CutoffLabel) => void;
  onBack: () => void;
}) {
  const snapshot = summary.selectedCutoff;
  const outputs = snapshot.outputs;
  const probe = snapshot.liquidityExecution.probes.find((item) => item.notionalUsd === 500)
    ?? snapshot.liquidityExecution.probes[0];
  const cutoffWords: Record<CutoffLabel, string> = {
    "30s": "30 seconds",
    "1m": "1 minute",
    "5m": "5 minutes",
    "15m": "15 minutes",
    "1h": "1 hour",
  };

  return (
    <>
      <div className="report-heading-row">
        <ScreenHeading
          section="Coin report"
          title="Understand this coin"
          description={`Evidence available ${cutoffWords[cutoff]} after launch. The demo asks whether early evidence was associated with later executable upside over the next 24 hours.`}
        />
        <button className="text-button" type="button" onClick={onBack}>Back to coins</button>
      </div>

      <section className="identity-bar" aria-label="Selected demo token">
        <div className="demo-monogram" aria-hidden="true">AF</div>
        <div className="identity-main">
          <span className="truth-label truth-demo">Synthetic demo</span>
          <strong>{replay.identity.name} <small>${replay.identity.ticker}</small></strong>
          <code>{shortAddress(replay.identity.contractAddress)}</code>
        </div>
        <div className="identity-time">
          <span>Evidence known by</span>
          <strong>{formatTime(snapshot.asOf)}</strong>
        </div>
      </section>

      <div className="truth-notice" role="note">
        <strong>Synthetic demo, not a real token.</strong>
        <span>Every number below is invented to test the research method. It is an unvalidated heuristic, not a probability and not a trade recommendation.</span>
      </div>

      <section className="cutoff-section" aria-labelledby="cutoff-title">
        <div>
          <span className="kicker">Point in time</span>
          <h2 id="cutoff-title">Choose what the report was allowed to know</h2>
        </div>
        <div className="cutoff-control" role="group" aria-label="Evidence cutoff after launch">
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
      </section>

      <section className="interpretation" aria-labelledby="interpretation-title">
        <span className="kicker">Short interpretation</span>
        <h2 id="interpretation-title">Early demand is visible, but it is not enough to justify a trade.</h2>
        <p>
          Buyer growth and narrative activity support further investigation. Shared-funder clues,
          creator selling, and reconstructed exit data keep the conclusion uncertain.
        </p>
        <dl className="decision-facts">
          <div><dt>Net flow</dt><dd>{formatUsd(snapshot.lifecycleFlow.netFlowUsd)}</dd></div>
          <div><dt>New buyers</dt><dd>{formatNumber(snapshot.lifecycleFlow.uniqueBuyersPerMinute, 1)} / min</dd></div>
          <div><dt>Common funder clues</dt><dd>{formatPct(snapshot.coordinationWash.commonFunderEvidencePct)}</dd></div>
          <div><dt>{formatUsd(probe?.notionalUsd)} simulated exit</dt><dd>{probe ? `${formatPct(probe.retentionPct)} retained` : "Unavailable"}</dd></div>
        </dl>
      </section>

      <section className="assessment-rail" aria-label="Four independent research assessments">
        <AssessmentRow
          assessment={outputs.opportunity}
          kind="opportunity"
          label="Opportunity"
          meaning="Evidence associated with later upside in this synthetic replay."
        />
        <AssessmentRow
          assessment={outputs.integrityRisk}
          kind="integrity"
          label="Integrity risk"
          meaning="Coordination and manufactured-activity clues. These do not prove identity or intent."
        />
        <AssessmentRow
          assessment={outputs.executability}
          kind="tradability"
          label="Tradability"
          meaning="Whether the stated order sizes could plausibly enter and exit after costs."
        />
        <AssessmentRow
          assessment={outputs.evidenceConfidence}
          kind="evidence"
          label="Evidence quality"
          meaning="Coverage, timing, provenance, reconstruction, and missing information."
        />
      </section>

      <section className="evidence-list" aria-labelledby="evidence-title">
        <div className="section-title-row">
          <div><span className="kicker">Evidence</span><h2 id="evidence-title">Open only what you need</h2></div>
          <p>Every section uses information available by the selected cutoff.</p>
        </div>

        <EvidenceDisclosure
          defaultOpen
          title="Demand and ownership"
          summary={`${formatUsd(snapshot.lifecycleFlow.netFlowUsd)} net flow · ${formatPct(snapshot.ownershipCreator.topTenOwnerWalletSharePct)} held by top 10 owner wallets`}
        >
          <dl className="evidence-grid">
            <div><dt>Curve velocity</dt><dd>{formatNumber(snapshot.lifecycleFlow.curveVelocityPctPointsPerMinute, 2)} points / min</dd></div>
            <div><dt>Buy/sell imbalance</dt><dd>{formatNumber(snapshot.lifecycleFlow.buySellImbalance, 2)}</dd></div>
            <div><dt>Largest owner</dt><dd>{formatPct(snapshot.ownershipCreator.topOwnerWalletSharePct)}</dd></div>
            <div><dt>Effective owners</dt><dd>{formatNumber(snapshot.ownershipCreator.ownerWalletEffectiveCount, 1)}</dd></div>
            <div><dt>Creator net sold</dt><dd>{formatUsd(snapshot.ownershipCreator.creatorNetSoldUsd)}</dd></div>
            <div><dt>Metadata mutable</dt><dd>{snapshot.ownershipCreator.authorities.metadataMutable ? "Yes" : "No"}</dd></div>
          </dl>
        </EvidenceDisclosure>

        <EvidenceDisclosure
          title="Wallet coordination"
          summary={`${formatPct(snapshot.coordinationWash.commonFunderEvidencePct)} common-funder clues · ${formatPct(snapshot.coordinationWash.sameSlotEarlyBuyerPct)} same-slot buyers`}
        >
          <p>
            Shared funders, repeated cohorts, same-slot ordering, circular transfers, and synchronized exits
            raise suspicion together. Exchanges and popular trading bots can create false links.
          </p>
          <dl className="evidence-grid">
            <div><dt>Recurring cohort</dt><dd>{formatPct(snapshot.coordinationWash.recurringCohortEvidencePct)}</dd></div>
            <div><dt>Synchronized exits</dt><dd>{formatPct(snapshot.coordinationWash.synchronizedExitPct)}</dd></div>
            <div><dt>Coordination rule score</dt><dd>{formatNumber(snapshot.coordinationWash.coordinationEvidenceScore.score0To100, 1)} / 100</dd></div>
            <div><dt>Wash rule score</dt><dd>{formatNumber(snapshot.coordinationWash.washEvidenceScore.score0To100, 1)} / 100</dd></div>
          </dl>
          <p className="fine-print">These are clues, not proof of a cabal, common ownership, wrongdoing, or intent.</p>
        </EvidenceDisclosure>

        <EvidenceDisclosure
          title="Narrative and attention"
          summary={`${formatNumber(snapshot.narrativePaidAttention.postsPerMinute, 1)} posts / min · ${formatPct(snapshot.narrativePaidAttention.uniqueAuthorRatioPct)} unique-author ratio`}
        >
          <dl className="evidence-grid">
            <div><dt>Post acceleration</dt><dd>{formatNumber(snapshot.narrativePaidAttention.postVelocityChangePerMinute, 2)} / min²</dd></div>
            <div><dt>Exact identity mentions</dt><dd>{formatPct(snapshot.narrativePaidAttention.exactIdentityMentionRatioPct)}</dd></div>
            <div><dt>Likely automated posts</dt><dd>{formatPct(snapshot.narrativePaidAttention.likelyAutomatedPostRatioPct)}</dd></div>
            <div><dt>Paid exposure</dt><dd>{formatUsd(snapshot.narrativePaidAttention.paidExposureUsd)}</dd></div>
          </dl>
          <ul className="narrative-list">
            {snapshot.narrativePaidAttention.topNarratives.map((narrative) => (
              <li key={narrative.id}><strong>{narrative.label}</strong><span>{formatNumber(narrative.postCount, 0)} posts · novelty {formatNumber(narrative.noveltyScore0To100, 0)} / 100</span></li>
            ))}
          </ul>
        </EvidenceDisclosure>

        <EvidenceDisclosure
          title="Tradability"
          summary={`${formatUsd(snapshot.liquidityExecution.quoteReserveUsd)} quote reserve · ${snapshot.liquidityExecution.probes.length} simulated exits`}
        >
          <div className="table-scroll" role="region" aria-label="Simulated exit results">
            <table>
              <caption>Reconstructed exit probes at the selected cutoff</caption>
              <thead><tr><th>Order size</th><th>Value returned</th><th>Retained</th><th>Price impact</th><th>Route</th></tr></thead>
              <tbody>
                {snapshot.liquidityExecution.probes.map((item) => (
                  <tr key={`${item.direction}-${item.notionalUsd}`}>
                    <td>{formatUsd(item.notionalUsd)}</td>
                    <td>{formatUsd(item.expectedValueUsd)}</td>
                    <td>{formatPct(item.retentionPct)}</td>
                    <td>{formatPct(item.priceImpactPct)}</td>
                    <td>{item.routeAvailable ? "Available" : "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine-print">Historical router latency and private failed routes cannot be recreated exactly.</p>
        </EvidenceDisclosure>

        <EvidenceDisclosure
          title="Evidence quality and limits"
          summary={`${snapshot.sourceFidelity.exactCount} exact · ${snapshot.sourceFidelity.reconstructedCount} reconstructed · ${snapshot.sourceFidelity.proxyCount} proxy`}
        >
          <ul className="caveat-list">
            {snapshot.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
          </ul>
        </EvidenceDisclosure>

        <EvidenceDisclosure
          title="Later outcome"
          summary="Hindsight, excluded from every cutoff calculation"
        >
          <div className="hindsight-boundary" role="note">
            <strong>Outcome label, not input evidence</strong>
            <p>This information became available later and was not used to construct the assessments above.</p>
          </div>
          <dl className="evidence-grid">
            <div><dt>Graduated</dt><dd>{summary.historicalOutcome.graduatedAtSeconds === null ? "No" : `After ${formatNumber(summary.historicalOutcome.graduatedAtSeconds, 0)} seconds`}</dd></div>
            <div><dt>24h peak</dt><dd>{formatNumber(summary.historicalOutcome.peakPriceMultipleTwentyFourHours, 1)}× launch price</dd></div>
            <div><dt>24h drawdown</dt><dd>{formatPct(summary.historicalOutcome.maximumDrawdownTwentyFourHoursPct)}</dd></div>
            <div><dt>Survived 24h</dt><dd>{summary.historicalOutcome.survivedTwentyFourHours ? "Yes" : "No"}</dd></div>
          </dl>
        </EvidenceDisclosure>
      </section>
    </>
  );
}

function CurrentReport({
  enrichment,
  onBack,
}: {
  enrichment: TokenEnrichmentResponse;
  onBack: () => void;
}) {
  const identity = currentIdentity(enrichment);
  const pair = matchingDexPair(enrichment, true);
  const returnedProviders = Object.values(enrichment.providers).filter(
    (provider) => provider.data !== null,
  ).length;

  return (
    <>
      <div className="report-heading-row">
        <ScreenHeading
          section="Coin report"
          title="Understand this coin"
          description="This report contains only the current provider snapshot. Historical cutoffs and model-dependent judgments stay unavailable."
        />
        <button className="text-button" type="button" onClick={onBack}>Back to coins</button>
      </div>

      <section className="identity-bar" aria-label="Selected current token">
        <div className="token-monogram" aria-hidden="true">{identity.symbol.slice(0, 2).toUpperCase()}</div>
        <div className="identity-main">
          <span className="truth-label truth-live">Live current lookup</span>
          <strong>{identity.name} <small>{identity.symbol}</small></strong>
          <code>{shortAddress(enrichment.mint)}</code>
        </div>
        <div className="identity-time">
          <span>Checked at</span>
          <strong>{formatTime(enrichment.generatedAt)}</strong>
        </div>
      </section>

      <div className="truth-notice truth-notice-current" role="note">
        <strong>Current evidence only.</strong>
        <span>No historical observation, validated probability, wallet-coordination conclusion, or trade recommendation is inferred from this lookup.</span>
      </div>

      <section className="live-assessments" aria-label="Current research availability">
        <article><span>Opportunity</span><strong>Unavailable</strong><p>No trained point-in-time model exists.</p></article>
        <article><span>Integrity risk</span><strong>Unavailable</strong><p>No as-of wallet graph has been reconstructed.</p></article>
        <article><span>Tradability</span><strong>{pair?.liquidityUsd ? "Partial" : "Unavailable"}</strong><p>Current liquidity is not a complete entry-and-exit simulation.</p></article>
        <article><span>Evidence quality</span><strong>Partial</strong><p>{returnedProviders} of 6 lookup providers returned current evidence.</p></article>
      </section>

      <section className="evidence-list" aria-labelledby="current-evidence-title">
        <div className="section-title-row">
          <div><span className="kicker">Current evidence</span><h2 id="current-evidence-title">What the sources returned</h2></div>
        </div>
        <EvidenceDisclosure defaultOpen title="Market snapshot" summary="Price, liquidity, supply, and recent activity">
          <dl className="evidence-grid">
            <div><dt>Jupiter price</dt><dd>{formatUsd(enrichment.providers.jupiter.data?.usdPrice, 8)}</dd></div>
            <div><dt>DEX price</dt><dd>{formatUsd(pair?.priceUsd, 8)}</dd></div>
            <div><dt>Liquidity</dt><dd>{formatUsd(pair?.liquidityUsd)}</dd></div>
            <div><dt>Market cap</dt><dd>{formatUsd(pair?.marketCapUsd)}</dd></div>
            <div><dt>Supply</dt><dd>{formatNumber(enrichment.providers.solana.data?.uiAmount, 2)}</dd></div>
            <div><dt>Active boosts</dt><dd>{formatNumber(pair?.activeBoosts, 0)}</dd></div>
          </dl>
        </EvidenceDisclosure>
        <EvidenceDisclosure title="Provider results" summary={`${returnedProviders} current responses · metered providers ${enrichment.meteredProvidersEnabled ? "enabled" : "disabled"}`}>
          <ul className="lookup-provider-list">
            {Object.entries(enrichment.providers).map(([key, provider]) => (
              <LookupProviderRow
                key={key}
                label={provider.providerId}
                state={provider.status.state}
                value={provider.status.message}
              />
            ))}
          </ul>
        </EvidenceDisclosure>
        <EvidenceDisclosure title="What is missing" summary="Why this cannot become a forecast yet">
          <ul className="caveat-list">
            <li>No ingested launch history at point-in-time cutoffs.</li>
            <li>No complete early-buyer, funder, transfer, or exit graph.</li>
            <li>No historical narrative snapshot aligned to the launch.</li>
            <li>No walk-forward model performance or calibrated probability.</li>
            <li>No executable route history, failure tape, or prospective paper fill.</li>
          </ul>
        </EvidenceDisclosure>
      </section>
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

  return (
    <>
      <ScreenHeading
        section="Data & methods"
        title="Audit the research"
        description="Check what the app can know, where each fact comes from, and which claims have not earned trust yet."
      />

      <section className="audit-summary" aria-labelledby="audit-summary-title">
        <div><span className="kicker">Current status</span><h2 id="audit-summary-title">Connection is not collection</h2></div>
        <dl>
          <div><dt>Automated sources online</dt><dd>{registryLoading ? "Checking" : `${connected} of ${automated}`}</dd></div>
          <div><dt>Historical cohort</dt><dd>Not ingested</dd></div>
          <div><dt>Validated model</dt><dd>Not trained</dd></div>
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
  replay,
  summaries,
  initialScreen = "coins",
  initialTerm = "",
}: ResearchConsoleProps) {
  const [screen, setScreen] = useState<AppScreen>(initialScreen);
  const [reportMode, setReportMode] = useState<ReportMode>("demo");
  const [cutoff, setCutoff] = useState<CutoffLabel>("5m");
  const [registry, setRegistry] = useState<SourceRegistryResponse | null>(null);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [mint, setMint] = useState("");
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [enrichment, setEnrichment] = useState<TokenEnrichmentResponse | null>(null);
  const summary = summaries[cutoff];

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
    function syncScreenFromHistory() {
      setScreen(screenFromLocation());
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

  function openReport(mode: ReportMode) {
    setReportMode(mode);
    setScreen("report");
    updateScreenUrl("report");
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
            enrichment={enrichment}
            lookupError={lookupError}
            lookupState={lookupState}
            mint={mint}
            onMintChange={setMint}
            onOpenCurrent={() => openReport("current")}
            onOpenDemo={() => openReport("demo")}
            onSubmit={submitMint}
            registry={registry}
            registryLoading={registryLoading}
            replay={replay}
          />
        ) : null}

        {screen === "report" ? (
          reportMode === "current" && enrichment?.confirmation.confirmed ? (
            <CurrentReport enrichment={enrichment} onBack={backToCoins} />
          ) : (
            <DemoReport
              cutoff={cutoff}
              onBack={backToCoins}
              onCutoff={setCutoff}
              replay={replay}
              summary={summary}
            />
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
