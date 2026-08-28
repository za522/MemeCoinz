# Terminology Appendix

Short, plain-English definitions for terms used in the app and research handbook.

## Assets, chains, and data

**Altcoin:** Any cryptocurrency other than Bitcoin. Memecoins are a speculative subset of altcoins, not a separate technical asset class.

**API:** A documented machine-to-machine interface for requesting data or actions from a service.

**API key / bearer token:** A secret credential that identifies and authorizes the app to use an API. It must remain on the server and out of browser code, logs, and screenshots.

**Credentialed / keyless:** A credentialed endpoint requires a secret account key; a keyless endpoint can be called without one but is usually more tightly rate-limited.

**Metered provider gate:** An explicit server switch and request authorization required before the app may call a quota-consuming provider, even when its API key is installed.

**Archive / archival data:** Historical records retained far enough back to reconstruct past events. An endpoint can serve current data without providing a complete archive.

**Backfill:** Loading older observations after they originally occurred. Backfilled event facts may be exact, but old mutable rankings, API latency, or quotes may still be unrecoverable.

**Bounded scan:** A request that intentionally examines only a stated maximum number of signatures, pages, assets, or transactions. It can return real rows without claiming complete coverage.

**Base58:** The text encoding used for Solana addresses, chosen to avoid easily confused characters. Valid Base58 shape does not prove an address is a token mint.

**Blockchain / ledger:** A replicated record of ordered transactions. It proves what the network recorded, but not who economically controls a wallet or why a trade occurred.

**Contract address / mint address:** The unique on-chain identifier for a token. On Solana, “mint” is the usual term; the app identifies an asset by chain plus address, never ticker alone.

**Decoder / IDL:** Versioned instructions that translate raw program bytes into named fields and events. An IDL describes a program interface, but historical program upgrades still need explicit version handling.

**Derived feature:** A calculated research value, such as holder concentration, built from one or more observations. It is not raw evidence and must retain its formula version and inputs.

**Feature snapshot:** The versioned set of feature values for one exact mint, reference clock, and cutoff. Every value keeps its event time, available time, family, fidelity, and missing reason.

**Dataset / model version:** An immutable identifier for the exact records, definitions, code, and trained parameters used in a result, allowing it to be reproduced later.

**DAS:** Helius's Digital Asset Standard API, an indexed interface for asset metadata, ownership, supply, authorities, and related token fields.

**Collector:** A process that requests or receives source data, timestamps it, validates it, and optionally stores raw/normalized evidence. It can be request-driven or continuously scheduled; those coverage modes are not equivalent.

**Pipeline runner:** A protected process that executes one bounded collection, outcome, model, or alert pass. It is not continuous unless a separate scheduler invokes it repeatedly.

**Cache / freshness:** A cache briefly reuses a recent response to reduce cost and rate-limit pressure; freshness states how old that response may be.

**Cursor:** An opaque continuation value returned by an API so the next request can continue from the same boundary instead of silently restarting.

**Indexer:** A service that reads blockchain data and reorganizes it into searchable token, wallet, trade, or pool records.

**Liveness / health check:** A small request proving an endpoint responds now. It does not prove historical completeness, every endpoint, or data correctness.

**Instruction / inner instruction:** A transaction asks one or more programs to perform instructions; programs can invoke further inner instructions. Their exact order matters when reconstructing transfers and swaps.

**Memecoin:** A token whose demand is driven mainly by culture, humor, community, attention, or speculation rather than a conventional claim on cash flow.

**Metadata:** A token's name, symbol, image, description, and links. Metadata can be wrong, copied, mutable, or unavailable even when the token itself exists.

**Normalized observation:** A raw source record translated into a stable internal schema while retaining its source, timestamps, and raw evidence link.

**Null versus zero:** Zero means the value was measured and none occurred; null means the value is unknown, inapplicable, or unavailable. Treating null as zero can create false signals.

**Off-chain:** Information not natively recorded by the blockchain, such as X posts, website rankings, API receipt times, or a provider's labels.

