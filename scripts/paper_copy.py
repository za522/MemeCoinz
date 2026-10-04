"""Collect historical trader evidence and run explicitly conditional paper-copy scenarios.

Examples:
 python3 scripts/paper_copy.py collect --roster /path/to/fomopulse/config/wallets.json
 python3 scripts/paper_copy.py backtest
 python3 scripts/paper_copy.py collect --start 2026-09-06T00:00:00Z --end 2026-09-07T00:00:00Z --output .research/day2
"""
from __future__ import annotations

import argparse
import bisect
import csv
import heapq
import json
import math
import statistics
from collections import Counter,defaultdict
from pathlib import Path

from paper_copy_data import EventHistory, ZERO, collect, connect, iso

VERSION = "paper-copy-v1"
STRATEGIES = ("copy_all","unusually_large","multiple_wallets")
SCENARIOS = {
    "low_cost": {"platform_fee_each_side":0.0,"extra_friction_each_side":0.0,"network_usd_each_side":0.01},
    "middle_cost": {"platform_fee_each_side":0.01,"extra_friction_each_side":0.01,"network_usd_each_side":0.05},
    "high_cost": {"platform_fee_each_side":0.02,"extra_friction_each_side":0.02,"network_usd_each_side":0.25},
}


def safe_csv_row(row):
    return {k:("'"+v if isinstance(v,str) and v.lstrip().startswith(("=","+","-","@")) else v)
            for k,v in row.items()}


def export_csv(path,rows):
    rows = list(rows)
    if not rows:
        path.write_text("")
        return
    with path.open("w",newline="") as f:
        writer = csv.DictWriter(f,fieldnames=list(rows[0]),extrasaction="raise",lineterminator="\n")
        writer.writeheader()
        # Token names/handles are untrusted. Keep exact text in SQLite; prevent
        # spreadsheet software from executing a supplied CSV formula.
        writer.writerows(safe_csv_row(row) for row in rows)


def features(fills,start,end,split,max_horizon):
    sizes = defaultdict(list)
    recent = defaultdict(list)
    buys = defaultdict(int)
    signals = []
    for f in fills:
        if f["classification"] != "candidate_swap" or f["cash_usdg"] is None:
            continue
        if f["side"] != "buy":
            continue
        wallet,token,ts = f["wallet"],f["token"],f["ts"]
        prior = sizes[wallet]
        median = statistics.median(prior) if len(prior) >= 5 else None
        ratio = f["cash_usdg"]/median if median and median > 0 else None
        # Every feature is calculated before this purchase is added to the history.
        other = {w for t,w in recent[token] if ts-300 <= t <= ts and w != wallet}
        signal = dict(f)
        signal.update({"prior_buys_observed":len(prior),"prior_median_cash_usdg":median,
                       "size_vs_prior_median":ratio,"other_buying_wallets_5m":len(other),
                       "first_observed_token_buy":buys[(wallet,token)] == 0,
                       "unusually_large":ratio is not None and ratio >= 3,
                       "multiple_wallets":len(other) >= 2,
                       "partition":"train" if ts+max_horizon < split else
                           "test" if ts >= split else "embargo"})
        if start <= ts < end:
            signals.append(signal)
        sizes[wallet].append(f["cash_usdg"])
        recent[token] = [(t,w) for t,w in recent[token] if t >= ts-300]+[(ts,wallet)]
        buys[(wallet,token)] += 1
    return signals


def reverse_route(route):
    return [(target,source,pool) for source,target,pool in reversed(route)]


def eligible(signal,strategy):
    return strategy == "copy_all" or bool(signal[strategy])


def receipt_cost(receipt,transaction=None):
    gas = int(receipt["gasUsed"],16) if receipt.get("gasUsed") else None
    price = int(receipt["effectiveGasPrice"],16) if receipt.get("effectiveGasPrice") else None
    return {"tx":receipt["transactionHash"],"transaction_sender":(transaction or {}).get("from"),
            "gas_used":gas,"effective_gas_price_wei":price,
            "gas_fee_product_wei":str(gas*price) if gas is not None and price is not None else None,
            "gas_fee_product_eth":gas*price/1e18 if gas is not None and price is not None else None,
            "warning":"Observed transaction gas product, not a verified charge to the named trader; not a future copy fee."}


