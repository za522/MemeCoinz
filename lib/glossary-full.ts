import type { GlossaryTerm } from "./documentation";

/**
 * Complete in-app glossary derived from docs/11-terminology-appendix.md.
 * Keep term keys unique so search results remain deterministic.
 */
export const FULL_GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    term: "Altcoin",
    definition: "Any cryptocurrency other than Bitcoin. Memecoins are a speculative subset of altcoins, not a separate technical asset class.",
    category: "Market",
  },
  {
    term: "API",
    definition: "A documented machine-to-machine interface for requesting data or actions from a service.",
    category: "Data",
  },
  {
    term: "API key / bearer token",
    definition: "A secret credential that identifies and authorizes the app to use an API. It must remain on the server and out of browser code, logs, and screenshots.",
    category: "Data",
    whyItMatters: "Keeping credentials server-side prevents visitors and browser tools from stealing paid access.",
  },
  {
    term: "Credentialed / keyless",
    definition: "A credentialed endpoint requires a secret account key; a keyless endpoint can be called without one but is usually more tightly rate-limited.",
    category: "Data",
  },
  {
    term: "Archive / archival data",
    definition: "Historical records retained far enough back to reconstruct past events. An endpoint can serve current data without providing a complete archive.",
    category: "Data",
    whyItMatters: "A responsive current-data endpoint may still be unable to support historical replay.",
  },
  {
    term: "Backfill",
    definition: "Loading older observations after they originally occurred. Backfilled event facts may be exact, but old mutable rankings, API latency, or quotes may still be unrecoverable.",
    category: "Data",
    whyItMatters: "Backfill expands the cohort, but it cannot recreate mutable evidence that was never captured.",
  },
  {
    term: "Base58",
    definition: "The text encoding used for Solana addresses, chosen to avoid easily confused characters. Valid Base58 shape does not prove an address is a token mint.",
    category: "Solana",
  },
  {
    term: "Blockchain / ledger",
    definition: "A replicated record of ordered transactions. It proves what the network recorded, but not who economically controls a wallet or why a trade occurred.",
    category: "Solana",
  },
  {
    term: "Contract address / mint address",
    definition: "The unique on-chain identifier for a token. On Solana, “mint” is the usual term; the app identifies an asset by chain plus address, never ticker alone.",
    category: "Solana",
    whyItMatters: "Address-first matching prevents reused names and tickers from mixing unrelated tokens.",
  },
  {
    term: "Decoder / IDL",
    definition: "Versioned instructions that translate raw program bytes into named fields and events. An IDL describes a program interface, but historical program upgrades still need explicit version handling.",
    category: "Data",
  },
  {
    term: "Derived feature",
    definition: "A calculated research value, such as holder concentration, built from one or more observations. It is not raw evidence and must retain its formula version and inputs.",
    category: "Data",
    whyItMatters: "Versioned formulas make scores reproducible and let researchers audit exactly what changed.",
  },
  {
    term: "Dataset / model version",
    definition: "An immutable identifier for the exact records, definitions, code, and trained parameters used in a result, allowing it to be reproduced later.",
    category: "Data",
  },
  {
    term: "DAS",
    definition: "Helius's Digital Asset Standard API, an indexed interface for asset metadata, ownership, supply, authorities, and related token fields.",
    category: "Data",
  },
  {
    term: "Collector",
    definition: "A background service that requests or receives source data, timestamps it, validates it, and stores the raw response plus normalized observations.",
    category: "Data",
  },
  {
    term: "Cache / freshness",
    definition: "A cache briefly reuses a recent response to reduce cost and rate-limit pressure; freshness states how old that response may be.",
    category: "Data",
  },
  {
    term: "Indexer",
    definition: "A service that reads blockchain data and reorganizes it into searchable token, wallet, trade, or pool records.",
    category: "Data",
  },
  {
    term: "Liveness / health check",
    definition: "A small request proving an endpoint responds now. It does not prove historical completeness, every endpoint, or data correctness.",
    category: "Data",
    whyItMatters: "A green health badge confirms reachability only, not research completeness or correctness.",
  },
  {
    term: "Instruction / inner instruction",
    definition: "A transaction asks one or more programs to perform instructions; programs can invoke further inner instructions. Their exact order matters when reconstructing transfers and swaps.",
    category: "Solana",
  },
  {
    term: "Memecoin",
    definition: "A token whose demand is driven mainly by culture, humor, community, attention, or speculation rather than a conventional claim on cash flow.",
    category: "Market",
  },
  {
    term: "Metadata",
    definition: "A token's name, symbol, image, description, and links. Metadata can be wrong, copied, mutable, or unavailable even when the token itself exists.",
    category: "Data",
  },
  {
    term: "Normalized observation",
    definition: "A raw source record translated into a stable internal schema while retaining its source, timestamps, and raw evidence link.",
    category: "Data",
    whyItMatters: "Normalization makes sources comparable without discarding the original evidence.",
  },
  {
    term: "Null versus zero",
    definition: "Zero means the value was measured and none occurred; null means the value is unknown, inapplicable, or unavailable. Treating null as zero can create false signals.",
    category: "Data",
    whyItMatters: "Confusing unknown with measured-none can create misleading model signals.",
  },
  {
    term: "Off-chain",
    definition: "Information not natively recorded by the blockchain, such as X posts, website rankings, API receipt times, or a provider's labels.",
    category: "Data",
  },
  {
    term: "On-chain",
    definition: "Recorded in blockchain transactions or account state. It is auditable, but interpretation such as “same person” or “manipulation” is still uncertain.",
    category: "Solana",
  },
  {
    term: "Program",
    definition: "Solana's term for on-chain executable code, similar to a smart contract on other chains.",
    category: "Solana",
  },
  {
    term: "Provenance / lineage",
    definition: "The trace from a displayed value back through its formula and normalized observations to the original source response or transaction.",
    category: "Data",
    whyItMatters: "Every claim should be traceable to a formula, observation, and original source.",
  },
  {
    term: "Raw evidence",
    definition: "The original provider response, transaction payload, or metadata body stored unchanged so it can be audited or decoded again.",
    category: "Data",
  },
  {
    term: "RPC",
    definition: "Remote Procedure Call, the standard interface used to ask a blockchain node for transactions, accounts, blocks, or current state.",
    category: "Solana",
  },
  {
    term: "Rate limit / quota",
    definition: "The maximum request speed / total allowed usage over a billing interval. A technically public API can still be unsuitable for large-scale collection.",
    category: "Data",
  },
  {
    term: "Schema",
    definition: "The agreed names, types, and relationships used to store data consistently.",
    category: "Data",
  },
  {
    term: "Source health",
    definition: "Evidence that a collector is working, such as its last successful request, latency, coverage, schema version, and recent errors. A healthy connection says nothing about signal quality.",
    category: "Data",
    whyItMatters: "Operational reliability and predictive usefulness are separate questions.",
  },
  {
    term: "SLA",
    definition: "Service-level agreement, a provider's contractual commitment for availability, support, or performance. A public endpoint commonly has no production SLA.",
    category: "Data",
  },
  {
    term: "Signature / transaction ID",
    definition: "The unique identifier normally used to locate a Solana transaction.",
    category: "Solana",
  },
  {
    term: "Stream / WebSocket",
    definition: "A persistent connection that sends new events as they occur, unlike repeatedly requesting a snapshot.",
    category: "Data",
  },
  {
    term: "Token account",
    definition: "A Solana account that holds a particular token for an owner. One wallet can control many token accounts.",
    category: "Solana",
  },
  {
    term: "Token supply",
    definition: "The number of token units currently minted, adjusted for decimals. Supply does not say how much is liquid or independently owned.",
    category: "Market",
  },
  {
    term: "Wallet",
    definition: "A public address or set of keys controlling blockchain accounts. One person may use many wallets, and multiple people or services may share operational infrastructure.",
    category: "Solana",
  },
  {
    term: "AMM",
    definition: "Automated market maker, a program that prices swaps from pool reserves according to a formula instead of a traditional order book.",
    category: "Market",
  },
  {
    term: "Bonding curve",
    definition: "A formula used to change a token's price as its curve inventory is bought or sold during launch.",
    category: "Market",
  },
  {
    term: "Curve progress",
    definition: "How far a launch has moved toward its bonding-curve completion condition. It describes lifecycle progress, not guaranteed future demand.",
    category: "Market",
  },
  {
    term: "Curve velocity",
    definition: "Bonding-curve progress gained per unit of time, usually percentage points per minute.",
    category: "Market",
  },
  {
    term: "DEX",
    definition: "Decentralized exchange, an on-chain venue where swaps occur through programs and liquidity pools.",
    category: "Market",
  },
  {
    term: "FDV",
    definition: "Fully diluted valuation, token price multiplied by the maximum or total assumed supply. It is not the amount of money invested or available liquidity.",
    category: "Market",
    whyItMatters: "FDV can look large even when very little capital is available for an exit.",
  },
  {
    term: "Freeze authority / mint authority",
    definition: "Privileged controls that may freeze token accounts or create more supply. Revocation removes that particular control but does not eliminate every other risk.",
    category: "Market",
  },
  {
    term: "Graduation / completion / migration",
    definition: "The lifecycle transition when a launch finishes its curve and liquidity moves or is created on a post-curve AMM. Exact mechanics depend on program version and venue.",
    category: "Market",
  },
  {
    term: "Liquidity",
    definition: "The ability to buy or sell without moving the price severely. High displayed value does not guarantee a large order can exit safely.",
    category: "Market",
    whyItMatters: "Displayed value is not the same as the depth available to a specific order.",
  },
  {
    term: "Liquidity lock / LP burn",
    definition: "Mechanisms intended to prevent a liquidity provider from withdrawing pool liquidity. Their meaning depends on the exact program and must be verified on-chain.",
    category: "Market",
  },
  {
    term: "Market capitalization",
    definition: "Current token price multiplied by circulating supply, often estimated imperfectly for new tokens.",
    category: "Market",
  },
  {
    term: "Net flow / buy-sell imbalance",
    definition: "Buys minus sells, often divided by total flow for comparability. It shows directional pressure in a window, not whether the buyers are independent.",
    category: "Market",
  },
  {
    term: "OHLCV",
    definition: "Open, high, low, close, and volume summarized for a time interval.",
    category: "Market",
  },
  {
    term: "Pool",
    definition: "On-chain reserves used by an AMM to facilitate swaps between two assets.",
    category: "Market",
  },
  {
    term: "PnL",
    definition: "Profit and loss. Realized PnL comes from completed sales; unrealized PnL values unsold holdings at an assumed price and may overstate what can actually be exited.",
    category: "Market",
  },
  {
    term: "Reserves",
    definition: "The actual quantities of assets held by a curve or pool at a particular moment.",
    category: "Market",
  },
  {
    term: "TVL",
    definition: "Total value locked, the quoted value of assets deposited in a protocol or pool. It is related to, but not identical to, executable liquidity.",
    category: "Market",
  },
  {
    term: "Virtual reserves",
    definition: "Accounting values used by a bonding-curve formula to set prices; they need not equal assets that can be withdrawn like ordinary pool reserves.",
    category: "Market",
  },
  {
    term: "Atomic bundle",
    definition: "A group of transactions intended to land together under defined ordering or all-or-nothing conditions. Similar timing alone does not prove a bundle.",
    category: "Execution",
    whyItMatters: "Exact bundle evidence is stronger than same-slot or adjacent-transaction inference.",
  },
  {
    term: "Balance change / delta",
    definition: "The difference between an account's balance before and after a transaction, used to reconstruct economic flows and fees.",
    category: "Execution",
  },
  {
    term: "Base asset / quote asset",
    definition: "In a trading pair, the base asset is the token being priced and the quote asset is what its price is expressed in, such as SOL or USDC.",
    category: "Execution",
  },
  {
    term: "Capacity",
    definition: "The maximum trade size for which a strategy's expected return remains plausible after price impact and costs.",
    category: "Execution",
  },
  {
    term: "Executable return",
    definition: "Return calculated from prices and fills a trade could plausibly obtain after fees, latency, slippage, failures, and exit constraints.",
    category: "Execution",
    whyItMatters: "This is the outcome a realistic strategy can target, unlike an optimistic chart return.",
  },
  {
    term: "Failed exit",
    definition: "An attempted or modeled sell that cannot complete at the required size or time, rather than being valued at an optimistic displayed price.",
    category: "Execution",
    whyItMatters: "Counting failed exits prevents illiquid winners from receiving impossible valuations.",
  },
  {
    term: "Fee payer",
    definition: "The account that pays a Solana transaction's network fees. Shared fee payers can be a coordination clue but are also common with exchanges and trading bots.",
    category: "Execution",
    whyItMatters: "Shared fee payers are useful clues but common services can create false links.",
  },
  {
    term: "Jito bundle",
    definition: "One or more Solana transactions submitted through Jito's Block Engine for controlled landing and ordering. Exact live bundle evidence is stronger than historical inference from adjacency or tips.",
    category: "Execution",
  },
  {
    term: "Jito tip",
    definition: "An extra payment associated with Block Engine delivery. It can support a bundle hypothesis but does not by itself identify a common owner.",
    category: "Execution",
  },
  {
    term: "Latency",
    definition: "Time between deciding, submitting, landing, observing, and confirming a transaction. Fast-moving prices make each delay economically important.",
    category: "Execution",
  },
  {
    term: "MEV",
    definition: "Maximal extractable value, profit obtained by controlling or exploiting transaction inclusion and ordering, such as arbitrage or sandwiching.",
    category: "Execution",
  },
  {
    term: "Notional / order size",
    definition: "The stated value of a trade before considering fees or the amount ultimately received.",
    category: "Execution",
  },
  {
    term: "Paper trading",
    definition: "Recording simulated orders under explicit fill and cost rules without risking money.",
    category: "Execution",
  },
  {
    term: "Price impact",
    definition: "The price movement caused by the size of the trade itself relative to available liquidity.",
    category: "Execution",
    whyItMatters: "A profitable-looking signal can disappear when the strategy's own order moves the market.",
  },
  {
    term: "Priority fee",
    definition: "An optional extra Solana fee intended to improve a transaction's scheduling priority during congestion.",
    category: "Execution",
  },
  {
    term: "Quote / route",
    definition: "A route is a proposed sequence of pools for a swap; a quote estimates its output and costs at one moment. It is not a guaranteed fill.",
    category: "Execution",
  },
  {
    term: "Quote-side reserve",
    definition: "The amount of the quote asset in a curve or pool. It is not the same as TVL, which usually values both sides.",
    category: "Execution",
  },
  {
    term: "Reserve coverage",
    definition: "Quote-side reserve divided by order size, used as a rough depth check. It does not replace a real size-specific quote.",
    category: "Execution",
  },
  {
    term: "Sandwich attack",
    definition: "Transactions placed immediately before and after a victim's trade to profit from the victim's price impact.",
    category: "Execution",
  },
  {
    term: "Shadow mode",
    definition: "The live system records the prediction and hypothetical action before the outcome but sends no trade.",
    category: "Execution",
    whyItMatters: "It tests live timing and availability without placing capital at risk.",
  },
  {
    term: "Slippage",
    definition: "The difference between the expected trade price and the executed or realistically simulated price.",
    category: "Execution",
  },
  {
    term: "Rug pull",
    definition: "Informal term for insiders abruptly removing liquidity, selling concentrated holdings, or abusing control so other holders lose value. The app measures observable risk and events rather than declaring intent from one clue.",
    category: "Execution",
    whyItMatters: "The app should report observable evidence and uncertainty rather than assert intent.",
  },
  {
    term: "Slot",
    definition: "Solana's ordered unit of leader time in which transactions may be processed. It is more precise for ordering than a coarse wall-clock timestamp.",
    category: "Solana",
  },
  {
    term: "Transaction ordering",
    definition: "The sequence in which transactions and instructions execute. Early position can materially change a launch trade's price and outcome.",
    category: "Execution",
  },
  {
    term: "Bot-likeness",
    definition: "A probabilistic score based on machine-like timing or repetition. It is evidence to inspect, not proof that an account is automated or malicious.",
    category: "Coordination",
  },
  {
    term: "Cabal",
    definition: "Informal market language for a coordinated group of traders or promoters. The app reports coordination evidence and benign alternatives, not a guilt label.",
    category: "Coordination",
    whyItMatters: "Coordination must be estimated from multiple clues and benign alternatives, not declared from one edge.",
  },
  {
    term: "Cohort",
    definition: "A set selected by a rule fixed before outcomes are known, such as all eligible launches in a contiguous date range. A wallet cohort is a recurring set of wallets observed across launches.",
    category: "Coordination",
  },
  {
    term: "Common funder",
    definition: "A wallet or service that supplied funds to multiple wallets. Exchanges, bridges, and popular funding bots make this a noisy link unless supported by more evidence.",
    category: "Coordination",
    whyItMatters: "Exchanges, bridges, and bots make one shared funding source weak evidence by itself.",
  },
  {
    term: "Circular flow / self-funding loop",
    definition: "Funds or tokens move through several wallets and return to a related origin. It can indicate manufactured activity but also needs service-wallet and routing controls.",
    category: "Coordination",
  },
  {
    term: "Creator fee extraction",
    definition: "Fees or other value received by a token creator from venue mechanics, measured separately from the creator's token sales.",
    category: "Coordination",
  },
  {
    term: "Creator / deployer",
    definition: "The address that created or initialized a token. It may be a person, bot, launch service, or operational proxy rather than the ultimate owner.",
    category: "Coordination",
  },
  {
    term: "Early buyer / sniper",
    definition: "A wallet buying very near launch. “Sniper” usually implies unusually fast positioning, but timing alone does not prove privileged information.",
    category: "Coordination",
  },
  {
    term: "Effective owners",
    definition: "The intuitive number of equally sized holders that would create the observed concentration, calculated as 1 / HHI; higher means more distributed ownership.",
    category: "Coordination",
  },
  {
    term: "Funder graph",
    definition: "A network linking wallets through funding transfers, fee payers, token flows, and timing evidence.",
    category: "Coordination",
  },
  {
    term: "HHI",
    definition: "Herfindahl-Hirschman Index, the sum of squared ownership shares. Higher HHI means supply is concentrated among fewer holders.",
    category: "Coordination",
    whyItMatters: "It turns a holder distribution into a comparable concentration measure.",
  },
  {
    term: "Owner view versus account view",
    definition: "Account concentration counts token accounts separately; owner concentration first groups accounts controlled by the same wallet. The owner view is more economically meaningful when ownership can be resolved.",
    category: "Coordination",
  },
  {
    term: "Recurring early-buyer cohort",
    definition: "A similar group of wallets repeatedly appearing early across different launches, which is stronger evidence than one shared edge but still needs false-positive controls.",
    category: "Coordination",
  },
  {
    term: "Same-slot buyers",
    definition: "Buyers whose transactions land in the same Solana slot. This is an ordering clue, not proof they coordinated.",
    category: "Coordination",
    whyItMatters: "Same-slot activity narrows timing but does not establish common control.",
  },
  {
    term: "Synchronized exits",
    definition: "Several wallets selling within an unusually tight interval or transaction sequence. This may suggest coordination but can also follow the same public signal.",
    category: "Coordination",
  },
  {
    term: "Sybil behavior",
    definition: "One actor using many apparent identities or wallets to look like independent participants.",
    category: "Coordination",
  },
  {
    term: "Wash trading",
    definition: "Trades designed mainly to create misleading activity or volume rather than transfer genuine economic risk. Detection is probabilistic because independent traders can sometimes form similar patterns.",
    category: "Coordination",
  },
  {
    term: "Boost / paid attention",
    definition: "Purchased platform visibility, advertising, or promotion. It must be separated from organic attention and on-chain demand.",
    category: "Narrative",
  },
  {
    term: "Callout",
    definition: "A public token recommendation or mention on a platform. It is user-generated promotion, not verification or due diligence.",
    category: "Narrative",
  },
  {
    term: "Duplicate-text ratio",
    definition: "The share of posts whose wording is identical or nearly identical, used as one clue for coordinated promotion.",
    category: "Narrative",
  },
  {
    term: "Embedding",
    definition: "A numeric representation of text meaning used to compare or cluster narratives. It does not determine whether a claim is true.",
    category: "Narrative",
  },
  {
    term: "Entity resolution",
    definition: "Matching social content to the correct token using the exact mint, official accounts, URLs, and full name. Ticker-only matches are low confidence because tickers are reused.",
    category: "Narrative",
    whyItMatters: "Bad identity matching contaminates every downstream social and narrative feature.",
  },
  {
    term: "Lead-lag",
    definition: "Whether changes in one series, such as social attention, systematically occur before or after another, such as buys. Sequence alone does not prove causation.",
    category: "Narrative",
  },
  {
    term: "Mention velocity",
    definition: "New matching posts per unit of time; acceleration measures whether that rate is increasing or decreasing.",
    category: "Narrative",
  },
  {
    term: "Narrative",
    definition: "The story or theme associated with a token, such as an event, character, community joke, or political moment.",
    category: "Narrative",
  },
  {
    term: "Narrative cluster",
    definition: "Posts grouped by semantic similarity so the app can distinguish several stories within one token's mention volume.",
    category: "Narrative",
  },
  {
    term: "Novelty score",
    definition: "A versioned estimate of how different a narrative is from previously observed text. Novel does not mean truthful, organic, or investable.",
    category: "Narrative",
  },
  {
    term: "Unique-author ratio",
    definition: "Distinct authors divided by posts. A low ratio can mean a small group is producing much of the apparent attention.",
    category: "Narrative",
  },
  {
    term: "available_at",
    definition: "The earliest time the research system could legitimately have used an observation after source and processing delay. Models may not use a record when available_at is later than their decision cutoff.",
    category: "Data",
    whyItMatters: "It is the timestamp that enforces what a historical model was actually allowed to know.",
  },
  {
    term: "Event time",
    definition: "When the underlying event happened according to its source, such as a slot or post timestamp.",
    category: "Data",
  },
  {
    term: "Computed at",
    definition: "When a particular formula and feature version finished producing a derived value. It must not be confused with when its inputs became available.",
    category: "Data",
  },
  {
    term: "Commitment / finality",
    definition: "Solana observations progress from processed to confirmed to finalized as the network gains confidence they are canonical. Research should record the level seen at decision time and any later correction.",
    category: "Data",
  },
  {
    term: "Canonical",
    definition: "The transaction or block history ultimately accepted by the network rather than a discarded fork or unconfirmed observation.",
    category: "Data",
  },
  {
    term: "Observed at / ingested at",
    definition: "When our collector received the evidence / when it finished storing it. These are different from event time and available_at.",
    category: "Data",
  },
  {
    term: "Point-in-time snapshot",
    definition: "A reconstruction containing only evidence legitimately available by a stated historical cutoff.",
    category: "Research",
    whyItMatters: "It is the core guardrail against accidentally using future information.",
  },
  {
    term: "Historical replay",
    definition: "Recomputing past snapshots and hypothetical decisions under point-in-time rules, while preserving which inputs were exact, reconstructed, proxied, or unavailable.",
    category: "Research",
  },
  {
    term: "Cutoff",
    definition: "The decision time after launch, such as 30 seconds or 5 minutes, at which features and predictions are frozen.",
    category: "Research",
  },
  {
    term: "Exact fidelity",
    definition: "Direct authoritative evidence or a value captured by our live collector without substituting another measurement.",
    category: "Data",
  },
  {
    term: "Reconstructed fidelity",
    definition: "A value deterministically rebuilt from sufficiently complete primary evidence.",
    category: "Data",
  },
  {
    term: "Proxy fidelity",
    definition: "A useful approximation that is not equivalent to the desired fact, such as inferred bundle clues instead of a known bundle ID.",
    category: "Data",
  },
  {
    term: "Unavailable",
    definition: "Evidence that cannot be lawfully or technically recovered for the specified time. It remains missing rather than being silently replaced.",
    category: "Data",
  },
  {
    term: "Missingness",
    definition: "The pattern of absent values. Missing data can itself be informative, so the reason and source coverage must be recorded.",
    category: "Data",
  },
  {
    term: "Point-in-time leak",
    definition: "Any use of information that existed in history but was not actually available by the simulated decision time.",
    category: "Research",
    whyItMatters: "A single leaked field can invalidate an otherwise polished backtest.",
  },
  {
    term: "Ablation",
    definition: "Re-running a model after removing one feature or feature family to measure whether it adds genuine out-of-sample value.",
    category: "Research",
  },
  {
    term: "Backtest",
    definition: "A simulation of a rule or model on historical data. It is credible only when inputs are point-in-time, the denominator is complete, and execution costs are realistic.",
    category: "Research",
    whyItMatters: "Historical performance is meaningful only with a complete cohort, point-in-time inputs, and realistic execution.",
  },
  {
    term: "Base rate",
    definition: "How often an outcome occurs before using any predictive feature. A model must be judged against this starting frequency.",
    category: "Research",
    whyItMatters: "A model must improve on how often the outcome already happens without a signal.",
  },
  {
    term: "Brier score",
    definition: "The average squared error of probability forecasts; lower is better. It evaluates both confidence and correctness, not just ranking.",
    category: "Research",
  },
  {
    term: "Calibration",
    definition: "Agreement between predicted probabilities and observed frequencies; among cases predicted at 20%, roughly 20% should occur over a large sample.",
    category: "Research",
    whyItMatters: "A ranked score is not a usable probability unless its confidence matches observed frequencies.",
  },
  {
    term: "Evidence confidence",
    definition: "A separate assessment of source coverage, fidelity, freshness, and finality. It is not the probability of profit.",
    category: "Research",
  },
  {
    term: "Denominator",
    definition: "Every item eligible for the study, including failures and tokens never shown on a winner list.",
    category: "Research",
    whyItMatters: "Including failures and unseen launches prevents winner-only conclusions.",
  },
  {
    term: "Drawdown",
    definition: "The fall from a portfolio or strategy's previous peak to a later trough.",
    category: "Market",
  },
  {
    term: "Embargo",
    definition: "A time gap placed around train/test boundaries to stop overlapping labels or nearby information from leaking across the split.",
    category: "Research",
  },
  {
    term: "Expected value (EV)",
    definition: "Probability-weighted average gain or loss after all modeled costs. Positive historical EV is an estimate, not a guarantee.",
    category: "Research",
  },
  {
    term: "Executability",
    definition: "Whether a hypothetical trade can plausibly enter and exit at the stated size, time, route, costs, and failure assumptions.",
    category: "Execution",
  },
  {
    term: "Integrity risk",
    definition: "Evidence of concentration, coordination, manufactured activity, or unsafe control. It is not an accusation or a prediction of price direction.",
    category: "Coordination",
  },
  {
    term: "Label / outcome",
    definition: "The precisely versioned future event being predicted, such as graduation or positive executable return over a fixed horizon and size.",
    category: "Research",
  },
  {
    term: "Label leakage / look-ahead bias",
    definition: "Allowing the model to see the outcome or information created after its decision time, making historical performance falsely strong.",
    category: "Research",
    whyItMatters: "Leakage can make a useless strategy appear highly predictive.",
  },
  {
    term: "Precision@k",
    definition: "Among the top k ranked alerts, the fraction that achieved the stated outcome. It does not describe opportunities omitted below k.",
    category: "Research",
  },
  {
    term: "Opportunity",
    definition: "The estimated probability or ranking of one precisely defined future outcome. It remains separate from integrity risk, executability, and evidence confidence.",
    category: "Research",
    whyItMatters: "Separating upside from integrity, evidence, and execution avoids hiding distinct risks in one score.",
  },
  {
    term: "Purging",
    definition: "Removing training cases whose feature or outcome windows overlap a test period, preventing information from crossing the boundary.",
    category: "Research",
  },
  {
    term: "Recall",
    definition: "Among all cases that achieved the outcome, the fraction the model selected. High precision can coexist with low recall.",
    category: "Research",
  },
  {
    term: "Regime / regime drift",
    definition: "The broader market environment / a change in that environment that can make relationships learned earlier stop working.",
    category: "Research",
  },
  {
    term: "Selection bias",
    definition: "A sample differs systematically from the population because of how it was selected, such as querying social data only for already-successful tokens.",
    category: "Research",
  },
  {
    term: "Tail loss",
    definition: "A rare but unusually large loss in the worst part of the return distribution.",
    category: "Research",
  },
  {
    term: "Survivorship bias",
    definition: "Studying only assets that survived long enough to be visible and excluding rapid failures.",
    category: "Research",
    whyItMatters: "Rapid failures are part of the population and must remain in the study.",
  },
  {
    term: "Walk-forward validation",
    definition: "Train on earlier time periods and evaluate on the next unseen period, repeating forward through time without random future-to-past mixing.",
    category: "Research",
  },
  {
    term: "Cloudflare D1",
    definition: "The app's SQL database for normalized, queryable research records and indices. It is storage, not an external market-data source.",
    category: "Data",
  },
  {
    term: "Cloudflare R2",
    definition: "Object storage for immutable raw responses and larger evidence files referenced by D1.",
    category: "Data",
  },
  {
    term: "DEX Screener",
    definition: "A multi-chain DEX indexer and screener used here only as secondary pool, market, profile, boost, and paid-order enrichment under its API terms.",
    category: "Data",
    whyItMatters: "It is useful enrichment, but it should not replace primary on-chain evidence.",
  },
  {
    term: "Fomo.family",
    definition: "A social trading and execution product used as a manual UX reference. It is not an approved automated data source without a supported API and written permission.",
    category: "Data",
    whyItMatters: "Without a supported API and permission, it remains a manual reference rather than an automated feed.",
  },
  {
    term: "Helius",
    definition: "A Solana infrastructure provider offering RPC, archive, streaming, and webhook services.",
    category: "Data",
  },
  {
    term: "LaserStream",
    definition: "Helius's low-latency Solana data-streaming product. It is a prospective event feed, not the same interface as a one-time DAS asset lookup.",
    category: "Data",
  },
  {
    term: "IPFS / Arweave",
    definition: "Distributed content systems often used to host token metadata. Availability and immutability differ, so the app stores the exact URI, retrieved bytes, hash, and time.",
    category: "Data",
  },
  {
    term: "Jito",
    definition: "Solana infrastructure for transaction delivery, ordering, bundles, and tips through its Block Engine.",
    category: "Execution",
    whyItMatters: "Live bundle status has a short retention window, so exact evidence must be captured prospectively.",
  },
  {
    term: "Jupiter",
    definition: "A Solana liquidity aggregator that can propose swap routes and provide contemporaneous execution quotes.",
    category: "Execution",
    whyItMatters: "A contemporaneous size-specific quote is stronger execution evidence than a displayed reference price.",
  },
  {
    term: "Jupiter Price v3 / Swap V2",
    definition: "Price v3 provides current reference prices; Swap V2 builds or executes current routes. A price response is not a size-specific executable quote.",
    category: "Execution",
  },
  {
    term: "memescope.net",
    definition: "An editorial/consumer website with meme-coin content; it is not treated as a primary research feed.",
    category: "Data",
  },
  {
    term: "MemeScope",
    definition: "An overloaded product name used by more than one service. The app names the provider explicitly, such as Solana Tracker MemeScope or Photon MemeScope.",
    category: "Data",
  },
  {
    term: "Photon MemeScope",
    definition: "A fast launch-scanner and trading interface used as a product benchmark, not a presumed licensed feed.",
    category: "Data",
  },
  {
    term: "Pump.fun",
    definition: "A Solana token-launch and trading venue whose on-chain programs define the initial research cohort.",
    category: "Market",
  },
  {
    term: "PumpSwap",
    definition: "Pump.fun's post-curve AMM program used for pool creation and trading after applicable migrations.",
    category: "Market",
  },
  {
    term: "Raydium",
    definition: "A Solana DEX used in older Pump.fun migration flows and other post-launch liquidity.",
    category: "Market",
  },
  {
    term: "Solana",
    definition: "The blockchain used for the first controlled research cohort.",
    category: "Solana",
  },
  {
    term: "Solana Tracker",
    definition: "A commercial indexed Solana data provider. Its normalized fields can accelerate research, but critical events and proprietary risk labels require chain validation and attribution.",
    category: "Data",
    whyItMatters: "Provider labels accelerate research but require attribution and validation against chain evidence.",
  },
  {
    term: "X API",
    definition: "X's official developer interface for post counts, search, and streams, subject to credentials, product access, cost, and content-use terms.",
    category: "Narrative",
    whyItMatters: "Raw mentions are easy to manufacture, so identity-safe matching and quality features are essential.",
  },
];