**On-chain:** Recorded in blockchain transactions or account state. It is auditable, but interpretation such as “same person” or “manipulation” is still uncertain.

**Program:** Solana's term for on-chain executable code, similar to a smart contract on other chains.

**Provenance / lineage:** The trace from a displayed value back through its formula and normalized observations to the original source response or transaction.

**Raw evidence:** The original provider response, transaction payload, or metadata body stored unchanged so it can be audited or decoded again.

**RPC:** Remote Procedure Call, the standard interface used to ask a blockchain node for transactions, accounts, blocks, or current state.

**Rate limit / quota:** The maximum request speed / total allowed usage over a billing interval. A technically public API can still be unsuitable for large-scale collection.

**Schema:** The agreed names, types, and relationships used to store data consistently.

**Source health:** Evidence that a collector is working, such as its last successful request, latency, coverage, schema version, and recent errors. A healthy connection says nothing about signal quality.

**Storage state:** Whether this request actually wrote data, returned read-only data, lacked the database binding, or failed. A storage result never changes the original source's fidelity.

**SLA:** Service-level agreement, a provider's contractual commitment for availability, support, or performance. A public endpoint commonly has no production SLA.

**Signature / transaction ID:** The unique identifier normally used to locate a Solana transaction.

**Stream / WebSocket:** A persistent connection that sends new events as they occur, unlike repeatedly requesting a snapshot.

**Token account:** A Solana account that holds a particular token for an owner. One wallet can control many token accounts.

**Token supply:** The number of token units currently minted, adjusted for decimals. Supply does not say how much is liquid or independently owned.

**Wallet:** A public address or set of keys controlling blockchain accounts. One person may use many wallets, and multiple people or services may share operational infrastructure.

## Launch and market structure

**AMM:** Automated market maker, a program that prices swaps from pool reserves according to a formula instead of a traditional order book.

**Bonding curve:** A formula used to change a token's price as its curve inventory is bought or sold during launch.

**Curve progress:** How far a launch has moved toward its bonding-curve completion condition. It describes lifecycle progress, not guaranteed future demand.

**Curve velocity:** Bonding-curve progress gained per unit of time, usually percentage points per minute.

**DEX:** Decentralized exchange, an on-chain venue where swaps occur through programs and liquidity pools.

**FDV:** Fully diluted valuation, token price multiplied by the maximum or total assumed supply. It is not the amount of money invested or available liquidity.

**Freeze authority / mint authority:** Privileged controls that may freeze token accounts or create more supply. Revocation removes that particular control but does not eliminate every other risk.

**Graduation / completion / migration:** The lifecycle transition when a launch finishes its curve and liquidity moves or is created on a post-curve AMM. Exact mechanics depend on program version and venue.

**Liquidity:** The ability to buy or sell without moving the price severely. High displayed value does not guarantee a large order can exit safely.

**Liquidity lock / LP burn:** Mechanisms intended to prevent a liquidity provider from withdrawing pool liquidity. Their meaning depends on the exact program and must be verified on-chain.

**Market capitalization:** Current token price multiplied by circulating supply, often estimated imperfectly for new tokens.

**Net flow / buy-sell imbalance:** Buys minus sells, often divided by total flow for comparability. It shows directional pressure in a window, not whether the buyers are independent.

**OHLCV:** Open, high, low, close, and volume summarized for a time interval.

**Pool:** On-chain reserves used by an AMM to facilitate swaps between two assets.

**PnL:** Profit and loss. Realized PnL comes from completed sales; unrealized PnL values unsold holdings at an assumed price and may overstate what can actually be exited.

**Paid-profile discovery:** A token surfaced because a provider returned a promoted or completed profile. It is useful for finding real coins but is selection-biased and cannot represent all launches.

**Reserves:** The actual quantities of assets held by a curve or pool at a particular moment.

**TVL:** Total value locked, the quoted value of assets deposited in a protocol or pool. It is related to, but not identical to, executable liquidity.

**Virtual reserves:** Accounting values used by a bonding-curve formula to set prices; they need not equal assets that can be withdrawn like ordinary pool reserves.