def price_response(history,signal,delay,horizon,max_age):
    entry,exit_time = signal["ts"]+delay,signal["ts"]+delay+horizon
    route = history.route(signal["token"],entry,max_age)
    before = history.price(route,entry,max_age) if route else None
    after = history.price(route,exit_time,max_age) if route else None
    return {"signal_id":signal["id"],"handle":signal["handle"],"token":signal["token"],
        "partition":signal["partition"],"entry_ts":entry,"exit_ts":exit_time,
        "delay_seconds":delay,"horizon_seconds":horizon,
        "status":"observed_price_path" if before and after else "missing_price_path",
        "spot_price_change":after/before-1 if before and after else None,
        "is_trade_profit":False}


def make_trade(history,signal,delay,size,horizon,costs,max_age,exit_rule="fixed_time"):
    entry = signal["ts"]+delay
    exit_time = entry+horizon
    base = {"signal_id":signal["id"],"handle":signal["handle"],"wallet":signal["wallet"],
        "token":signal["token"],"source_tx":signal["tx"],"partition":signal["partition"],
        "signal_ts":signal["ts"],"entry_ts":entry,"exit_ts":exit_time,"delay_seconds":delay,
        "size_usdg":size,"horizon_seconds":horizon,"exit_rule":exit_rule,
        "network_cost_each_side_usdg":costs["network_usd_each_side"],
        "status":"rejected","reason":"","gross_spot_return":None,"quantity":None,
        "exit_usdg":None,"net_pnl_usdg":None,"net_return":None,"strict_quote_status":"",
        "route_pools":"","pool_hooks":False,"evidence_fidelity":"conditional_pool_model",
        "outcome_profit_label_valid":False}
    route = history.route(signal["token"],entry,max_age)
    if route is None:
        base["reason"] = "no_historical_route_at_entry"
        return base
    base["route_pools"] = ";".join(edge[2] for edge in route)
    base["pool_hooks"] = any(history.pools[e[2]]["hook"] != ZERO for e in route)
    price = history.price(route,entry,max_age)
    if price is None or price <= 0:
        base["reason"] = "missing_entry_price"
        return base
    cash_to_pool = size*(1-costs["platform_fee_each_side"])*(1-costs["extra_friction_each_side"])
    qty,error = history.quote(reverse_route(route),entry,cash_to_pool,max_age,allow_hooks=True)
    _,strict = history.quote(reverse_route(route),entry,cash_to_pool,max_age,allow_hooks=False)
    base["strict_quote_status"] = strict or "standard_pool_entry_quoted_costs_still_assumed"
    if qty is None:
        base["reason"] = error
        return base
    base["quantity"] = qty
    base["status"] = "entered"
    # TP/SL is evaluated on a sell quote after a +2 second reaction delay, not a chart threshold fill.
    if exit_rule == "tp30_sl15":
        event_times = sorted({s["order"][0] for _,_,p in route for s in history.rows.get(p,[])
                              if entry < s["order"][0] <= exit_time})
        for t in event_times:
            quote,_ = history.quote(route,t,qty,max_age,allow_hooks=True)
            if quote is None:
                continue
            after_cost = quote*(1-costs["platform_fee_each_side"])*(1-costs["extra_friction_each_side"])
            ret = (after_cost-size-2*costs["network_usd_each_side"])/size
            if ret >= 0.30 or ret <= -0.15:
                exit_time = t+2
                base["exit_ts"] = exit_time
                break
    proceeds,error = history.quote(route,exit_time,qty,max_age,allow_hooks=True)
    end_price = history.price(route,exit_time,max_age)
    base["gross_spot_return"] = end_price/price-1 if end_price else None
    if proceeds is None:
        base.update({"status":"unresolved_exit","reason":error})
        return base
    proceeds *= (1-costs["platform_fee_each_side"])*(1-costs["extra_friction_each_side"])
    pnl = proceeds-size-2*costs["network_usd_each_side"]
    base.update({"status":"closed_modelled","exit_usdg":proceeds,
                 "net_pnl_usdg":pnl,"net_return":pnl/size})
    return base


