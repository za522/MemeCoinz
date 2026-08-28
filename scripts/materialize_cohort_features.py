#!/usr/bin/env python3
"""Materialize leakage-safe metadata narrative features for RED-PUMP.

The source cohort has launch metadata, availability time, and a censored
short-window outcome. It does not have historical X posts, wallet graphs, or
trade paths. This script therefore computes only features that were knowable
from the cohort at each row's `seen_at_ms`, using strictly earlier rows.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
import unicodedata
from collections import defaultdict, deque
from datetime import datetime, timezone
from itertools import groupby
from pathlib import Path
from typing import Any, Iterable


FEATURE_SET_VERSION = "cohort-metadata-narrative-v1"
FIVE_MINUTES_MS = 5 * 60 * 1000
ONE_HOUR_MS = 60 * 60 * 1000
ONE_DAY_MS = 24 * ONE_HOUR_MS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument(
        "--taxonomy",
        default=Path(__file__).parents[1] / "lib/narrative/taxonomy.json",
        type=Path,
    )
    parser.add_argument("--batch-size", type=int, default=20_000)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def normalize(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def classify(
    name: str | None,
    symbol: str | None,
    description_length: int,
    has_x: int,
    has_website: int,
    has_telegram: int,
    themes: dict[str, list[str]],
) -> dict[str, Any]:
    normalized_name = normalize(name)
    normalized_symbol = normalize(symbol).replace(" ", "")
    searchable = f" {normalized_name} {normalized_symbol} "
    compact_name = normalized_name.replace(" ", "")
    scores: list[tuple[str, list[str]]] = []
    for theme, raw_keywords in themes.items():
        matches = []
        for raw_keyword in raw_keywords:
            keyword = normalize(raw_keyword)
            if (
                f" {keyword} " in searchable
                or keyword in normalized_symbol
                or (len(keyword) >= 3 and keyword in compact_name)
            ):
                matches.append(keyword)
        scores.append((theme, matches))
    scores.sort(key=lambda item: (-len(item[1]), item[0]))
    winner_theme, winner_matches = scores[0]
    total_matches = sum(len(matches) for _, matches in scores)
    if not winner_matches:
        winner_theme, winner_matches = "other", []
    link_count = int(bool(has_x)) + int(bool(has_website)) + int(bool(has_telegram))
    completeness = min(
        100.0,
        (20 if normalized_name else 0)
        + (15 if normalized_symbol else 0)
        + min(35.0, max(0, description_length) / 160 * 35)
        + link_count * 10,
    )
    return {
        "normalized_name": normalized_name,
        "normalized_symbol": normalized_symbol,
        "theme": winner_theme,
        "tokens": winner_matches,
        "confidence": round(len(winner_matches) / max(1, total_matches) * 100, 2)
        if winner_matches
        else 0.0,
        "completeness": round(completeness, 2),
        "links": link_count,
    }


def prune(queue: deque[int], now_ms: int, window_ms: int) -> None:
    threshold = now_ms - window_ms
    while queue and queue[0] < threshold:
        queue.popleft()


def create_table(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS cohort_launch_features (
          mint text PRIMARY KEY NOT NULL,
          feature_set_version text NOT NULL,
          normalized_name text NOT NULL,
          normalized_symbol text NOT NULL,
          narrative_theme text NOT NULL,
          narrative_tokens_json text NOT NULL,
          theme_confidence_0_to_100 real NOT NULL,
          metadata_completeness_0_to_100 real NOT NULL,
          social_link_count integer NOT NULL,
          name_reuse_prior_24h integer NOT NULL,
          symbol_reuse_prior_24h integer NOT NULL,
          theme_launches_prior_1h integer NOT NULL,
          theme_launches_prior_24h integer NOT NULL,
          theme_momentum_ratio real,
          launches_prior_5m integer NOT NULL,
          launches_prior_1h integer NOT NULL,
          narrative_novelty_0_to_100 real NOT NULL,
          copy_pressure_0_to_100 real NOT NULL,
          observation_lag_ms integer NOT NULL,
          computed_at text NOT NULL,
          FOREIGN KEY (mint) REFERENCES cohort_launches(mint)
        );
        CREATE INDEX IF NOT EXISTS idx_cohort_features_version_theme
          ON cohort_launch_features(feature_set_version, narrative_theme);
        CREATE INDEX IF NOT EXISTS idx_cohort_features_novelty
          ON cohort_launch_features(narrative_novelty_0_to_100);
        CREATE INDEX IF NOT EXISTS idx_cohort_features_copy_pressure
          ON cohort_launch_features(copy_pressure_0_to_100);
        CREATE TABLE IF NOT EXISTS cohort_feature_aggregates (
          feature_set_version text NOT NULL,
          dimension text NOT NULL,
          bucket text NOT NULL,
          bucket_order integer NOT NULL,
          launches integer NOT NULL,
          confirmed_fast_graduations integer NOT NULL,
          right_censored integer NOT NULL,
          without_published_outcome integer NOT NULL,
          lower_bound_rate_pct real NOT NULL,
          computed_at text NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cohort_feature_aggregates_key
          ON cohort_feature_aggregates(feature_set_version, dimension, bucket);
        CREATE INDEX IF NOT EXISTS idx_cohort_feature_aggregates_dimension_order
          ON cohort_feature_aggregates(dimension, bucket_order);
        """
    )