## Transactions and execution

**Atomic bundle:** A group of transactions intended to land together under defined ordering or all-or-nothing conditions. Similar timing alone does not prove a bundle.

**Balance change / delta:** The difference between an account's balance before and after a transaction, used to reconstruct economic flows and fees.

**Base asset / quote asset:** In a trading pair, the base asset is the token being priced and the quote asset is what its price is expressed in, such as SOL or USDC.

**Capacity:** The maximum trade size for which a strategy's expected return remains plausible after price impact and costs.

**Executable return:** Return calculated from prices and fills a trade could plausibly obtain after fees, latency, slippage, failures, and exit constraints.

**Execution quote:** A short-lived provider estimate for one exact trade size, direction, route, and slippage setting. It is not a fill, transaction, or historical price.

**Execution path:** A point-in-time entry plus a time series of realistically available exits and explicit coverage through the outcome horizon. Two current buy/sell quotes are a probe, not a complete path.

**Failed exit:** An attempted or modeled sell that cannot complete at the required size or time, rather than being valued at an optimistic displayed price.

**Fee payer:** The account that pays a Solana transaction's network fees. Shared fee payers can be a coordination clue but are also common with exchanges and trading bots.

**Jito bundle:** One or more Solana transactions submitted through Jito's Block Engine for controlled landing and ordering. Exact live bundle evidence is stronger than historical inference from adjacency or tips.

**Jito tip:** An extra payment associated with Block Engine delivery. It can support a bundle hypothesis but does not by itself identify a common owner.

**Latency:** Time between deciding, submitting, landing, observing, and confirming a transaction. Fast-moving prices make each delay economically important.

**MEV:** Maximal extractable value, profit obtained by controlling or exploiting transaction inclusion and ordering, such as arbitrage or sandwiching.

**Notional / order size:** The stated value of a trade before considering fees or the amount ultimately received.

**Paper trading:** Recording simulated orders under explicit fill and cost rules without risking money.

**Price impact:** The price movement caused by the size of the trade itself relative to available liquidity.

**Priority fee:** An optional extra Solana fee intended to improve a transaction's scheduling priority during congestion.

**Quote / route:** A route is a proposed sequence of pools for a swap; a quote estimates its output and costs at one moment. It is not a guaranteed fill.

**Round trip:** A modeled or real entry followed by an exit at the same stated position size. Both sides, all costs, route availability, and failures matter.

**Quote-side reserve:** The amount of the quote asset in a curve or pool. It is not the same as TVL, which usually values both sides.

**Reserve coverage:** Quote-side reserve divided by order size, used as a rough depth check. It does not replace a real size-specific quote.

**Sandwich attack:** Transactions placed immediately before and after a victim's trade to profit from the victim's price impact.

**Shadow mode:** The live system records the prediction and hypothetical action before the outcome but sends no trade.

**Shadow prediction:** A model result recorded before its outcome is known so live timing can be evaluated without placing a trade.

**Shadow alert:** A notification about an already-recorded shadow prediction. It can report a probability and evidence boundary, but it does not place or authorize an order.

**Delivery deduplication:** Recording a prediction/channel pair after an alert attempt so a successfully delivered alert is not sent repeatedly.

**Slippage:** The difference between the expected trade price and the executed or realistically simulated price.

**Rug pull:** Informal term for insiders abruptly removing liquidity, selling concentrated holdings, or abusing control so other holders lose value. The app measures observable risk and events rather than declaring intent from one clue.

**Slot:** Solana's ordered unit of leader time in which transactions may be processed. It is more precise for ordering than a coarse wall-clock timestamp.

**Transaction ordering:** The sequence in which transactions and instructions execute. Early position can materially change a launch trade's price and outcome.

## Ownership, coordination, and integrity

**Bot-likeness:** A probabilistic score based on machine-like timing or repetition. It is evidence to inspect, not proof that an account is automated or malicious.

