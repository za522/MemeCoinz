"use client";

import { useMemo, useState } from "react";
import type {
  CutoffLabel,
  EvidenceFidelity,
  IllustrativeAssessment,
  ResearchReplay,
  ResearchSummary,
  SourceRecord,
} from "@/lib/research";
import { RESEARCH_CUTOFFS } from "@/lib/research";

type ConsoleMode = "replay" | "live";
type ConsoleView =
  | "cohort"
  | "brief"
  | "coordination"
  | "narrative"
  | "execution"
  | "validation"
  | "sources";

interface ResearchConsoleProps {
  replay: ResearchReplay;
  summaries: Record<CutoffLabel, ResearchSummary>;
}

const VIEWS: Array<{ id: ConsoleView; label: string; shortLabel: string }> = [
  { id: "brief", label: "Research brief", shortLabel: "Brief" },
  { id: "coordination", label: "Coordination", shortLabel: "Coord." },
  { id: "narrative", label: "Narrative", shortLabel: "Narrative" },
  { id: "execution", label: "Execution", shortLabel: "Execution" },
  { id: "validation", label: "Validation lab", shortLabel: "Validate" },
  { id: "sources", label: "Sources & fidelity", shortLabel: "Sources" },
];

const FIDELITY_LABELS: Record<EvidenceFidelity, string> = {
  exact: "A · exact",
  reconstructed: "B · reconstructed",
  proxy: "C · proxy",
  unavailable: "D · unavailable",
};