def materialize_aggregates(connection: sqlite3.Connection, computed_at: str) -> int:
    dimensions = {
        "narrative_theme": ("f.narrative_theme", "0", "f.narrative_theme"),
        "social_link_count": ("CAST(f.social_link_count AS TEXT)", "f.social_link_count", "f.social_link_count"),
        "metadata_completeness_decile": (
            "printf('%d–%d', CAST(f.metadata_completeness_0_to_100 / 10 AS INT) * 10, "
            "MIN(100, CAST(f.metadata_completeness_0_to_100 / 10 AS INT) * 10 + 9))",
            "CAST(f.metadata_completeness_0_to_100 / 10 AS INT)",
            "CAST(f.metadata_completeness_0_to_100 / 10 AS INT)",
        ),
        "narrative_novelty_decile": (
            "printf('%d–%d', CAST(f.narrative_novelty_0_to_100 / 10 AS INT) * 10, "
            "MIN(100, CAST(f.narrative_novelty_0_to_100 / 10 AS INT) * 10 + 9))",
            "CAST(f.narrative_novelty_0_to_100 / 10 AS INT)",
            "CAST(f.narrative_novelty_0_to_100 / 10 AS INT)",
        ),
        "copy_pressure_decile": (
            "printf('%d–%d', CAST(f.copy_pressure_0_to_100 / 10 AS INT) * 10, "
            "MIN(100, CAST(f.copy_pressure_0_to_100 / 10 AS INT) * 10 + 9))",
            "CAST(f.copy_pressure_0_to_100 / 10 AS INT)",
            "CAST(f.copy_pressure_0_to_100 / 10 AS INT)",
        ),
        "name_reuse_prior_24h": (
            "CASE WHEN f.name_reuse_prior_24h = 0 THEN '0' WHEN f.name_reuse_prior_24h <= 2 THEN '1–2' "
            "WHEN f.name_reuse_prior_24h <= 10 THEN '3–10' ELSE '11+' END",
            "CASE WHEN f.name_reuse_prior_24h = 0 THEN 0 WHEN f.name_reuse_prior_24h <= 2 THEN 1 "
            "WHEN f.name_reuse_prior_24h <= 10 THEN 2 ELSE 3 END",
            "CASE WHEN f.name_reuse_prior_24h = 0 THEN 0 WHEN f.name_reuse_prior_24h <= 2 THEN 1 "
            "WHEN f.name_reuse_prior_24h <= 10 THEN 2 ELSE 3 END",
        ),
        "launches_prior_1h": (
            "CASE WHEN f.launches_prior_1h < 500 THEN '<500' WHEN f.launches_prior_1h < 1000 THEN '500–999' "
            "WHEN f.launches_prior_1h < 1500 THEN '1,000–1,499' WHEN f.launches_prior_1h < 2000 THEN '1,500–1,999' ELSE '2,000+' END",
            "CASE WHEN f.launches_prior_1h < 500 THEN 0 WHEN f.launches_prior_1h < 1000 THEN 1 "
            "WHEN f.launches_prior_1h < 1500 THEN 2 WHEN f.launches_prior_1h < 2000 THEN 3 ELSE 4 END",
            "CASE WHEN f.launches_prior_1h < 500 THEN 0 WHEN f.launches_prior_1h < 1000 THEN 1 "
            "WHEN f.launches_prior_1h < 1500 THEN 2 WHEN f.launches_prior_1h < 2000 THEN 3 ELSE 4 END",
        ),
        "observation_lag": (
            "CASE WHEN f.observation_lag_ms < 1000 THEN '<1s' WHEN f.observation_lag_ms < 5000 THEN '1–5s' "
            "WHEN f.observation_lag_ms < 15000 THEN '5–15s' ELSE '15s+' END",
            "CASE WHEN f.observation_lag_ms < 1000 THEN 0 WHEN f.observation_lag_ms < 5000 THEN 1 "
            "WHEN f.observation_lag_ms < 15000 THEN 2 ELSE 3 END",
            "CASE WHEN f.observation_lag_ms < 1000 THEN 0 WHEN f.observation_lag_ms < 5000 THEN 1 "
            "WHEN f.observation_lag_ms < 15000 THEN 2 ELSE 3 END",
        ),
    }
    connection.execute(
        "DELETE FROM cohort_feature_aggregates WHERE feature_set_version = ?",
        (FEATURE_SET_VERSION,),
    )
    for dimension, (bucket_sql, order_sql, group_sql) in dimensions.items():
        connection.execute(
            f"""
            INSERT INTO cohort_feature_aggregates (
              feature_set_version, dimension, bucket, bucket_order, launches,
              confirmed_fast_graduations, right_censored,
              without_published_outcome, lower_bound_rate_pct, computed_at
            )
            SELECT ?, ?, {bucket_sql}, {order_sql}, COUNT(*),
                   SUM(CASE WHEN l.observed_status = 1 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN l.observed_status = 0 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN l.observed_status = -1 THEN 1 ELSE 0 END),
                   ROUND(100.0 * SUM(CASE WHEN l.observed_status = 1 THEN 1 ELSE 0 END) / COUNT(*), 6),
                   ?
            FROM cohort_launch_features f
            JOIN cohort_launches l ON l.mint = f.mint
            WHERE f.feature_set_version = ?
            GROUP BY {group_sql}
            """,
            (FEATURE_SET_VERSION, dimension, computed_at, FEATURE_SET_VERSION),
        )
    connection.commit()
    return int(connection.execute(
        "SELECT COUNT(*) FROM cohort_feature_aggregates WHERE feature_set_version = ?",
        (FEATURE_SET_VERSION,),
    ).fetchone()[0])