**Cabal:** Informal market language for a coordinated group of traders or promoters. The app reports coordination evidence and benign alternatives, not a guilt label.

**Cohort:** A set selected by a rule fixed before outcomes are known, such as all eligible launches in a contiguous date range. A wallet cohort is a recurring set of wallets observed across launches.

**Common funder:** A wallet or service that supplied funds to multiple wallets. Exchanges, bridges, and popular funding bots make this a noisy link unless supported by more evidence.

**Circular flow / self-funding loop:** Funds or tokens move through several wallets and return to a related origin. It can indicate manufactured activity but also needs service-wallet and routing controls.

**Creator fee extraction:** Fees or other value received by a token creator from venue mechanics, measured separately from the creator's token sales.

**Creator / deployer:** The address that created or initialized a token. It may be a person, bot, launch service, or operational proxy rather than the ultimate owner.

**Early buyer / sniper:** A wallet buying very near launch. “Sniper” usually implies unusually fast positioning, but timing alone does not prove privileged information.

**Effective owners:** The intuitive number of equally sized holders that would create the observed concentration, calculated as `1 / HHI`; higher means more distributed ownership.

**Funder graph:** A network linking wallets through funding transfers, fee payers, token flows, and timing evidence.

**HHI:** Herfindahl-Hirschman Index, the sum of squared ownership shares. Higher HHI means supply is concentrated among fewer holders.

**Owner view versus account view:** Account concentration counts token accounts separately; owner concentration first groups accounts controlled by the same wallet. The owner view is more economically meaningful when ownership can be resolved.

**Recurring early-buyer cohort:** A similar group of wallets repeatedly appearing early across different launches, which is stronger evidence than one shared edge but still needs false-positive controls.

**Same-slot buyers:** Buyers whose transactions land in the same Solana slot. This is an ordering clue, not proof they coordinated.

**Synchronized exits:** Several wallets selling within an unusually tight interval or transaction sequence. This may suggest coordination but can also follow the same public signal.

**Sybil behavior:** One actor using many apparent identities or wallets to look like independent participants.

**Wash trading:** Trades designed mainly to create misleading activity or volume rather than transfer genuine economic risk. Detection is probabilistic because independent traders can sometimes form similar patterns.

## Attention and narrative

**Boost / paid attention:** Purchased platform visibility, advertising, or promotion. It must be separated from organic attention and on-chain demand.

**Callout:** A public token recommendation or mention on a platform. It is user-generated promotion, not verification or due diligence.

**Duplicate-text ratio:** The share of posts whose wording is identical or nearly identical, used as one clue for coordinated promotion.

**Embedding:** A numeric representation of text meaning used to compare or cluster narratives. It does not determine whether a claim is true.

**Entity resolution:** Matching social content to the correct token using the exact mint, official accounts, URLs, and full name. Ticker-only matches are low confidence because tickers are reused.

**Lead-lag:** Whether changes in one series, such as social attention, systematically occur before or after another, such as buys. Sequence alone does not prove causation.

**Mention velocity:** New matching posts per unit of time; acceleration measures whether that rate is increasing or decreasing.

**Narrative:** The story or theme associated with a token, such as an event, character, community joke, or political moment.

**Narrative cluster:** Posts grouped by semantic similarity so the app can distinguish several stories within one token's mention volume.

**Novelty score:** A versioned estimate of how different a narrative is from previously observed text. Novel does not mean truthful, organic, or investable.

**Unique-author ratio:** Distinct authors divided by posts. A low ratio can mean a small group is producing much of the apparent attention.

## Time, fidelity, and missing data

**`available_at`:** The earliest time the research system could legitimately have used an observation after source and processing delay. Models may not use a record when `available_at` is later than their decision cutoff.

**Decision time:** The exact reference time plus cutoff at which the app freezes eligible evidence and hypothetically makes a prediction.

**Event time:** When the underlying event happened according to its source, such as a slot or post timestamp.

**Computed at:** When a particular formula and feature version finished producing a derived value. It must not be confused with when its inputs became available.