def metrics(rows):
    closed = [r for r in rows if r["status"] == "closed_modelled"]
    entered = [r for r in rows if r["quantity"] is not None]
    missing_exit = [r for r in rows if r["status"] == "unresolved_exit"]
    pnl = [r["net_pnl_usdg"] for r in closed]
    wins = [v for v in pnl if v > 0]
    losses = [v for v in pnl if v < 0]
    return {"signals":len(rows),"entries_modelled":len(entered),"closed_modelled":len(closed),
        "rejected_entries":len(rows)-len(entered),"unresolved_exits":len(missing_exit),
        "quote_coverage":len(closed)/len(rows) if rows else None,
        "wins":len(wins),"win_rate_closed_only":len(wins)/len(closed) if closed else None,
        "net_pnl_closed_only_usdg":sum(pnl) if closed else None,
        "mean_net_return_closed_only":statistics.mean(r["net_return"] for r in closed) if closed else None,
        "median_net_return_closed_only":statistics.median(r["net_return"] for r in closed) if closed else None,
        "worst_trade_net_return":min((r["net_return"] for r in closed),default=None),
        "profit_factor_closed_only":sum(wins)/abs(sum(losses)) if losses else None,
        "unresolved_exit_total_loss_stress_usdg":sum(pnl)-sum(
            r["size_usdg"]+r.get("network_cost_each_side_usdg",0) for r in missing_exit),
        "unique_tokens_closed":len({r["token"] for r in closed}),
        "unique_wallets_closed":len({r["wallet"] for r in closed}),
        "hook_routes_closed":sum(bool(r["pool_hooks"]) for r in closed),
        "reasons":dict(Counter(r["reason"] for r in rows if r["reason"]))}


def portfolio(rows,capital=300.0,network_cost=0.05):
    """One position per token, chronological fills, finite cash, unresolved capital stays tied up."""
    cash = capital
    active,heap,open_costs = {},[],{}
    accepted = []
    skips = Counter()
    peak,drawdown = capital,0.0
    def settle(now):
        nonlocal cash,peak,drawdown
        while heap and heap[0][0] <= now:
            _,identifier,row = heapq.heappop(heap)
            if active.get(row["token"]) != identifier:
                continue
            del active[row["token"]]
            open_costs.pop(row["token"],None)
            cash += row["exit_usdg"]-network_cost
            equity = cash+sum(open_costs.values())
            peak = max(peak,equity)
            drawdown = max(drawdown,(peak-equity)/peak if peak else 0)
    for i,row in enumerate(sorted(rows,key=lambda r:(r["entry_ts"],r["signal_id"]))):
        settle(row["entry_ts"])
        if row["quantity"] is None:
            skips["no_entry_quote"] += 1
            continue
        if row["token"] in active:
            skips["token_position_already_open"] += 1
            continue
        if cash < row["size_usdg"]+network_cost:
            skips["insufficient_cash"] += 1
            continue
        cash -= row["size_usdg"]+network_cost
        active[row["token"]] = i
        open_costs[row["token"]] = row["size_usdg"]
        accepted.append(row)
        equity = cash+sum(open_costs.values())
        peak = max(peak,equity)
        drawdown = max(drawdown,(peak-equity)/peak if peak else 0)
        if row["status"] == "closed_modelled":
            heapq.heappush(heap,(row["exit_ts"],i,row))
    settle(1<<63)
    unresolved = [r for r in accepted if r["status"] != "closed_modelled"]
    return {"starting_capital_usdg":capital,"accepted_entries":len(accepted),"skips":dict(skips),
        "final_cash_usdg":cash,"unresolved_positions":len(unresolved),
        "unresolved_cost_usdg":sum(r["size_usdg"] for r in unresolved),
        "final_equity_if_unresolved_zero_usdg":cash,
        "realized_drawdown_cost_marked_open_positions":drawdown,
        "warning":"Drawdown marks open positions at cost; it is not a full mark-to-market drawdown."}