def rows(connection: sqlite3.Connection) -> Iterable[sqlite3.Row]:
    return connection.execute(
        """
        SELECT mint, created_at_ms, seen_at_ms, name, symbol,
               description_length, has_x, has_website, has_telegram
        FROM cohort_launches
        WHERE dataset_id = 'red-pump-2026-v1'
        ORDER BY seen_at_ms, mint
        """
    )


def main() -> None:
    args = parse_args()
    database = args.database.resolve()
    taxonomy_path = args.taxonomy.resolve()
    if not database.is_file():
        raise SystemExit(f"Database not found: {database}")
    if not taxonomy_path.is_file():
        raise SystemExit(f"Taxonomy not found: {taxonomy_path}")
    taxonomy = json.loads(taxonomy_path.read_text(encoding="utf-8"))
    themes = taxonomy["themes"]
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    create_table(connection)
    read_connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    read_connection.row_factory = sqlite3.Row
    total = int(connection.execute(
        "SELECT COUNT(*) FROM cohort_launches WHERE dataset_id = 'red-pump-2026-v1'"
    ).fetchone()[0])
    if total == 0:
        raise SystemExit("No RED-PUMP launch rows found")

    overall_5m: deque[int] = deque()
    overall_1h: deque[int] = deque()
    name_24h: dict[str, deque[int]] = defaultdict(deque)
    symbol_24h: dict[str, deque[int]] = defaultdict(deque)
    theme_1h: dict[str, deque[int]] = defaultdict(deque)
    theme_24h: dict[str, deque[int]] = defaultdict(deque)
    computed_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    insert_sql = """
      INSERT INTO cohort_launch_features (
        mint, feature_set_version, normalized_name, normalized_symbol,
        narrative_theme, narrative_tokens_json, theme_confidence_0_to_100,
        metadata_completeness_0_to_100, social_link_count,
        name_reuse_prior_24h, symbol_reuse_prior_24h,
        theme_launches_prior_1h, theme_launches_prior_24h, theme_momentum_ratio,
        launches_prior_5m, launches_prior_1h, narrative_novelty_0_to_100,
        copy_pressure_0_to_100, observation_lag_ms, computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mint) DO UPDATE SET
        feature_set_version=excluded.feature_set_version,
        normalized_name=excluded.normalized_name,
        normalized_symbol=excluded.normalized_symbol,
        narrative_theme=excluded.narrative_theme,
        narrative_tokens_json=excluded.narrative_tokens_json,
        theme_confidence_0_to_100=excluded.theme_confidence_0_to_100,
        metadata_completeness_0_to_100=excluded.metadata_completeness_0_to_100,
        social_link_count=excluded.social_link_count,
        name_reuse_prior_24h=excluded.name_reuse_prior_24h,
        symbol_reuse_prior_24h=excluded.symbol_reuse_prior_24h,
        theme_launches_prior_1h=excluded.theme_launches_prior_1h,
        theme_launches_prior_24h=excluded.theme_launches_prior_24h,
        theme_momentum_ratio=excluded.theme_momentum_ratio,
        launches_prior_5m=excluded.launches_prior_5m,
        launches_prior_1h=excluded.launches_prior_1h,
        narrative_novelty_0_to_100=excluded.narrative_novelty_0_to_100,
        copy_pressure_0_to_100=excluded.copy_pressure_0_to_100,
        observation_lag_ms=excluded.observation_lag_ms,
        computed_at=excluded.computed_at
    """
    batch: list[tuple[Any, ...]] = []
    processed = 0
    # Same-timestamp rows are scored before any member of the group is added,
    # preventing arbitrary mint-order leakage inside second-resolution timestamps.
    for seen_at_ms, group_iterator in groupby(rows(read_connection), key=lambda row: row["seen_at_ms"]):
        group = list(group_iterator)
        prune(overall_5m, seen_at_ms, FIVE_MINUTES_MS)
        prune(overall_1h, seen_at_ms, ONE_HOUR_MS)
        prepared: list[tuple[sqlite3.Row, dict[str, Any]]] = []
        for row in group:
            item = classify(
                row["name"], row["symbol"], row["description_length"],
                row["has_x"], row["has_website"], row["has_telegram"], themes,
            )
            name_queue = name_24h[item["normalized_name"]]
            symbol_queue = symbol_24h[item["normalized_symbol"]]
            theme_hour_queue = theme_1h[item["theme"]]
            theme_day_queue = theme_24h[item["theme"]]
            prune(name_queue, seen_at_ms, ONE_DAY_MS)
            prune(symbol_queue, seen_at_ms, ONE_DAY_MS)
            prune(theme_hour_queue, seen_at_ms, ONE_HOUR_MS)
            prune(theme_day_queue, seen_at_ms, ONE_DAY_MS)
            name_reuse = len(name_queue) if item["normalized_name"] else 0
            symbol_reuse = len(symbol_queue) if item["normalized_symbol"] else 0
            theme_hour = len(theme_hour_queue)
            theme_day = len(theme_day_queue)
            theme_momentum = round(theme_hour / (theme_day / 24), 4) if theme_day else None
            copy_pressure = min(
                100.0,
                32 * math.log1p(name_reuse)
                + 36 * math.log1p(symbol_reuse)
                + 8 * math.log1p(theme_hour),
            )
            novelty = max(0.0, 100.0 - copy_pressure)
            batch.append((
                row["mint"], FEATURE_SET_VERSION, item["normalized_name"],
                item["normalized_symbol"], item["theme"],
                json.dumps(item["tokens"], separators=(",", ":")), item["confidence"],
                item["completeness"], item["links"], name_reuse, symbol_reuse,
                theme_hour, theme_day, theme_momentum, len(overall_5m), len(overall_1h),
                round(novelty, 2), round(copy_pressure, 2),
                max(0, int(row["seen_at_ms"] - row["created_at_ms"])), computed_at,
            ))
            prepared.append((row, item))
        for row, item in prepared:
            overall_5m.append(seen_at_ms)
            overall_1h.append(seen_at_ms)
            if item["normalized_name"]:
                name_24h[item["normalized_name"]].append(seen_at_ms)
            if item["normalized_symbol"]:
                symbol_24h[item["normalized_symbol"]].append(seen_at_ms)
            theme_1h[item["theme"]].append(seen_at_ms)
            theme_24h[item["theme"]].append(seen_at_ms)
        if len(batch) >= args.batch_size:
            if not args.dry_run:
                connection.executemany(insert_sql, batch)
                connection.commit()
            processed += len(batch)
            print(f"Features: {processed:,}/{total:,}", flush=True)
            batch = []
    if batch:
        if not args.dry_run:
            connection.executemany(insert_sql, batch)
            connection.commit()
        processed += len(batch)
    stored = int(connection.execute(
        "SELECT COUNT(*) FROM cohort_launch_features WHERE feature_set_version = ?",
        (FEATURE_SET_VERSION,),
    ).fetchone()[0])
    aggregate_rows = 0 if args.dry_run else materialize_aggregates(connection, computed_at)
    read_connection.close()
    connection.close()
    print(json.dumps({
        "featureSetVersion": FEATURE_SET_VERSION,
        "launches": total,
        "processed": processed,
        "stored": stored if not args.dry_run else 0,
        "aggregateRows": aggregate_rows,
        "dryRun": args.dry_run,
    }, indent=2))


if __name__ == "__main__":
    main()