function formatUsd(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function formatPct(value: number, maximumFractionDigits = 1) {
  return `${formatNumber(value, maximumFractionDigits)}%`;
}

function formatSignedPct(value: number, maximumFractionDigits = 1) {
  return `${value >= 0 ? "+" : ""}${formatNumber(value, maximumFractionDigits)}%`;
}

function shortAddress(value: string) {
  if (value.length < 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function scoreTone(
  kind: "opportunity" | "risk" | "execution" | "evidence",
  score: number,
) {
  if (kind === "risk") {
    return score >= 65 ? "danger" : score >= 40 ? "caution" : "positive";
  }
  if (score >= 65) return "positive";
  if (score >= 40) return "caution";
  return "neutral";
}

function scorePhrase(label: string, assessment: IllustrativeAssessment) {
  return `${label}: ${assessment.band.replace("-", " ")}`;
}

function FidelityBadge({ fidelity }: { fidelity: EvidenceFidelity }) {
  return (
    <span className={`fidelity-badge fidelity-${fidelity}`}>
      {FIDELITY_LABELS[fidelity]}
    </span>
  );
}

function StatusDot({ status }: { status: SourceRecord["status"] }) {
  return (
    <span className={`status-label status-${status}`}>
      <span aria-hidden="true" className="status-dot" />
      {status}
    </span>
  );
}

function ScoreRail({
  label,
  assessment,
  kind,
  help,
}: {
  label: string;
  assessment: IllustrativeAssessment;
  kind: "opportunity" | "risk" | "execution" | "evidence";
  help: string;
}) {
  const tone = scoreTone(kind, assessment.score0To100);

  return (
    <div className="score-rail">
      <div className="score-rail-header">
        <div>
          <span className="eyebrow">{label}</span>
          <strong>{assessment.score0To100}</strong>
        </div>
        <span className={`score-band tone-${tone}`}>{assessment.band.replace("-", " ")}</span>
      </div>
      <div
        aria-label={`${label} ${assessment.score0To100} out of 100`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={assessment.score0To100}
        className="score-track"
        role="meter"
      >
        <span className={`score-fill tone-${tone}`} style={{ width: `${assessment.score0To100}%` }} />
      </div>
      <p>{help}</p>
    </div>
  );
}

function PrimaryRead({ summary }: { summary: ResearchSummary }) {
  const snapshot = summary.selectedCutoff;
  const { opportunity, integrityRisk, executability, evidenceConfidence } = snapshot.outputs;
  const opportunityTone = scoreTone("opportunity", opportunity.score0To100);

  return (
    <section className="primary-read" aria-labelledby="primary-read-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Point-in-time interpretation</span>
          <h2 id="primary-read-title">What the evidence says at {snapshot.cutoff.label}</h2>
        </div>
        <span className={`read-mark tone-${opportunityTone}`} aria-hidden="true">
          {opportunity.score0To100}
        </span>
      </div>
      <p className="read-lede">
        Flow and social velocity make this launch worth investigating, but the coordination
        evidence and exit depth prevent it from becoming an automatic trade instruction.
      </p>
      <div className="read-facts" role="list" aria-label="Research interpretation facts">
        <span role="listitem">{scorePhrase("Opportunity", opportunity)}</span>
        <span role="listitem">{scorePhrase("Integrity risk", integrityRisk)}</span>
        <span role="listitem">{scorePhrase("Executability", executability)}</span>
        <span role="listitem">{scorePhrase("Evidence", evidenceConfidence)}</span>
      </div>
      <p className="method-note">
        These are transparent illustrative heuristics, not validated probabilities. Open a score
        below to see its components and assumptions.
      </p>
    </section>
  );
}

function OutputScoreboard({ summary }: { summary: ResearchSummary }) {
  const { opportunity, integrityRisk, executability, evidenceConfidence } =
    summary.selectedCutoff.outputs;

  return (
    <section className="scoreboard" aria-label="Separate research outputs">
      <ScoreRail
        assessment={opportunity}
        help="Evidence associated with later upside in this replay."
        kind="opportunity"
        label="Opportunity"
      />
      <ScoreRail
        assessment={integrityRisk}
        help="Manipulation and coordination clues. Higher means more concern."
        kind="risk"
        label="Integrity risk"
      />
      <ScoreRail
        assessment={executability}
        help="Whether the stated order size can enter and leave after costs."
        kind="execution"
        label="Executability"
      />
      <ScoreRail
        assessment={evidenceConfidence}
        help="Coverage, provenance, timing fidelity, and missingness."
        kind="evidence"
        label="Evidence confidence"
      />
    </section>
  );
}

function MetricCell({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric-cell">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function SignalEvolution({ summary }: { summary: ResearchSummary }) {
  const rows = [
    { key: "opportunity", label: "Opportunity", tone: "positive" },
    { key: "integrityRisk", label: "Integrity risk", tone: "danger" },
    { key: "executability", label: "Executability", tone: "evidence" },
    { key: "evidenceConfidence", label: "Evidence", tone: "neutral" },
  ] as const;

  return (
    <section className="panel signal-evolution" aria-labelledby="signal-evolution-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">No hindsight</span>
          <h3 id="signal-evolution-title">Signal evolution by decision cutoff</h3>
        </div>
        <span className="panel-tag">available_at enforced</span>
      </div>
      <div className="timeline-axis" aria-hidden="true">
        <span />
        {summary.timeline.map((item) => (
          <b key={item.cutoff.label}>{item.cutoff.label}</b>
        ))}
      </div>
      <div className="signal-rows">
        {rows.map((row) => (
          <div className="signal-row" key={row.key}>
            <span>{row.label}</span>
            {summary.timeline.map((item) => {
              const value = item.outputs[row.key].score0To100;
              return (
                <div className="mini-track" key={item.cutoff.label} title={`${value}/100`}>
                  <span className={`tone-${row.tone}`} style={{ width: `${value}%` }} />
                  <b>{value}</b>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function LifecyclePanel({ summary }: { summary: ResearchSummary }) {
  const maxFlow = Math.max(
    ...summary.timeline.map((item) => Math.abs(item.lifecycleFlow.netFlowUsd)),
    1,
  );

  return (
    <section className="panel lifecycle-panel" aria-labelledby="lifecycle-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Lifecycle & flow</span>
          <h3 id="lifecycle-title">Demand, curve progress, and holder formation</h3>
        </div>
        <FidelityBadge fidelity="exact" />
      </div>
      <div className="flow-chart">
        {summary.timeline.map((item) => {
          const relativeHeight = 18 + (Math.abs(item.lifecycleFlow.netFlowUsd) / maxFlow) * 72;
          const positive = item.lifecycleFlow.netFlowUsd >= 0;
          return (
            <div className="flow-column" key={item.cutoff.label}>
              <span className="flow-value">{formatUsd(item.lifecycleFlow.netFlowUsd)}</span>
              <div className="flow-bar-zone">
                <span
                  className={positive ? "flow-bar positive" : "flow-bar negative"}
                  style={{ height: `${relativeHeight}%` }}
                />
              </div>
              <b>{item.cutoff.label}</b>
            </div>
          );
        })}
      </div>
      <div className="metric-strip">
        <MetricCell
          label="Curve velocity"
          note="percentage points per minute"
          value={formatNumber(summary.selectedCutoff.lifecycleFlow.curveVelocityPctPointsPerMinute, 2)}
        />
        <MetricCell
          label="Unique buyers"
          note="new wallets per minute"
          value={formatNumber(summary.selectedCutoff.lifecycleFlow.uniqueBuyersPerMinute, 1)}
        />
        <MetricCell
          label="Buy/sell imbalance"
          note="signed share of gross flow"
          value={formatNumber(summary.selectedCutoff.lifecycleFlow.buySellImbalance, 2)}
        />
      </div>
    </section>
  );
}

function DenominatorPanel() {
  return (
    <aside className="panel denominator-panel" aria-labelledby="denominator-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Base rate first</span>
          <h3 id="denominator-title">Most launches do not graduate</h3>
        </div>
      </div>
      <div className="denominator-number">
        <strong>0.66%</strong>
        <span>raw graduation rate</span>
      </div>
      <div className="denominator-funnel" aria-label="655,770 launches and 4,338 graduations">
        <div><b>655,770</b><span>Pump.fun launches</span></div>
        <div><b>4,338</b><span>graduated</span></div>
        <div className="pending"><b>?</b><span>net executable winners</span></div>
      </div>
      <p>
        One September–October 2025 on-chain cohort. Graduation marks early demand, not durable
        profitability. Our replay keeps dead and untradeable launches in the denominator.
      </p>
      <a href="https://arxiv.org/abs/2602.14860" rel="noreferrer" target="_blank">
        Read the cohort study <span aria-hidden="true">↗</span>
      </a>
    </aside>
  );
}

function CaveatLedger({ summary }: { summary: ResearchSummary }) {
  return (
    <section className="panel caveat-ledger" aria-labelledby="caveat-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Evidence ledger</span>
          <h3 id="caveat-title">What this replay cannot safely claim</h3>
        </div>
        <span className="panel-tag">null ≠ zero</span>
      </div>
      <ol>
        {summary.selectedCutoff.caveats.slice(0, 5).map((caveat, index) => (
          <li key={caveat}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{caveat}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MarketRegimePanel({ summary }: { summary: ResearchSummary }) {
  const regime = summary.selectedCutoff.marketRegime;
  return (
    <section className="panel regime-panel" aria-labelledby="regime-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Market regime</span>
          <h3 id="regime-title">Context around this launch</h3>
        </div>
        <FidelityBadge fidelity="exact" />
      </div>
      <div className="regime-read">
        <div>
          <span>Regime</span>
          <strong>{regime.label.replace("-", " ")}</strong>
        </div>
        <div>
          <span>Risk appetite</span>
          <strong>{regime.riskAppetiteScore0To100}/100</strong>
        </div>
      </div>
      <dl className="definition-grid">
        <div><dt>SOL 1h return</dt><dd>{formatSignedPct(regime.solReturnOneHourPct)}</dd></div>
        <div><dt>SOL 1h volatility</dt><dd>{formatPct(regime.solRealizedVolatilityOneHourPct)}</dd></div>
        <div><dt>Block congestion</dt><dd>{formatPct(regime.blockCongestionPct)}</dd></div>
        <div><dt>Launches in 1h</dt><dd>{formatNumber(regime.pumpLaunchesLastHour, 0)}</dd></div>
        <div><dt>Priority fee</dt><dd>{formatNumber(regime.medianPriorityFeeMicroLamports, 0)} µL</dd></div>
        <div><dt>Median 5m volume</dt><dd>{formatUsd(regime.medianLaunchVolumeFiveMinutesUsd)}</dd></div>
      </dl>
      <p className="method-note">
        A feature only earns value if it generalizes across congestion, risk appetite, and launch
        saturation instead of memorizing one hot week.
      </p>
    </section>
  );
}

function BriefView({ summary }: { summary: ResearchSummary }) {
  const snapshot = summary.selectedCutoff;
  return (
    <div className="view-stack">
      <PrimaryRead summary={summary} />
      <OutputScoreboard summary={summary} />
      <div className="two-column-layout wide-left">
        <SignalEvolution summary={summary} />
        <DenominatorPanel />
      </div>
      <div className="two-column-layout wide-left">
        <LifecyclePanel summary={summary} />
        <section className="panel identity-panel" aria-labelledby="identity-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Ownership & creator</span>
              <h3 id="identity-title">Control surface at {snapshot.cutoff.label}</h3>
            </div>
            <FidelityBadge fidelity="reconstructed" />
          </div>
          <dl className="definition-grid">
            <div><dt>Top owner wallet</dt><dd>{formatPct(snapshot.ownershipCreator.topOwnerWalletSharePct)}</dd></div>
            <div><dt>Top 10, owner-resolved</dt><dd>{formatPct(snapshot.ownershipCreator.topTenOwnerWalletSharePct)}</dd></div>
            <div><dt>Effective owners</dt><dd>{formatNumber(snapshot.ownershipCreator.ownerWalletEffectiveCount, 1)}</dd></div>
            <div><dt>Creator net sold</dt><dd>{formatUsd(snapshot.ownershipCreator.creatorNetSoldUsd)}</dd></div>
            <div><dt>Prior graduation rate</dt><dd>{snapshot.ownershipCreator.creatorPriorGraduationRatePct === null ? "No history" : formatPct(snapshot.ownershipCreator.creatorPriorGraduationRatePct)}</dd></div>
            <div><dt>Metadata mutable</dt><dd>{snapshot.ownershipCreator.authorities.metadataMutable ? "Yes" : "No"}</dd></div>
          </dl>
          <p className="method-note">
            Owner-resolved concentration groups token accounts by controlling wallet before HHI is
            calculated. Program-owned accounts are excluded where attribution is known.
          </p>
        </section>
      </div>
      <div className="two-column-layout wide-left">
        <CaveatLedger summary={summary} />
        <MarketRegimePanel summary={summary} />
      </div>
    </div>
  );
}

function CohortView({ replay }: { replay: ResearchReplay }) {
  return (
    <div className="view-stack">
      <section className="investigation-header">
        <span className="eyebrow">Launch cohort</span>
        <h2>Start with every launch, not the tokens that survived</h2>
        <p>
          The production feed will contain every eligible creation transaction, including launches
          with no buyer, no route, an immediate failure, or an impossible exit. This deployment has
          one synthetic fixture and does not pretend that it is a cohort.
        </p>
      </section>
      <div className="cohort-state" role="status">
        <div><span>Deployment dataset</span><strong>Fixture only</strong><small>1 synthetic launch</small></div>
        <div><span>Historical cohort</span><strong>Not ingested</strong><small>credential and coverage gate</small></div>
        <div><span>Live shadow</span><strong>Not connected</strong><small>0 authenticated feeds</small></div>
      </div>
      <div className="two-column-layout wide-left">
        <section className="panel cohort-table-panel" aria-labelledby="launch-feed-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Lifecycle feed contract</span>
              <h3 id="launch-feed-title">Observed launches</h3>
            </div>
            <span className="panel-tag">no winner filter</span>
          </div>
          <div className="cohort-filter-row" aria-label="Cohort filters">
            <button className="active" type="button">All launches</button>
            <button disabled type="button">Graduated</button>
            <button disabled type="button">Survived 24h</button>
            <button disabled type="button">Executable winners</button>
          </div>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Launches in the current deployment dataset</caption>
              <thead><tr><th>Asset</th><th>Created</th><th>Venue</th><th>Coverage</th><th>Outcome state</th><th>Dataset role</th></tr></thead>
              <tbody>
                <tr>
                  <td><strong>{replay.identity.name}</strong><small>${replay.identity.ticker}</small></td>
                  <td>{new Date(replay.identity.createdAt).toISOString().replace("T", " ").slice(0, 19)} UTC</td>
                  <td>Pump.fun / Solana</td>
                  <td>7/7 pillars</td>
                  <td>Label included for UI testing</td>
                  <td><span className="implementation-status partial">Synthetic fixture</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="empty-cohort-row">
            <span aria-hidden="true">+</span>
            <p><strong>Real rows appear only after the cohort contract passes.</strong> Coverage, decoder reconciliation, retention rights, and outcome-independent inclusion must be audited first.</p>
          </div>
        </section>
        <DenominatorPanel />
      </div>
      <section className="panel cohort-definition" aria-labelledby="cohort-definition-title">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Frozen before labels</span>
            <h3 id="cohort-definition-title">Initial cohort contract</h3>
          </div>
          <span className="panel-tag">6–12 month target</span>
        </div>
        <div className="cohort-contract-grid">
          <div><span>Population</span><strong>Every eligible Pump.fun create</strong><p>Named program IDs and versions, contiguous UTC bounds, no later-success conditions.</p></div>
          <div><span>Context window</span><strong>Earlier actor history</strong><p>Creator, funder, wallet-cohort, and narrative histories built strictly before each cutoff.</p></div>
          <div><span>Decision times</span><strong>30s · 1m · 5m · 15m · 1h</strong><p>The same feature registry is materialized at every cutoff with explicit missingness.</p></div>
          <div><span>Outcome horizons</span><strong>1h · 6h · 24h · 7d</strong><p>Executable returns, exit success, survival, drawdown, and integrity events.</p></div>
        </div>
      </section>
    </div>
  );
}

function ComponentBreakdown({
  title,
  assessment,
}: {
  title: string;
  assessment: IllustrativeAssessment;
}) {
  return (
    <details className="component-breakdown">
      <summary>
        <span>{title}</span>
        <b>{assessment.score0To100}/100</b>
      </summary>
      <div className="component-list">
        {assessment.components.map((component) => (
          <div className="component-row" key={component.key}>
            <div>
              <strong>{component.label}</strong>
              <span>{component.explanation}</span>
            </div>
            <div className="component-contribution">
              <b>{formatNumber(component.normalized0To100, 0)}</b>
              <small>weight {formatNumber(component.weight, 2)}</small>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function CoordinationFlow() {
  return (
    <div className="coordination-flow" aria-label="Illustrative coordination evidence chain">
      <div className="flow-stage funder-stage">
        <span className="stage-label">Funding origin</span>
        <div className="graph-node primary-node"><b>F-17</b><small>common funder</small></div>
      </div>
      <span className="flow-arrow" aria-hidden="true">→</span>
      <div className="flow-stage wallet-stage">
        <span className="stage-label">Early buyers</span>
        <div className="node-stack">
          <div className="graph-node"><b>W-02</b><small>slot +0</small></div>
          <div className="graph-node"><b>W-11</b><small>slot +0</small></div>
          <div className="graph-node"><b>W-29</b><small>slot +1</small></div>
          <div className="graph-node faded"><b>+7</b><small>linked clues</small></div>
        </div>
      </div>
      <span className="flow-arrow" aria-hidden="true">→</span>
      <div className="flow-stage action-stage">
        <span className="stage-label">Observed behavior</span>
        <div className="action-list">
          <span>same-slot entries</span>
          <span>repeat cohort</span>
          <span>synchronized exits</span>
        </div>
      </div>
    </div>
  );
}

function CoordinationView({ summary }: { summary: ResearchSummary }) {
  const snapshot = summary.selectedCutoff;
  const coordination = snapshot.coordinationWash;
  const ownership = snapshot.ownershipCreator;

  return (
    <div className="view-stack">
      <section className="investigation-header">
        <span className="eyebrow">Coordination & integrity</span>
        <h2>Evidence of related behavior, never proof of identity</h2>
        <p>
          Common funders, repeated early-buyer cohorts, transaction ordering, circular flow, and
          exit timing are combined as clues. Exchange withdrawals and popular bots can create
          false connections.
        </p>
      </section>
      <section className="panel coordination-panel" aria-labelledby="coordination-graph-title">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Evidence chain</span>
            <h3 id="coordination-graph-title">Early wallet relationships at {snapshot.cutoff.label}</h3>
          </div>
          <FidelityBadge fidelity="reconstructed" />
        </div>
        <CoordinationFlow />
        <p className="graph-caption">
          Wallet labels are pseudonymous within this replay. A visible edge means a recorded clue,
          not common ownership or wrongdoing.
        </p>
      </section>
      <div className="metric-tape" aria-label="Coordination evidence metrics">
        <MetricCell label="Common-funder buyers" note="share of early buyers" value={formatPct(coordination.commonFunderEvidencePct)} />
        <MetricCell label="Recurring cohort" note="seen together before cutoff" value={formatPct(coordination.recurringCohortEvidencePct)} />
        <MetricCell label="Same-slot buyers" note="ordering clue" value={formatPct(coordination.sameSlotEarlyBuyerPct)} />
        <MetricCell label="Synchronized exits" note="not yet mature at early cutoffs" value={formatPct(coordination.synchronizedExitPct)} />
      </div>
      <div className="two-column-layout">
        <section className="panel breakdown-panel" aria-labelledby="score-components-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Open the model</span>
              <h3 id="score-components-title">Component facts and weights</h3>
            </div>
          </div>
          <ComponentBreakdown assessment={coordination.coordinationEvidenceScore} title="Coordination evidence" />
          <ComponentBreakdown assessment={coordination.washEvidenceScore} title="Wash-trading evidence" />
          <ComponentBreakdown assessment={snapshot.outputs.integrityRisk} title="Combined integrity risk" />
        </section>
        <section className="panel owner-resolution-panel" aria-labelledby="owner-resolution-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Concentration</span>
              <h3 id="owner-resolution-title">Account view versus owner view</h3>
            </div>
          </div>
          <div className="compare-bars">
            <div>
              <span>Top 10 token accounts</span>
              <b>{formatPct(ownership.topTenTokenAccountSharePct)}</b>
              <div className="score-track"><i style={{ width: `${Math.min(ownership.topTenTokenAccountSharePct, 100)}%` }} /></div>
            </div>
            <div>
              <span>Top 10 controlling owners</span>
              <b>{formatPct(ownership.topTenOwnerWalletSharePct)}</b>
              <div className="score-track"><i style={{ width: `${Math.min(ownership.topTenOwnerWalletSharePct, 100)}%` }} /></div>
            </div>
          </div>
          <p>
            A single wallet can control many token accounts. Research built on raw account counts
            alone can understate concentration.
          </p>
          <dl className="mini-definition-list">
            <div><dt>Owner HHI</dt><dd>{formatNumber(ownership.ownerWalletHhi, 4)}</dd></div>
            <div><dt>Effective owners</dt><dd>{formatNumber(ownership.ownerWalletEffectiveCount, 1)}</dd></div>
            <div><dt>Creator holding</dt><dd>{formatPct(ownership.creatorCurrentSharePct)}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function NarrativeView({ summary }: { summary: ResearchSummary }) {
  const snapshot = summary.selectedCutoff;
  const narrative = snapshot.narrativePaidAttention;
  const maxRate = Math.max(...summary.timeline.map((item) => item.narrativePaidAttention.postsPerMinute), 1);

  return (
    <div className="view-stack">
      <section className="investigation-header">
        <span className="eyebrow">Narrative & paid attention</span>
        <h2>Measure what was said, who said it, and when it arrived</h2>
        <p>
          Identity resolution uses the exact mint, official URLs, and full token name. Tickers are
          excluded from strict counts because they are reused and easy to spoof.
        </p>
      </section>
      <div className="narrative-hero-grid">
        <section className="panel mention-velocity-panel" aria-labelledby="mention-velocity-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Historical post stream</span>
              <h3 id="mention-velocity-title">Mention velocity by cutoff</h3>
            </div>
            <FidelityBadge fidelity="reconstructed" />
          </div>
          <div className="mention-chart">
            {summary.timeline.map((item) => {
              const rate = item.narrativePaidAttention.postsPerMinute;
              return (
                <div className="mention-column" key={item.cutoff.label}>
                  <b>{formatNumber(rate, 1)}</b>
                  <div><span style={{ height: `${20 + (rate / maxRate) * 75}%` }} /></div>
                  <small>{item.cutoff.label}</small>
                </div>
              );
            })}
          </div>
          <div className="metric-strip">
            <MetricCell label="Authors / posts" note="source diversity" value={formatPct(narrative.uniqueAuthorRatioPct)} />
            <MetricCell label="Exact identity" note="mint or official URL" value={formatPct(narrative.exactIdentityMentionRatioPct)} />
            <MetricCell label="Automation clues" note="heuristic, not a bot verdict" value={formatPct(narrative.likelyAutomatedPostRatioPct)} />
          </div>
        </section>
        <section className="panel narrative-clusters" aria-labelledby="narrative-cluster-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Frozen embeddings</span>
              <h3 id="narrative-cluster-title">Narrative clusters</h3>
            </div>
            <span className="panel-tag">model versioned</span>
          </div>
          <ol>
            {narrative.topNarratives.map((cluster, index) => (
              <li key={cluster.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{cluster.label}</strong>
                  <small>{cluster.postCount} posts · {cluster.uniqueAuthorCount} authors</small>
                </div>
                <b>{cluster.noveltyScore0To100}</b>
              </li>
            ))}
          </ol>
          <p className="method-note">
            Historical text can be embedded today if its creation time precedes the cutoff. Current
            likes or follower counts cannot be substituted for their past state.
          </p>
        </section>
      </div>
      <section className="panel attention-ledger" aria-labelledby="attention-ledger-title">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Attention provenance</span>
            <h3 id="attention-ledger-title">Organic, paid, and unavailable state</h3>
          </div>
        </div>
        <div className="attention-rows">
          <div><span className="attention-kind organic">Organic</span><strong>{formatNumber(narrative.postsPerMinute, 1)} posts/min</strong><p>Exact-mint and official-URL archive queries.</p><FidelityBadge fidelity="reconstructed" /></div>
          <div><span className="attention-kind paid">Paid</span><strong>{formatUsd(narrative.paidExposureUsd)}</strong><p>Known paid exposure before this decision time.</p><FidelityBadge fidelity="proxy" /></div>
          <div><span className="attention-kind missing">Platform rank</span><strong>{narrative.trendingRank === null ? "Not archived" : `#${narrative.trendingRank}`}</strong><p>Past proprietary rank cannot be recreated without snapshots.</p><FidelityBadge fidelity={narrative.trendingRank === null ? "unavailable" : "proxy"} /></div>
        </div>
      </section>
    </div>
  );
}

function ExecutionView({ summary }: { summary: ResearchSummary }) {
  const snapshot = summary.selectedCutoff;
  const liquidity = snapshot.liquidityExecution;
  const outcome = summary.historicalOutcome;

  return (
    <div className="view-stack">
      <section className="investigation-header">
        <span className="eyebrow">Liquidity & execution</span>
        <h2>A chart return is not a realizable return</h2>
        <p>
          Every forecast is paired with order-size-specific entry and exit assumptions. Fees,
          price impact, route failures, latency, and unsold inventory remain inside the label.
        </p>
      </section>
      <div className="execution-summary-bar">
        <MetricCell label="Quote reserve" note="quote-side reserve, not TVL" value={formatUsd(liquidity.quoteReserveUsd)} />
        <MetricCell label="Pool TVL" note="both sides at observed state" value={formatUsd(liquidity.poolTvlUsd)} />
        <MetricCell label="Execution output" note="illustrative heuristic" value={`${snapshot.outputs.executability.score0To100}/100`} />
      </div>
      <section className="panel quote-table-panel" aria-labelledby="quote-table-title">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Standard-size probes</span>
            <h3 id="quote-table-title">Could this order enter and leave?</h3>
          </div>
          <FidelityBadge fidelity="reconstructed" />
        </div>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Historical execution probes by order size and side</caption>
            <thead>
              <tr><th>Side</th><th>Notional</th><th>Route</th><th>Impact</th><th>Fees</th><th>Total cost</th><th>Value retained</th><th>Latency</th></tr>
            </thead>
            <tbody>
              {liquidity.probes.map((probe, index) => (
                <tr key={`${probe.direction}-${probe.notionalUsd}-${index}`}>
                  <td><span className={`side-badge ${probe.direction}`}>{probe.direction}</span></td>
                  <td>{formatUsd(probe.notionalUsd)}</td>
                  <td>{probe.routeAvailable ? "Available" : "Failed"}</td>
                  <td>{formatPct(probe.priceImpactPct, 2)}</td>
                  <td>{formatUsd(probe.networkAndPriorityFeeUsd, 2)}</td>
                  <td>{formatPct(probe.totalCostPct, 2)}</td>
                  <td>{formatPct(probe.retentionPct, 1)}</td>
                  <td>{probe.quoteLatencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="method-note">
          Historical probes reconstruct pool state and swap math. Exact old router responses and
          transient route failures were never written to chain, so live quote capture runs in
          parallel.
        </p>
      </section>
      <div className="two-column-layout">
        <section className="panel reserve-panel" aria-labelledby="reserve-coverage-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Depth</span>
              <h3 id="reserve-coverage-title">Reserve coverage by order size</h3>
            </div>
          </div>
          <div className="coverage-list">
            {liquidity.reserveCoverageByNotional.map((item) => (
              <div key={item.notionalUsd}>
                <span>{formatUsd(item.notionalUsd)}</span>
                <div className="score-track"><i style={{ width: `${Math.min(item.reserveCoverageMultiple * 3, 100)}%` }} /></div>
                <b>{formatNumber(item.reserveCoverageMultiple, 1)}×</b>
              </div>
            ))}
          </div>
        </section>
        <section className="panel outcome-panel" aria-labelledby="outcome-label-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">After-the-fact label</span>
              <h3 id="outcome-label-title">Outcome kept outside the cutoff</h3>
            </div>
            <FidelityBadge fidelity={outcome.fidelity} />
          </div>
          <div className="outcome-grid">
            <div><span>1h peak</span><b>{formatNumber(outcome.peakPriceMultipleOneHour, 2)}×</b></div>
            <div><span>24h drawdown</span><b>{formatSignedPct(-Math.abs(outcome.maximumDrawdownTwentyFourHoursPct))}</b></div>
            <div><span>24h survival</span><b>{outcome.survivedTwentyFourHours ? "Yes" : "No"}</b></div>
          </div>
          <p>Label became available {new Date(outcome.labelAvailableAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.</p>
        </section>
      </div>
    </div>
  );
}

const PILLAR_ROWS = [
  ["Lifecycle & flow", "Curve progress, flow velocity, buyers, holders", "ready"],
  ["Liquidity & execution", "Reserves, standard-size probes, failures, costs", "ready"],
  ["Ownership & creator", "Owner-resolved concentration, controls, prior history", "ready"],
  ["Coordination & wash", "Funders, cohorts, ordering, loops, synchronized exits", "ready"],
  ["Narrative & attention", "Exact identity mentions, embeddings, paid exposure", "partial"],
  ["Market regime", "SOL return, volatility, launch rate, fees, congestion", "ready"],
  ["Source fidelity", "Availability time, coverage, missingness, provenance", "ready"],
] as const;

function ValidationView() {
  return (
    <div className="view-stack">
      <section className="investigation-header">
        <span className="eyebrow">Validation lab</span>
        <h2>All pillars enter the first experiment</h2>
        <p>
          The unit of scope is a bounded, contiguous launch cohort. The first release does not
          remove difficult feature families; it marks their historical fidelity and measures their
          marginal value through ablation.
        </p>
      </section>
      <div className="validation-status" role="status">
        <span className="validation-icon" aria-hidden="true">i</span>
        <div>
          <strong>Protocol implemented, performance not yet claimed</strong>
          <p>The current deployment uses one illustrative replay fixture. A real walk-forward result appears only after the archival cohort is ingested and frozen.</p>
        </div>
      </div>
      <section className="panel experiment-design" aria-labelledby="experiment-design-title">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Predeclared design</span>
            <h3 id="experiment-design-title">Historical replay + prospective shadow</h3>
          </div>
          <span className="panel-tag">no success filtering</span>
        </div>
        <div className="experiment-steps">
          <div><span>01</span><strong>Freeze cohort</strong><p>Every Pump.fun launch in one contiguous 6–12 month window, plus earlier wallet context.</p></div>
          <div><span>02</span><strong>Replay cutoffs</strong><p>Materialize every pillar at 30s, 1m, 5m, 15m, and 1h using event and availability time.</p></div>
          <div><span>03</span><strong>Mature labels</strong><p>Executable returns, drawdown, survival, exit success, and integrity events at fixed horizons.</p></div>
          <div><span>04</span><strong>Walk forward</strong><p>Chronological splits with embargo, purging, calibration, and untouched future launches.</p></div>
        </div>
      </section>
      <div className="two-column-layout wide-left">
        <section className="panel pillar-coverage" aria-labelledby="pillar-coverage-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Acceptance gate</span>
              <h3 id="pillar-coverage-title">No feature family deferred</h3>
            </div>
          </div>
          <div className="pillar-table" role="table" aria-label="Feature pillar implementation status">
            {PILLAR_ROWS.map(([name, description, status]) => (
              <div role="row" key={name}>
                <div role="cell"><strong>{name}</strong><span>{description}</span></div>
                <span role="cell" className={`implementation-status ${status}`}>{status === "ready" ? "Computed" : "Coverage-limited"}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel evaluation-panel" aria-labelledby="evaluation-title">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Report card</span>
              <h3 id="evaluation-title">Metrics that earn deployment</h3>
            </div>
          </div>
          <ul className="metric-checklist">
            <li><b>Calibration</b><span>Brier score and reliability by probability band</span></li>
            <li><b>Ranking</b><span>Precision@k and recall without hiding the denominator</span></li>
            <li><b>Economics</b><span>Net EV after slippage, fees, failures, and unsold inventory</span></li>
            <li><b>Risk</b><span>Drawdown, tail loss, survival, and exit success by order size</span></li>
            <li><b>Stability</b><span>Performance by regime, month, launchpad version, and liquidity band</span></li>
          </ul>
        </section>
      </div>
      <section className="panel ablation-panel" aria-labelledby="ablation-title">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Marginal value</span>
            <h3 id="ablation-title">Ablation plan</h3>
          </div>
          <span className="panel-tag">results pending ingestion</span>
        </div>
        <div className="ablation-grid">
          {[
            ["M0", "Market only", "Lifecycle + regime"],
            ["M1", "+ Wallet graph", "Ownership + coordination"],
            ["M2", "+ Narrative", "Identity-safe social features"],
            ["M3", "+ Execution", "Quotes, costs, and failures"],
            ["M4", "Combined", "All pillars + missingness"],
          ].map(([id, name, detail]) => (
            <div key={id}><span>{id}</span><strong>{name}</strong><small>{detail}</small><b>Awaiting cohort</b></div>
          ))}
        </div>
      </section>
      <section className="panel leakage-panel" aria-labelledby="leakage-title">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Anti-leakage contract</span>
            <h3 id="leakage-title">Information must exist before the decision</h3>
          </div>
        </div>
        <div className="leakage-grid">
          <div><strong>event_at</strong><p>When the underlying event or state existed.</p></div>
          <div><strong>observed_at</strong><p>When a collector first saw the record.</p></div>
          <div><strong>available_at</strong><p>Earliest instant the feature may enter a replay.</p></div>
          <div><strong>computed_at</strong><p>When this versioned calculation was materialized.</p></div>
        </div>
      </section>
    </div>
  );
}

function SourcesView({ replay }: { replay: ResearchReplay }) {
  return (
    <div className="view-stack">
      <section className="investigation-header">
        <span className="eyebrow">Sources & fidelity</span>
        <h2>Every number carries a recovery contract</h2>
        <p>
          Historical availability is field-specific. Immutable ledger events are not the same as
          mutable platform rank, historical profile state, or a quote response that was never
          archived.
        </p>
      </section>
      <section className="panel source-table-panel" aria-labelledby="source-table-title">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Provider registry</span>
            <h3 id="source-table-title">Coverage, limits, and commercial use</h3>
          </div>
          <span className="panel-tag">{replay.sources.length} source contracts</span>
        </div>
        <div className="table-wrap source-table-wrap">
          <table>
            <caption className="sr-only">Research provider status and fidelity</caption>
            <thead><tr><th>Source</th><th>Status</th><th>History</th><th>Fidelity</th><th>Included fields</th><th>Known limitation</th></tr></thead>
            <tbody>
              {replay.sources.map((source) => (
                <tr key={source.id}>
                  <td><strong>{source.label}</strong><small>{source.kind}</small></td>
                  <td><StatusDot status={source.status} /></td>
                  <td>{source.temporalCoverage.replace("-", " ")}</td>
                  <td><FidelityBadge fidelity={source.fidelity} /></td>
                  <td>{source.fields.slice(0, 3).join(", ")}{source.fields.length > 3 ? ` +${source.fields.length - 3}` : ""}</td>
                  <td>{source.limitation ?? "No material limitation recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="recovery-contract" aria-labelledby="recovery-contract-title">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Four fidelity classes</span>
            <h3 id="recovery-contract-title">How historical evidence enters the model</h3>
          </div>
        </div>
        <div className="fidelity-explainer">
          <div><FidelityBadge fidelity="exact" /><strong>Canonical event</strong><p>Immutable transaction, instruction, balance, or timestamp from archive infrastructure.</p></div>
          <div><FidelityBadge fidelity="reconstructed" /><strong>Deterministic replay</strong><p>Point-in-time state recomputed from complete earlier events and versioned logic.</p></div>
          <div><FidelityBadge fidelity="proxy" /><strong>Historical inference</strong><p>Useful but incomplete vendor history, heuristic clustering, or derived substitute.</p></div>
          <div><FidelityBadge fidelity="unavailable" /><strong>Not recoverable</strong><p>Mutable or proprietary state that was never archived. Captured live from now on.</p></div>
        </div>
      </section>
    </div>
  );
}

function LiveShadowView({ replay }: { replay: ResearchReplay }) {
  const connected = replay.sources.filter((source) => source.status === "healthy").length;
  return (
    <div className="live-shadow-empty">
      <div className="live-radar" aria-hidden="true">
        <span>LIVE</span>
        <i /><i /><i />
      </div>
      <span className="eyebrow">Prospective shadow mode</span>
      <h2>Collector contracts are ready. Provider credentials are not installed.</h2>
      <p>
        Live mode intentionally refuses to manufacture an opportunity score. Once feeds are
        connected, immutable predictions, router quotes, failures, rank snapshots, and social
        state are written as observed.
      </p>
      <div className="live-setup-summary">
        <div><strong>{connected}/{replay.sources.length}</strong><span>fixture sources marked healthy</span></div>
        <div><strong>0</strong><span>authenticated live feeds</span></div>
        <div><strong>0</strong><span>capital at risk</span></div>
      </div>
      <div className="live-pillar-list">
        {PILLAR_ROWS.map(([name]) => (
          <div key={name}><span className="empty-status" aria-hidden="true" />{name}<small>awaiting live adapter</small></div>
        ))}
      </div>
      <p className="live-footnote">
        Historical replay remains available in the adjacent mode. Automatic execution stays
        disabled until prospective calibration and paper-fill gates pass.
      </p>
    </div>
  );
}

function ViewContent({
  view,
  summary,
  replay,
}: {
  view: ConsoleView;
  summary: ResearchSummary;
  replay: ResearchReplay;
}) {
  switch (view) {
    case "cohort":
      return <CohortView replay={replay} />;
    case "coordination":
      return <CoordinationView summary={summary} />;
    case "narrative":
      return <NarrativeView summary={summary} />;
    case "execution":
      return <ExecutionView summary={summary} />;
    case "validation":
      return <ValidationView />;
    case "sources":
      return <SourcesView replay={replay} />;
    default:
      return <BriefView summary={summary} />;
  }
}

export function ResearchConsole({ replay, summaries }: ResearchConsoleProps) {
  const [mode, setMode] = useState<ConsoleMode>("replay");
  const [view, setView] = useState<ConsoleView>("brief");
  const [cutoff, setCutoff] = useState<CutoffLabel>("5m");
  const [copied, setCopied] = useState(false);
  const summary = summaries[cutoff];
  const timestamp = useMemo(
    () =>
      new Date(summary.selectedCutoff.asOf).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "UTC",
      }),
    [summary.selectedCutoff.asOf],
  );

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(replay.identity.contractAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="global-header">
        <a className="brand" href="#top" aria-label="MemeTrace home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><b>MEME</b>TRACE</span>
        </a>
        <nav aria-label="Product areas" className="product-nav">
          <button className={view === "cohort" ? "active" : ""} type="button" onClick={() => { setMode("replay"); setView("cohort"); }}>Launches</button>
          <button className={view !== "cohort" && view !== "sources" ? "active" : ""} type="button" onClick={() => { setMode("replay"); setView("brief"); }}>Research lab</button>
          <button className={view === "sources" ? "active" : ""} type="button" onClick={() => { setMode("replay"); setView("sources"); }}>Data coverage</button>
        </nav>
        <div className="header-status">
          <span className="environment-tag">Research preview</span>
          <button className="live-status-button" type="button" onClick={() => setMode("live")}>
            <span aria-hidden="true" />Live shadow
          </button>
        </div>
      </header>

      <main id="top">
        <section className="workspace-head">
          <div className="workspace-context">
            <span className="eyebrow">Point-in-time replay · Solana / Pump.fun</span>
            <h1>Could this have been known at {cutoff}?</h1>
            <p>
              Reconstruct the evidence available before the outcome, then test whether it predicted
              an executable return across the full launch cohort.
            </p>
          </div>
          <div className="mode-switch" aria-label="Research mode">
            <button aria-pressed={mode === "replay"} className={mode === "replay" ? "active" : ""} onClick={() => setMode("replay")} type="button">Historical replay</button>
            <button aria-pressed={mode === "live"} className={mode === "live" ? "active" : ""} onClick={() => setMode("live")} type="button"><span aria-hidden="true" />Live shadow</button>
          </div>
        </section>

        <section className="token-command-bar" aria-label="Selected token and time controls">
          <div className="token-identity">
            <span className="token-monogram" aria-hidden="true">{replay.identity.ticker.slice(0, 2)}</span>
            <div>
              <span className="token-name">{replay.identity.name} <b>${replay.identity.ticker}</b></span>
              <button className="address-button" onClick={copyAddress} type="button">
                {shortAddress(replay.identity.contractAddress)}
                <span aria-live="polite">{copied ? "Copied" : "Copy mint"}</span>
              </button>
            </div>
          </div>
          <div className="cutoff-control">
            <span>Decision cutoff</span>
            <div role="group" aria-label="Select decision cutoff">
              {RESEARCH_CUTOFFS.map((item) => (
                <button
                  aria-pressed={cutoff === item.label}
                  className={cutoff === item.label ? "active" : ""}
                  key={item.label}
                  onClick={() => setCutoff(item.label)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="as-of-block">
            <span>As known by</span>
            <strong>{timestamp} UTC</strong>
            <small>slot-finality aware</small>
          </div>
        </section>

        <div className="fixture-notice" role="note">
          <span aria-hidden="true">i</span>
          <p><strong>Illustrative replay fixture.</strong> The calculations and evidence contracts are implemented; the numbers below are not a validated signal or a recommendation to trade.</p>
        </div>

        <nav className="view-tabs" aria-label="Research views">
          {VIEWS.map((item) => (
            <button
              aria-current={view === item.id ? "page" : undefined}
              className={view === item.id ? "active" : ""}
              key={item.id}
              onClick={() => { setView(item.id); setMode("replay"); }}
              type="button"
            >
              <span className="full-tab-label">{item.label}</span>
              <span className="short-tab-label">{item.shortLabel}</span>
            </button>
          ))}
        </nav>

        <div className="research-canvas">
          {mode === "live" ? <LiveShadowView replay={replay} /> : <ViewContent replay={replay} summary={summary} view={view} />}
        </div>
      </main>

      <footer>
        <div><span className="brand-footer">MEMETRACE</span><p>Research infrastructure for adversarial markets.</p></div>
        <p>Automatic execution disabled · Research fixture v0.1 · Not financial advice</p>
      </footer>
    </div>
  );
}