**Commitment / finality:** Solana observations progress from processed to confirmed to finalized as the network gains confidence they are canonical. Research should record the level seen at decision time and any later correction.

**Canonical:** The transaction or block history ultimately accepted by the network rather than a discarded fork or unconfirmed observation.

**Observed at / ingested at:** When our collector received the evidence / when it finished storing it. These are different from event time and `available_at`.

**Retrieved at:** When a request fetched or reconstructed a record. It remains separate from the historical event and availability times and must not be used to backdate current data.

**Point-in-time snapshot:** A reconstruction containing only evidence legitimately available by a stated historical cutoff.

**Historical replay:** Recomputing past snapshots and hypothetical decisions under point-in-time rules, while preserving which inputs were exact, reconstructed, proxied, or unavailable.

**Cutoff:** The decision time after launch, such as 30 seconds or 5 minutes, at which features and predictions are frozen.

**Reference clock:** The lifecycle event used as time zero for a cutoff—currently launch or graduation. The same token and cutoff can form different research rows under different clocks.

**Reference availability / canonical state:** Whether the chosen launch or graduation event itself was available by the decision time and supported by canonical on-chain evidence. A feature row cannot become valid before its reference event was knowable.

**Exact fidelity:** Direct authoritative evidence or a value captured by our live collector without substituting another measurement.

**Reconstructed fidelity:** A value deterministically rebuilt from sufficiently complete primary evidence.

**Proxy fidelity:** A useful approximation that is not equivalent to the desired fact, such as inferred bundle clues instead of a known bundle ID.

**Unavailable:** Evidence that cannot be lawfully or technically recovered for the specified time. It remains missing rather than being silently replaced.

**Missingness:** The pattern of absent values. Missing data can itself be informative, so the reason and source coverage must be recorded.

**Point-in-time leak:** Any use of information that existed in history but was not actually available by the simulated decision time.

## Research and evaluation

**Ablation:** Re-running a model after removing one feature or feature family to measure whether it adds genuine out-of-sample value.

**Backtest:** A simulation of a rule or model on historical data. It is credible only when inputs are point-in-time, the denominator is complete, and execution costs are realistic.

**Base rate:** How often an outcome occurs before using any predictive feature. A model must be judged against this starting frequency.

**Brier score:** The average squared error of probability forecasts; lower is better. It evaluates both confidence and correctness, not just ranking.

**Calibration:** Agreement between predicted probabilities and observed frequencies; among cases predicted at 20%, roughly 20% should occur over a large sample.

**Evidence confidence:** A separate assessment of source coverage, fidelity, freshness, and finality. It is not the probability of profit.

**Denominator:** Every item eligible for the study, including failures and tokens never shown on a winner list.

**Drawdown:** The fall from a portfolio or strategy's previous peak to a later trough.

**Embargo:** A time gap placed around train/test boundaries to stop overlapping labels or nearby information from leaking across the split.

**Expected value (EV):** Probability-weighted average gain or loss after all modeled costs. Positive historical EV is an estimate, not a guarantee.

**Executability:** Whether a hypothetical trade can plausibly enter and exit at the stated size, time, route, costs, and failure assumptions.

**Integrity risk:** Evidence of concentration, coordination, manufactured activity, or unsafe control. It is not an accusation or a prediction of price direction.

**Label / outcome:** The precisely versioned future event being predicted, such as graduation or positive executable return over a fixed horizon and size.

**Matured outcome:** A label whose full future horizon has elapsed and whose required observation/exit path is complete. A pending or missing path is not silently converted into a losing outcome.

**Label leakage / look-ahead bias:** Allowing the model to see the outcome or information created after its decision time, making historical performance falsely strong.

**Precision@k:** Among the top `k` ranked alerts, the fraction that achieved the stated outcome. It does not describe opportunities omitted below `k`.

**PR-AUC:** Area under the precision-recall curve, which summarizes ranking quality across thresholds and is useful when successful launches are rare. Higher is better, but it says nothing by itself about execution costs.