def backtest(args):
    out = Path(args.output)
    db = connect(out/"history.sqlite")
    saved = db.execute("SELECT value FROM settings WHERE key='manifest'").fetchone()
    if not saved:
        raise ValueError("No collected history: run collect first")
    manifest = json.loads(saved[0])
    if manifest["status"] != "complete":
        raise ValueError("Incomplete collection; finish/resume collection before backtesting")
    start,end = manifest["cohort_start"],manifest["cohort_end"]
    split = start+int((end-start)*0.6)
    horizons = [int(v) for v in args.horizons.split(",")]
    delays = [int(v) for v in args.delays.split(",")]
    sizes = [float(v) for v in args.sizes.split(",")]
    if min(horizons+delays) < 1 or min(sizes) <= 0:
        raise ValueError("Horizons, delays and sizes must be positive")
    if max(horizons)+max(delays)+2 > manifest["horizon_seconds"]:
        raise ValueError("Collected lookahead must include exit horizon, detection and reaction delays")
    fills = [dict(r) for r in db.execute("SELECT * FROM fills ORDER BY ts,block,idx,id")]
    signals = features(fills,start,end,split,max(horizons)+max(delays)+2)
    history = EventHistory(db)
    export_csv(out/"fills.csv",fills)
    export_csv(out/"signals.csv",signals)
    export_csv(out/"pools.csv",[dict(r) for r in db.execute("SELECT * FROM pools ORDER BY id")])
    export_csv(out/"tokens.csv",[dict(r) for r in db.execute("SELECT * FROM tokens ORDER BY address")])
    export_csv(out/"transaction_costs.csv",[
        receipt_cost(json.loads(r["data"]),json.loads(r["calldata"]) if r["calldata"] else None)
        for r in db.execute("SELECT r.data,t.data AS calldata FROM receipts r LEFT JOIN transactions t ON r.tx=t.tx")])
    wallet_rows = []
    for w in json.loads((out/"roster.json").read_text()):
        wallet = w["address"].lower()
        movements = [f for f in fills if f["wallet"] == wallet]
        cohort_signals = [s for s in signals if s["wallet"] == wallet]
        wallet_rows.append({"handle":w["handle"],"wallet":wallet,"classified_movements":len(movements),
            "candidate_swap_legs":sum(f["classification"] == "candidate_swap" for f in movements),
            "cohort_buy_signals":len(cohort_signals),"unusually_large_signals":sum(s["unusually_large"] for s in cohort_signals),
            "multiple_wallet_signals":sum(s["multiple_wallets"] for s in cohort_signals),
            "identity_verified":False})
    export_csv(out/"wallet_activity.csv",wallet_rows)
    response_rows = [price_response(history,s,2,900,args.max_age) for s in signals]
    export_csv(out/"price_response.csv",response_rows)
    price_summaries = []
    for strategy in STRATEGIES:
        for part in ("train","test"):
            selected = [r for r,s in zip(response_rows,signals) if eligible(s,strategy) and r["partition"] == part]
            observed = [r["spot_price_change"] for r in selected if r["spot_price_change"] is not None]
            price_summaries.append({"strategy":strategy,"partition":part,"signals":len(selected),
                "observed_price_paths":len(observed),"missing_paths":len(selected)-len(observed),
                "positive_price_response_rate":sum(v > 0 for v in observed)/len(observed) if observed else None,
                "median_spot_price_change":statistics.median(observed) if observed else None,
                "rate_above_30_percent":sum(v >= 0.30 for v in observed)/len(observed) if observed else None,
                "is_trade_profit":False})
    export_csv(out/"price_response_results.csv",price_summaries)
    trade_path = out/"paper_trades.csv"
    summaries,portfolios = [],[]
    trader_rows = []
    with trade_path.open("w",newline="") as f:
        writer = None
        for scenario,costs in SCENARIOS.items():
            for delay in delays:
                for size in sizes:
                    for horizon in horizons:
                        rows = [make_trade(history,s,delay,size,horizon,costs,args.max_age) for s in signals]
                        for r in rows:
                            r["scenario"] = scenario
                        if rows and writer is None:
                            writer = csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator="\n")
                            writer.writeheader()
                        if writer:
                            writer.writerows(safe_csv_row(row) for row in rows)
                        for strategy in STRATEGIES:
                            selected = [r for r,s in zip(rows,signals) if eligible(s,strategy)]
                            for part in ("train","test","embargo"):
                                subset = [r for r in selected if r["partition"] == part]
                                common = {"scenario":scenario,"delay_seconds":delay,"size_usdg":size,
                                          "horizon_seconds":horizon,"strategy":strategy,"partition":part}
                                summaries.append({**common,**metrics(subset)})
                                portfolios.append({**common,**portfolio(subset,args.capital,costs["network_usd_each_side"])})
                        if scenario == "middle_cost" and delay == 2 and size == 25 and horizon == 900:
                            for handle in sorted({s["handle"] for s in signals}):
                                for part in ("train","test"):
                                    subset = [r for r in rows if r["handle"] == handle and r["partition"] == part]
                                    trader_rows.append({"handle":handle,"partition":part,**metrics(subset)})
                        print(f"Backtest: {scenario}, delay {delay}s, ${size:g}, {horizon}s: "
                              f"{sum(r['status']=='closed_modelled' for r in rows)}/{len(rows)} modelled closes",flush=True)
    # Prespecified TP/SL stress run uses actual reaction timing and the same entry model.
    exit_rows = [make_trade(history,s,2,25,900,SCENARIOS["middle_cost"],args.max_age,"tp30_sl15") for s in signals]
    export_csv(out/"tp_sl_trades.csv",exit_rows)
    for s in summaries:
        s["reasons"] = json.dumps(s["reasons"],sort_keys=True)
    export_csv(out/"strategy_results.csv",summaries)
    export_csv(out/"portfolio_results.csv",[{**p,"skips":json.dumps(p["skips"],sort_keys=True)} for p in portfolios])
    export_csv(out/"trader_results.csv",[{**r,"reasons":json.dumps(r["reasons"])} for r in trader_rows])
    report = {"version":VERSION,"manifest":manifest,"status":"conditional_backtest_completed",
        "prediction_or_validated_profit_model":False,"certified_executable_profit_labels":0,
        "signal_count":len(signals),"candidate_fills_total":sum(f["classification"] == "candidate_swap" for f in fills),
        "signals_by_partition":dict(Counter(s["partition"] for s in signals)),
        "split_utc":iso(split),"sizes":sizes,"delays_seconds":delays,"horizons_seconds":horizons,
        "cost_scenarios":SCENARIOS,"max_pool_price_age_seconds":args.max_age,"capital_usdg":args.capital,
        "principal_results":[s for s in summaries if s["scenario"] == "middle_cost" and s["delay_seconds"] == 2
            and s["size_usdg"] == 25 and s["horizon_seconds"] == 900 and s["partition"] != "embargo"],
        "principal_portfolios":[p for p in portfolios if p["scenario"] == "middle_cost" and p["delay_seconds"] == 2
            and p["size_usdg"] == 25 and p["horizon_seconds"] == 900 and p["partition"] != "embargo"],
        "tp_sl_results":{part:metrics([r for r in exit_rows if r["partition"] == part]) for part in ("train","test")},
        "price_response_only_results":price_summaries,
        "limitations":[
            "Historical roster was selected after the cohort; survival/selection bias remains.",
            "Wallet handles are public associations, not verified identity or independence.",
            "USDG is the numeraire; dollar peg and redemption are assumed.",
            "Latest decimals/symbols are tagged current; immutable decimals are assumed for modelling.",
            "Signal features use only earlier fills; all-wallet swaps do not establish independent convergence.",
            "Detection delays are assumed, not measured historical Fomopulse alert times.",
            "Historical block timestamps have one-second precision; entry uses end-of-second pool state.",
            "Pool quotes are finite-size within one tick-spacing cell. Tick crossings are rejected.",
            "Pool hooks/dynamic fee changes are not replayed; nonzero-hook results are conditional scenarios.",
            "Observed LP fees are used; platform fees, extra friction and network costs are assumptions.",
            "Incomplete/stale paths and missing exits are retained. Closed-only win rates are coverage-selected.",
            "Each simulated trade uses the actual historical market path; large joint copy impact is not simulated.",
            "No statistical independence, confidence interval or validated profitable edge is claimed."]}
    (out/"backtest.json").write_text(json.dumps(report,indent=2)+"\n")
    lines = ["# Historical paper-copy results", "", f"Run version: `{VERSION}`.","",
        f"Period studied: {iso(start)} to {iso(end)}. Checked all {manifest['wallets']} public-roster wallets.",
        f"Saved {manifest['receipts']} transaction receipts, {manifest['raw_logs']} blockchain logs and {len(signals)} buy signals.",
        f"Early/later comparison starts at {iso(split)}. Early trades whose holding time overlaps that split are excluded from the comparison.","",
        "## What the numbers mean", "", "These are conditional execution scenarios, not verified trading profits.",
        "The wallet trades and pool activity are real. Our copied trade is simulated; "
        "its fees, notification delay and extra contract rules are not verified.",
        "USDG is treated as worth $1. Missing buys/sells are kept visible, not turned into fake results.","",
        "## Prespecified $25 / 2-second delay / 15-minute exit / middle-cost scenario", "",
        "Assumed costs: 1% platform fee + 1% extra execution friction + $0.05 network cost on each side. Pool fees and trade-size impact are also modelled.", "",
        "| Period | Strategy | Signals | Modelled closes | Unresolved exits | Win rate of closes | Mean return of closes |",
        "|---|---|---:|---:|---:|---:|---:|"]
    def pct(value):
        return f"{value*100:.2f}%" if value is not None else "unavailable"
    for r in report["principal_results"]:
        period = {"train":"early","test":"later"}[r["partition"]]
        label = {"copy_all":"Copy every buy","unusually_large":"Unusually large buys","multiple_wallets":"Several wallets buying"}[r["strategy"]]
        lines.append(f"| {period} | {label} | {r['signals']} | {r['closed_modelled']} | "
            f"{r['unresolved_exits']} | {pct(r['win_rate_closed_only'])} | {pct(r['mean_net_return_closed_only'])} |")
    lines += ["", "## Did prices rise after the buys?", "",
        "This separate association test uses the 2-second-delay / 15-minute price path.",
        "It ignores trade size and costs and is NOT a paper-trading profit or proof the wallet caused the move.", "",
        "| Period | Strategy | Signals | Observed price paths | Prices rose | Median price change |",
        "|---|---|---:|---:|---:|---:|"]
    for r in price_summaries:
        period = {"train":"early","test":"later"}[r["partition"]]
        label = {"copy_all":"Copy every buy","unusually_large":"Unusually large buys","multiple_wallets":"Several wallets buying"}[r["strategy"]]
        lines.append(f"| {period} | {label} | {r['signals']} | {r['observed_price_paths']} | "
            f"{pct(r['positive_price_response_rate'])} | {pct(r['median_spot_price_change'])} |")
    lines += ["", "## Could a $300 account take those trades?", "",
        "Each period starts with a fresh $300. Only one position per coin is allowed, and tied-up money cannot be spent again.",
        "Cash left is NOT total profit/loss: unresolved positions have no modelled exit value.", "",
        "| Period | Strategy | Accepted buys | Cash left | Unresolved positions | Their original cost |",
        "|---|---|---:|---:|---:|---:|"]
    for r in report["principal_portfolios"]:
        period = {"train":"early","test":"later"}[r["partition"]]
        label = {"copy_all":"Copy every buy","unusually_large":"Unusually large buys","multiple_wallets":"Several wallets buying"}[r["strategy"]]
        lines.append(f"| {period} | {label} | {r['accepted_entries']} | ${r['final_cash_usdg']:.2f} | "
            f"{r['unresolved_positions']} | ${r['unresolved_cost_usdg']:.2f} |")
    lines += ["", "## Files", "", "- `history.sqlite`: saved RPC evidence, receipts, pool events, timestamps and classifications.",
        "- `fills.csv` and `signals.csv`: trade/transfer denominator and past-only features.",
        "- `paper_trades.csv`: every delay/size/horizon/cost combination, including rejections and missing exits.",
        "- `strategy_results.csv`, `trader_results.csv`, `portfolio_results.csv`, `backtest.json`: aggregate results and cash-constrained portfolios.",
        "- `wallet_activity.csv`, `transaction_costs.csv`, `tokens.csv`, `pools.csv`: wallet activity and source details.",
        "- `price_response.csv`, `price_response_results.csv`: separate price-only association test, not trading profits.",
        "- `tp_sl_trades.csv`: +30% / -15% exit rule with two-second exit reaction delay.","",
        "## Limitations", ""]+[f"- {s}" for s in report["limitations"]]
    (out/"REPORT.md").write_text("\n".join(lines)+"\n")
    print(json.dumps({"signal_count":len(signals),"principal_results":report["principal_results"]},indent=2))
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command",required=True)
    c = sub.add_parser("collect")
    c.add_argument("--roster",required=True)
    c.add_argument("--output",default=".research/paper-copy-2026-09-05")
    c.add_argument("--start",default="2026-09-05T00:00:00Z")
    c.add_argument("--end",default="2026-09-05T02:00:00Z")
    c.add_argument("--warmup",type=int,default=3600)
    c.add_argument("--horizon",type=int,default=960)
    c.add_argument("--chunk",type=int,default=1000)
    c.add_argument("--pace",type=float,default=0.15)
    b = sub.add_parser("backtest")
    b.add_argument("--output",default=".research/paper-copy-2026-09-05")
    b.add_argument("--delays",default="2,5,15")
    b.add_argument("--sizes",default="10,25,50,100")
    b.add_argument("--horizons",default="60,300,900")
    b.add_argument("--max-age",type=int,default=120)
    b.add_argument("--capital",type=float,default=300)
    args = p.parse_args()
    if args.command == "collect":
        if args.warmup < 0 or args.horizon < 1 or not 125 <= args.chunk <= 2000 or args.pace < 0.05:
            p.error("Require warmup >=0, horizon >0, chunk 125–2000, pace >=0.05")
        collect(args)
    else:
        backtest(args)


if __name__ == "__main__":
    main()
