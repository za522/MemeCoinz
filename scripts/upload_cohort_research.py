#!/usr/bin/env python3
"""Upload calculated RED-PUMP features and descriptive aggregates to MemeTrace.

The source database is a local SQLite/D1 file already materialized by
materialize_cohort_features.py. Uploads are bounded, authenticated, idempotent,
and never log BACKFILL_ADMIN_TOKEN.
"""

from __future__ import annotations

import argparse
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
import json
import os
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload calculated cohort research rows.")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--batch-size", type=int, default=1_000)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--skip-launches", action="store_true")
    parser.add_argument("--skip-features", action="store_true")
    parser.add_argument("--skip-aggregates", action="store_true")
    return parser.parse_args()


def upload_batches(
    base_url: str,
    token: str,
    action: str,
    batches: Iterable[list[dict[str, Any]]],
    total: int,
    workers: int,
    label: str,
) -> int:
    """Upload independent idempotent batches with bounded concurrency."""
    sent = 0
    completed_batches = 0
    started = time.monotonic()
    iterator = iter(batches)
    pending: dict[Future[dict[str, Any]], int] = {}

    with ThreadPoolExecutor(max_workers=workers) as executor:
        while len(pending) < workers * 2:
            try:
                batch = next(iterator)
            except StopIteration:
                break
            pending[executor.submit(request_json, base_url, token, {"action": action, "rows": batch})] = len(batch)

        while pending:
            done, _ = wait(pending, return_when=FIRST_COMPLETED)
            for future in done:
                batch_size = pending.pop(future)
                future.result()
                sent += batch_size
                completed_batches += 1
                if completed_batches == 1 or completed_batches % 25 == 0 or sent == total:
                    elapsed = max(0.001, time.monotonic() - started)
                    print(
                        f"{label}: {sent:,}/{total:,} ({sent / max(total, 1):.1%}, "
                        f"{sent / elapsed:,.0f}/s)",
                        flush=True,
                    )
                try:
                    batch = next(iterator)
                except StopIteration:
                    continue
                pending[executor.submit(request_json, base_url, token, {"action": action, "rows": batch})] = len(batch)
    return sent