**Opportunity:** The estimated probability or ranking of one precisely defined future outcome. It remains separate from integrity risk, executability, and evidence confidence.

**Purging:** Removing training cases whose feature or outcome windows overlap a test period, preventing information from crossing the boundary.

**Insufficient-data gate:** A rule that refuses to train or show a probability until the dataset has enough audited examples, unique tokens, winners, losers, and chronological train/test coverage.

**Model artifact:** The immutable versioned output of training: feature definitions, target, preprocessing, coefficients, calibration, validation policy, metrics, and dataset fingerprint needed to reproduce predictions.

**Candidate model artifact:** A stored trained model awaiting review. Candidate status never makes its probabilities eligible for live serving or alerts.

**Validated model artifact:** A model artifact admitted for serving only after it satisfies the registered sample, chronological walk-forward, and calibration gates. This status means the artifact passed those rules; it does not prove future profitability.

**Alert probability threshold:** The minimum probability a validated shadow prediction must reach before it is eligible for notification. It is a delivery filter, not a buy rule.

**Recall:** Among all cases that achieved the outcome, the fraction the model selected. High precision can coexist with low recall.

**Regime / regime drift:** The broader market environment / a change in that environment that can make relationships learned earlier stop working.

**Selection bias:** A sample differs systematically from the population because of how it was selected, such as querying social data only for already-successful tokens.

**Tail loss:** A rare but unusually large loss in the worst part of the return distribution.

**Survivorship bias:** Studying only assets that survived long enough to be visible and excluding rapid failures.

**Walk-forward validation:** Train on earlier time periods and evaluate on the next unseen period, repeating forward through time without random future-to-past mixing.

**Token-grouped split:** A validation rule that keeps every row for one token on only one side of a train/test boundary, preventing the same coin's other cutoffs from leaking into evaluation.

## Platforms and services

**Cloudflare D1:** The app's SQL database for normalized, queryable research records and indices. It is storage, not an external market-data source.

**Cloudflare R2:** Object storage for immutable raw responses and larger evidence files referenced by D1.

**DEX Screener:** A multi-chain DEX indexer and screener used here only as secondary pool, market, profile, boost, and paid-order enrichment under its API terms.

**Fomo.family:** A social trading and execution product used as a manual UX reference. It is not an approved automated data source without a supported API and written permission.

**Helius:** A Solana infrastructure provider offering RPC, archive, streaming, and webhook services.

**LaserStream:** Helius's low-latency Solana data-streaming product. It is a prospective event feed, not the same interface as a one-time DAS asset lookup.

**IPFS / Arweave:** Distributed content systems often used to host token metadata. Availability and immutability differ, so the app stores the exact URI, retrieved bytes, hash, and time.

**Jito:** Solana infrastructure for transaction delivery, ordering, bundles, and tips through its Block Engine.

**Jupiter:** A Solana liquidity aggregator that can propose swap routes and provide contemporaneous execution quotes.

**Jupiter Price v3 / Swap V2:** Price v3 provides current reference prices; Swap V2 builds or executes current routes. A price response is not a size-specific executable quote.

**memescope.net:** An editorial/consumer website with meme-coin content; it is not treated as a primary research feed.

**MemeScope:** An overloaded product name used by more than one service. The app names the provider explicitly, such as Solana Tracker MemeScope or Photon MemeScope.

**Photon MemeScope:** A fast launch-scanner and trading interface used as a product benchmark, not a presumed licensed feed.

**Pump.fun:** A Solana token-launch and trading venue whose on-chain programs define the initial research cohort.

**PumpSwap:** Pump.fun's post-curve AMM program used for pool creation and trading after applicable migrations.

**Raydium:** A Solana DEX used in older Pump.fun migration flows and other post-launch liquidity.

**Solana:** The blockchain used for the first controlled research cohort.

**Solana Tracker:** A commercial indexed Solana data provider. Its normalized fields can accelerate research, but critical events and proprietary risk labels require chain validation and attribution.

**X API:** X's official developer interface for post counts, search, and streams, subject to credentials, product access, cost, and content-use terms.
