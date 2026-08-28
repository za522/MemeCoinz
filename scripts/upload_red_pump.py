#!/usr/bin/env python3
"""Upload the verified RED-PUMP cohort to MemeTrace's protected D1/R2 routes.

The script is idempotent: cohort rows upsert by mint and raw R2 objects use
fixed keys. BACKFILL_ADMIN_TOKEN is read from the environment and never logged.
"""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


DATASET_ID = "red-pump-2026-v1"
FILES = {
    "red_pump_2026_v1_launches.jsonl.gz": {
        "bytes": 47_910_391,
        "sha256": "042940379e8c897ac97403e6b25a5b302fb32b6902a8fc0cef4ab70ac11e8f84",
    },
    "red_pump_2026_v1_outcomes.csv.gz": {
        "bytes": 43_624_372,
        "sha256": "c0a327ea442d91c6f970b2bad9a2a9b778e163d8c3eb38f71eccd3e92209a974",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload the RED-PUMP cohort.")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=1_000)
    parser.add_argument("--skip-raw", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def iso_to_ms(value: str | None) -> int | None:
    if not value:
        return None
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)


def request_json(
    base_url: str,
    token: str,
    path: str,
    body: dict[str, Any],
    attempts: int = 6,
) -> dict[str, Any]:
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
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            if error.code < 500 or attempt == attempts - 1:
                raise RuntimeError(f"POST {path} failed ({error.code}): {detail}") from error
        except (OSError, TimeoutError) as error:
            if attempt == attempts - 1:
                raise RuntimeError(f"POST {path} failed: {error}") from error
        time.sleep(min(30, 2 ** attempt))
    raise AssertionError("unreachable")


def upload_file(base_url: str, token: str, path: Path) -> dict[str, Any]:
    expected = FILES[path.name]
    parsed = urllib.parse.urlparse(base_url)
    connection_class = (
        http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    )
    connection = connection_class(parsed.netloc, timeout=180)
    query = urllib.parse.urlencode({"filename": path.name})
    route = f"{parsed.path.rstrip('/')}/api/cohort/raw?{query}"
    connection.putrequest("PUT", route)
    connection.putheader("Content-Type", "application/gzip")
    connection.putheader("Content-Length", str(expected["bytes"]))
    connection.putheader("x-content-sha256", str(expected["sha256"]))
    connection.putheader("x-backfill-token", token)
    connection.endheaders()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            connection.send(block)
    response = connection.getresponse()
    raw = response.read().decode("utf-8", errors="replace")
    connection.close()
    if response.status >= 400:
        raise RuntimeError(f"PUT {path.name} failed ({response.status}): {raw}")
    return json.loads(raw)


def iter_rows(connection: sqlite3.Connection, batch_size: int) -> Iterable[list[dict[str, Any]]]:
    last_mint = ""
    while True:
        rows = connection.execute(
            """
            SELECT l.mint, l.created_at, l.seen_at, l.name, l.symbol,
                   l.initial_market_cap_sol, l.has_x, l.has_website,
                   l.has_telegram, l.description_length,
                   CASE
                     WHEN o.mint IS NULL THEN -1
                     WHEN o.observed_graduated = 1 THEN 1
                     ELSE 0
                   END,
                   CASE WHEN o.observed_graduated = 1 THEN o.observed_at ELSE NULL END,
                   CASE WHEN o.observed_graduated = 1
                        THEN o.minutes_to_observed_graduation ELSE NULL END
            FROM launches l
            LEFT JOIN observed_outcomes o ON o.mint = l.mint
            WHERE l.mint > ?
            ORDER BY l.mint
            LIMIT ?
            """,
            (last_mint, batch_size),
        ).fetchall()
        if not rows:
            return
        batch = []
        for row in rows:
            created_at_ms = iso_to_ms(row[1])
            raw_seen_at_ms = iso_to_ms(row[2])
            if created_at_ms is None or raw_seen_at_ms is None:
                raise ValueError(f"Missing launch timestamp for {row[0]}")
            batch.append(
                {
                    "mint": row[0],
                    "createdAtMs": created_at_ms,
                    # Two source rows precede their second-precision chain
                    # timestamp by <1s. Preserve the raw time in the normalized
                    # DB, but never claim the launch was available pre-creation.
                    "seenAtMs": max(raw_seen_at_ms, created_at_ms),
                    "name": row[3],
                    "symbol": row[4],
                    "initialMarketCapSol": row[5],
                    "hasX": bool(row[6]),
                    "hasWebsite": bool(row[7]),
                    "hasTelegram": bool(row[8]),
                    "descriptionLength": row[9],
                    "observedStatus": row[10],
                    "observedGraduationAtMs": iso_to_ms(row[11]),
                    "observedGraduationMinutes": row[12],
                }
            )
        yield batch
        last_mint = rows[-1][0]


def main() -> None:
    args = parse_args()
    if not 1 <= args.batch_size <= 1_000:
        raise SystemExit("--batch-size must be from 1 to 1000")
    token = os.environ.get("BACKFILL_ADMIN_TOKEN", "").strip()
    if not token and not args.dry_run:
        raise SystemExit("BACKFILL_ADMIN_TOKEN is required")
    database = args.database.resolve()
    source_dir = args.source_dir.resolve()
    if not database.is_file():
        raise SystemExit(f"Database not found: {database}")
    for filename, expected in FILES.items():
        path = source_dir / filename
        if not path.is_file():
            raise SystemExit(f"Source file not found: {path}")
        if path.stat().st_size != expected["bytes"] or sha256(path) != expected["sha256"]:
            raise SystemExit(f"Frozen manifest mismatch: {path}")

    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    try:
        total = int(connection.execute("SELECT COUNT(*) FROM launches").fetchone()[0])
        if args.dry_run:
            batches = sum(1 for _ in iter_rows(connection, args.batch_size))
            print(json.dumps({"dataset": DATASET_ID, "rows": total, "batches": batches}))
            return

        manifest = request_json(args.base_url, token, "/api/cohort/import", {"action": "manifest"})
        print(f"Manifest: {manifest['dataset']['status']}", flush=True)
        if not args.skip_raw:
            for filename in FILES:
                result = upload_file(args.base_url, token, source_dir / filename)
                print(f"Raw stored: {result['filename']} ({result['bytes']} bytes)", flush=True)

        sent = 0
        started = time.monotonic()
        for batch_number, batch in enumerate(iter_rows(connection, args.batch_size), start=1):
            request_json(
                args.base_url,
                token,
                "/api/cohort/import",
                {"action": "rows", "rows": batch},
            )
            sent += len(batch)
            if batch_number == 1 or batch_number % 25 == 0 or sent == total:
                elapsed = max(0.001, time.monotonic() - started)
                print(
                    f"Rows: {sent:,}/{total:,} ({sent / total:.1%}, {sent / elapsed:,.0f}/s)",
                    flush=True,
                )
        result = request_json(args.base_url, token, "/api/cohort/import", {"action": "finalize"})
        print(json.dumps(result, indent=2))
        if result.get("dataset", {}).get("status") != "ready":
            raise SystemExit("Remote cohort failed exact final validation")
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("Interrupted; rerun is safe because imports are idempotent.")