def request_json(base_url: str, token: str, body: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(body, separators=(",", ":")).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Content-Length": str(len(data)),
        "x-backfill-token": token,
    }
    sites_bypass_token = os.environ.get("SITES_BYPASS_TOKEN", "").strip()
    if sites_bypass_token:
        headers["OAI-Sites-Authorization"] = f"Bearer {sites_bypass_token}"
    request = urllib.request.Request(
        urllib.parse.urljoin(base_url.rstrip("/") + "/", "api/cohort/import"),
        data=data,
        method="POST",
        headers=headers,
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            if error.code < 500 or attempt == 5:
                raise RuntimeError(f"Feature upload failed ({error.code}): {detail}") from error
        except (OSError, TimeoutError) as error:
            if attempt == 5:
                raise RuntimeError(f"Feature upload failed: {error}") from error
        time.sleep(min(30, 2 ** attempt))
    raise AssertionError("unreachable")


def launch_batches(
    connection: sqlite3.Connection,
    batch_size: int,
) -> Iterable[list[dict[str, Any]]]:
    last_mint = ""
    while True:
        rows = connection.execute(
            """
            SELECT mint, created_at_ms, seen_at_ms, name, symbol,
                   initial_market_cap_sol, has_x, has_website, has_telegram,
                   description_length, observed_status,
                   observed_graduation_at_ms, observed_graduation_minutes
            FROM cohort_launches
            WHERE mint > ?
            ORDER BY mint
            LIMIT ?
            """,
            (last_mint, batch_size),
        ).fetchall()
        if not rows:
            return
        yield [
            {
                "mint": row[0],
                "createdAtMs": row[1],
                "seenAtMs": row[2],
                "name": row[3],
                "symbol": row[4],
                "initialMarketCapSol": row[5],
                "hasX": bool(row[6]),
                "hasWebsite": bool(row[7]),
                "hasTelegram": bool(row[8]),
                "descriptionLength": row[9],
                "observedStatus": row[10],
                "observedGraduationAtMs": row[11],
                "observedGraduationMinutes": row[12],
            }
            for row in rows
        ]
        last_mint = rows[-1][0]


def feature_batches(
    connection: sqlite3.Connection,
    batch_size: int,
) -> Iterable[list[dict[str, Any]]]:
    last_mint = ""
    while True:
        rows = connection.execute(
            """
            SELECT mint, feature_set_version, normalized_name, normalized_symbol,
                   narrative_theme, narrative_tokens_json, theme_confidence_0_to_100,
                   metadata_completeness_0_to_100, social_link_count,
                   name_reuse_prior_24h, symbol_reuse_prior_24h,
                   theme_launches_prior_1h, theme_launches_prior_24h,
                   theme_momentum_ratio, launches_prior_5m, launches_prior_1h,
                   narrative_novelty_0_to_100, copy_pressure_0_to_100,
                   observation_lag_ms, computed_at
            FROM cohort_launch_features
            WHERE mint > ?
            ORDER BY mint
            LIMIT ?
            """,
            (last_mint, batch_size),
        ).fetchall()
        if not rows:
            return
        yield [
            {
                "mint": row[0],
                "featureSetVersion": row[1],
                "normalizedName": row[2],
                "normalizedSymbol": row[3],
                "narrativeTheme": row[4],
                "narrativeTokens": json.loads(row[5]),
                "themeConfidence0To100": row[6],
                "metadataCompleteness0To100": row[7],
                "socialLinkCount": row[8],
                "nameReusePrior24h": row[9],
                "symbolReusePrior24h": row[10],
                "themeLaunchesPrior1h": row[11],
                "themeLaunchesPrior24h": row[12],
                "themeMomentumRatio": row[13],
                "launchesPrior5m": row[14],
                "launchesPrior1h": row[15],
                "narrativeNovelty0To100": row[16],
                "copyPressure0To100": row[17],
                "observationLagMs": row[18],
                "computedAt": row[19],
            }
            for row in rows
        ]
        last_mint = rows[-1][0]


def aggregate_rows(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT feature_set_version, dimension, bucket, bucket_order, launches,
               confirmed_fast_graduations, right_censored,
               without_published_outcome, lower_bound_rate_pct, computed_at
        FROM cohort_feature_aggregates
        ORDER BY dimension, bucket_order, bucket
        """
    ).fetchall()
    return [
        {
            "featureSetVersion": row[0],
            "dimension": row[1],
            "bucket": row[2],
            "bucketOrder": row[3],
            "launches": row[4],
            "confirmedFastGraduations": row[5],
            "rightCensored": row[6],
            "withoutPublishedOutcome": row[7],
            "lowerBoundRatePct": row[8],
            "computedAt": row[9],
        }
        for row in rows
    ]


def main() -> None:
    args = parse_args()
    if not 1 <= args.batch_size <= 1_000:
        raise SystemExit("--batch-size must be from 1 to 1000")
    if not 1 <= args.workers <= 16:
        raise SystemExit("--workers must be from 1 to 16")
    token = os.environ.get("BACKFILL_ADMIN_TOKEN", "").strip()
    if not token:
        raise SystemExit("BACKFILL_ADMIN_TOKEN is required")
    database = args.database.resolve()
    if not database.is_file():
        raise SystemExit(f"Database not found: {database}")

    connection = sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)
    try:
        request_json(args.base_url, token, {"action": "manifest"})
        if not args.skip_launches:
            total = int(connection.execute("SELECT COUNT(*) FROM cohort_launches").fetchone()[0])
            sent = upload_batches(
                args.base_url,
                token,
                "rows",
                launch_batches(connection, args.batch_size),
                total,
                args.workers,
                "Launches",
            )
            if sent != total:
                raise SystemExit(f"Launch upload stopped at {sent:,}/{total:,}")

        if not args.skip_features:
            total = int(connection.execute("SELECT COUNT(*) FROM cohort_launch_features").fetchone()[0])
            sent = upload_batches(
                args.base_url,
                token,
                "features",
                feature_batches(connection, args.batch_size),
                total,
                args.workers,
                "Features",
            )
            if sent != total:
                raise SystemExit(f"Feature upload stopped at {sent:,}/{total:,}")

        if not args.skip_aggregates:
            rows = aggregate_rows(connection)
            if rows:
                request_json(args.base_url, token, {"action": "feature-aggregates", "rows": rows})
            print(f"Aggregates: {len(rows):,}", flush=True)
        result = request_json(args.base_url, token, {"action": "finalize"})
        print(json.dumps(result, indent=2), flush=True)
        if result.get("dataset", {}).get("status") != "ready":
            raise SystemExit("Remote cohort failed exact final validation")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
