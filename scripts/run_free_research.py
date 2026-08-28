#!/usr/bin/env python3
"""Run MemeTrace's zero-paid-data collection loops with durable checkpoints.

This client calls only the app's protected bounded routes. It never enables
metered providers, Telegram delivery, model promotion, transaction building,
or trading. Live runs capture new candidates and point-in-time observations;
archive runs walk backward through supported Solana history and persist the
next cursor so interruption is safe.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--mode", choices=("live", "archive", "both"), default="both")
    parser.add_argument("--interval-seconds", type=int, default=60)
    parser.add_argument("--state-file", type=Path, default=Path(".research/free-collector-state.json"))
    parser.add_argument("--log-file", type=Path, default=Path(".research/free-collector-runs.jsonl"))
    parser.add_argument("--once", action="store_true")
    return parser.parse_args()


def post(base_url: str, token: str, path: str, body: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(body, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/")),
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(data)),
            "x-backfill-token": token,
        },
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def load_state(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"schemaVersion": 1, "archiveBefore": None, "runs": 0}
    value = json.loads(path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else {"schemaVersion": 1, "archiveBefore": None, "runs": 0}


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def append_log(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, separators=(",", ":")) + "\n")


def run_once(args: argparse.Namespace, token: str, state: dict[str, Any]) -> dict[str, Any]:
    run: dict[str, Any] = {
        "startedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "mode": args.mode,
    }
    if args.mode in ("live", "both"):
        run["live"] = post(args.base_url, token, "/api/pipeline/run", {
            "maxCoins": 10,
            "maxDiscoveryPages": 3,
            "discoverySource": "auto",
            "historyLimit": 200,
            "collectAdvanced": True,
            "allowMetered": False,
            "collectionMaxPages": 1,
            "collectionWindowHours": 24,
            "orderSizesUsd": [25, 100, 500],
            "slippageBps": 100,
            "horizonSeconds": 86400,
            "orderSizeUsd": 100,
            "maxOutcomeSnapshots": 100,
            "runTelegramAlerts": False,
        })
    if args.mode in ("archive", "both"):
        archive_body: dict[str, Any] = {
            "maxPages": 3,
            "signaturesPerPage": 150,
            "maxAssets": 100,
            "historyPerAsset": 100,
            "maxHistoryAssets": 10,
            "dryRun": False,
        }
        if state.get("archiveBefore"):
            archive_body["before"] = state["archiveBefore"]
        archive = post(args.base_url, token, "/api/coins/backfill", archive_body)
        run["archive"] = archive
        if archive.get("nextBefore"):
            state["archiveBefore"] = archive["nextBefore"]
    state["runs"] = int(state.get("runs", 0)) + 1
    state["lastCompletedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    run["completedAt"] = state["lastCompletedAt"]
    return run


def main() -> None:
    args = parse_args()
    if args.interval_seconds < 15:
        raise SystemExit("--interval-seconds must be at least 15")
    token = os.environ.get("BACKFILL_ADMIN_TOKEN", "").strip()
    if not token:
        raise SystemExit("BACKFILL_ADMIN_TOKEN is required and is never written to state/log files")
    state = load_state(args.state_file)
    while True:
        try:
            result = run_once(args, token, state)
            atomic_write(args.state_file, state)
            append_log(args.log_file, result)
            live = result.get("live", {})
            archive = result.get("archive", {})
            print(json.dumps({
                "completedAt": result["completedAt"],
                "liveStatus": live.get("status"),
                "liveCoins": live.get("coins", {}).get("detailLoaded"),
                "archiveAssets": archive.get("assetsDiscovered"),
                "archiveNextBefore": state.get("archiveBefore"),
            }), flush=True)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            failure = {
                "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "mode": args.mode,
                "error": str(error),
            }
            append_log(args.log_file, failure)
            print(json.dumps(failure), flush=True)
            if args.once:
                raise SystemExit(1) from error
        if args.once:
            return
        time.sleep(args.interval_seconds)


if __name__ == "__main__":
    main()
