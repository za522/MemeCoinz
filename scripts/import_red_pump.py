#!/usr/bin/env python3
"""Import the RED-PUMP-2026-v1 public corpus into a provenance-first SQLite DB.

The publisher's v1.4 corrigendum establishes that TIMEOUT rows are not
24-hour failures. This importer therefore stores them as right-censored
observations and never emits a negative model label from them.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


DATASET_ID = "red-pump-2026-v1"
DATASET_VERSION = "1.4-corrigendum"
CONCEPT_DOI = "10.5281/zenodo.20633486"
VERSION_DOI = "10.5281/zenodo.21923106"
LICENSE_ID = "CC-BY-4.0"
LAUNCHES_FILE = "red_pump_2026_v1_launches.jsonl.gz"
OUTCOMES_FILE = "red_pump_2026_v1_outcomes.csv.gz"
SOURCE_WINDOW_START = "2026-05-08"
SOURCE_WINDOW_END = "2026-06-10"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import the corrected RED-PUMP launch corpus into SQLite."
    )
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-db", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace an existing output database and summary.",
    )
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def expected_hashes(manifest_path: Path) -> dict[str, str]:
    expected: dict[str, str] = {}
    for raw_line in manifest_path.read_text(encoding="utf-8").splitlines():
        parts = raw_line.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        expected[Path(parts[1].lstrip("*")).name] = parts[0]
    return expected


def utc_from_ms(value: int) -> str:
    return (
        datetime.fromtimestamp(value / 1000, tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def chunks(rows: Iterable[tuple[Any, ...]], size: int = 20_000):
    batch: list[tuple[Any, ...]] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        PRAGMA foreign_keys = ON;
        PRAGMA user_version = 1;

        CREATE TABLE dataset_manifest (
            dataset_id TEXT PRIMARY KEY,
            dataset_version TEXT NOT NULL,
            concept_doi TEXT NOT NULL,
            version_doi TEXT NOT NULL,
            license_id TEXT NOT NULL,
            source_window_start TEXT NOT NULL,
            source_window_end TEXT NOT NULL,
            imported_at TEXT NOT NULL,
            launches_sha256 TEXT NOT NULL,
            outcomes_sha256 TEXT NOT NULL,
            label_policy TEXT NOT NULL,
            limitations_path TEXT NOT NULL,
            source_url TEXT NOT NULL
        );

        CREATE TABLE launches (
            mint TEXT PRIMARY KEY,
            seen_at TEXT NOT NULL,
            available_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            name TEXT,
            symbol TEXT,
            initial_market_cap_sol REAL,
            has_x INTEGER NOT NULL CHECK (has_x IN (0, 1)),
            has_website INTEGER NOT NULL CHECK (has_website IN (0, 1)),
            has_telegram INTEGER NOT NULL CHECK (has_telegram IN (0, 1)),
            description_length INTEGER NOT NULL,
            detection_lag_seconds REAL,
            source_fidelity TEXT NOT NULL,
            duplicate_rows INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX idx_launches_created_at ON launches(created_at);
        CREATE INDEX idx_launches_seen_at ON launches(seen_at);
        CREATE INDEX idx_launches_socials ON launches(has_x, has_website, has_telegram);

        CREATE TABLE observed_outcomes (
            mint TEXT PRIMARY KEY,
            symbol TEXT,
            observed_outcome TEXT NOT NULL CHECK (
                observed_outcome IN (
                    'confirmed_fast_graduation',
                    'right_censored_after_visibility_loss'
                )
            ),
            observed_graduated INTEGER NOT NULL CHECK (observed_graduated IN (0, 1)),
            observed_at TEXT,
            minutes_to_observed_graduation REAL,
            raw_minutes_to_outcome REAL NOT NULL,
            initial_market_cap_sol REAL,
            final_market_cap_sol REAL,
            note TEXT,
            created_at_chain TEXT,
            detection_lag_minutes REAL,
            label_fidelity TEXT NOT NULL,
            FOREIGN KEY (mint) REFERENCES launches(mint)
        );

        CREATE INDEX idx_outcomes_observed_graduated
            ON observed_outcomes(observed_graduated);

        CREATE TABLE import_quality (
            metric TEXT PRIMARY KEY,
            value_integer INTEGER,
            value_real REAL,
            value_text TEXT
        );

        CREATE TABLE fast_regime_aggregates (
            feature_name TEXT NOT NULL,
            feature_value TEXT NOT NULL,
            launches INTEGER NOT NULL,
            confirmed_fast_graduations INTEGER NOT NULL,
            lower_bound_rate REAL NOT NULL,
            PRIMARY KEY (feature_name, feature_value)
        );
        """
    )


def import_launches(
    connection: sqlite3.Connection, path: Path
) -> dict[str, int]:
    counters = {"rows": 0, "malformed": 0}

    def parsed_rows():
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            for line in handle:
                counters["rows"] += 1
                try:
                    row = json.loads(line)
                    mint = str(row["mint"]).strip()
                    seen_ms = int(row["t"])
                    created_ms = int(row["created_timestamp"])
                    if not mint:
                        raise ValueError("blank mint")
                    initial_market_cap = row.get("initial_market_cap_sol")
                    yield (
                        mint,
                        utc_from_ms(seen_ms),
                        utc_from_ms(seen_ms),
                        utc_from_ms(created_ms),
                        str(row.get("name") or "") or None,
                        str(row.get("symbol") or "") or None,
                        float(initial_market_cap)
                        if initial_market_cap is not None
                        else None,
                        int(bool(row.get("has_twitter"))),
                        int(bool(row.get("has_website"))),
                        int(bool(row.get("has_telegram"))),
                        max(0, int(row.get("description_length") or 0)),
                        (seen_ms - created_ms) / 1000,
                        "vendor_observed_with_onchain_timestamp",
                    )
                except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                    counters["malformed"] += 1

    insert_sql = """
        INSERT INTO launches (
            mint, seen_at, available_at, created_at, name, symbol,
            initial_market_cap_sol, has_x, has_website, has_telegram,
            description_length, detection_lag_seconds, source_fidelity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mint) DO UPDATE SET
            duplicate_rows = launches.duplicate_rows + 1
    """
    for batch in chunks(parsed_rows()):
        connection.executemany(insert_sql, batch)
        connection.commit()

    unique = connection.execute("SELECT COUNT(*) FROM launches").fetchone()[0]
    duplicate_rows = connection.execute(
        "SELECT COALESCE(SUM(duplicate_rows), 0) FROM launches"
    ).fetchone()[0]
    return {
        **counters,
        "unique": int(unique),
        "duplicate_rows": int(duplicate_rows),
    }


def import_outcomes(
    connection: sqlite3.Connection, path: Path
) -> dict[str, int]:
    counters = {
        "rows": 0,
        "blank_outcome": 0,
        "malformed_outcome": 0,
        "nonpositive_duration": 0,
        "blank_mint": 0,
    }

    def parsed_rows():
        with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                counters["rows"] += 1
                outcome = (row.get("outcome") or "").strip()
                if not outcome:
                    counters["blank_outcome"] += 1
                    continue
                if outcome not in {"GRADUATED", "TIMEOUT"}:
                    counters["malformed_outcome"] += 1
                    continue
                mint = (row.get("mint") or "").strip()
                if not mint:
                    counters["blank_mint"] += 1
                    continue
                try:
                    raw_minutes = float(row.get("minutes_to_outcome") or 0)
                except ValueError:
                    counters["nonpositive_duration"] += 1
                    continue
                if raw_minutes <= 0:
                    counters["nonpositive_duration"] += 1
                    continue
                graduated = outcome == "GRADUATED"

                def optional_float(name: str) -> float | None:
                    raw = (row.get(name) or "").strip()
                    try:
                        return float(raw) if raw else None
                    except ValueError:
                        return None

                yield (
                    mint,
                    (row.get("symbol") or "").strip() or None,
                    "confirmed_fast_graduation"
                    if graduated
                    else "right_censored_after_visibility_loss",
                    int(graduated),
                    (row.get("graduated_at") or "").strip() or None,
                    raw_minutes if graduated else None,
                    raw_minutes,
                    optional_float("initial_market_cap_sol"),
                    optional_float("final_market_cap_sol"),
                    (row.get("note") or "").strip() or None,
                    (row.get("created_at_chain_iso") or "").strip() or None,
                    optional_float("detection_lag_min"),
                    "confirmed_observer_event"
                    if graduated
                    else "right_censored_nonlabel",
                )

    insert_sql = """
        INSERT INTO observed_outcomes (
            mint, symbol, observed_outcome, observed_graduated, observed_at,
            minutes_to_observed_graduation, raw_minutes_to_outcome,
            initial_market_cap_sol, final_market_cap_sol, note,
            created_at_chain, detection_lag_minutes, label_fidelity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mint) DO UPDATE SET
            symbol = excluded.symbol,
            observed_outcome = excluded.observed_outcome,
            observed_graduated = excluded.observed_graduated,
            observed_at = excluded.observed_at,
            minutes_to_observed_graduation = excluded.minutes_to_observed_graduation,
            raw_minutes_to_outcome = excluded.raw_minutes_to_outcome,
            initial_market_cap_sol = excluded.initial_market_cap_sol,
            final_market_cap_sol = excluded.final_market_cap_sol,
            note = excluded.note,
            created_at_chain = excluded.created_at_chain,
            detection_lag_minutes = excluded.detection_lag_minutes,
            label_fidelity = excluded.label_fidelity
        WHERE excluded.observed_graduated = 1
          AND observed_outcomes.observed_graduated = 0
    """
    connection.execute("PRAGMA foreign_keys = OFF")
    for batch in chunks(parsed_rows()):
        connection.executemany(insert_sql, batch)
        connection.commit()
    connection.execute("PRAGMA foreign_keys = ON")

    row = connection.execute(
        """
        SELECT COUNT(*),
               COALESCE(SUM(observed_graduated), 0),
               COALESCE(SUM(1 - observed_graduated), 0)
        FROM observed_outcomes
        """
    ).fetchone()
    return {
        **counters,
        "unique": int(row[0]),
        "confirmed_fast_graduations": int(row[1]),
        "right_censored": int(row[2]),
    }


def populate_aggregates(connection: sqlite3.Connection) -> None:
    queries = [("all", "all", "1 = 1")]
    for column, name in (
        ("has_x", "has_x"),
        ("has_website", "has_website"),
        ("has_telegram", "has_telegram"),
    ):
        queries.extend(
            [(name, "0", f"l.{column} = 0"), (name, "1", f"l.{column} = 1")]
        )
    for feature_name, feature_value, where_sql in queries:
        row = connection.execute(
            f"""
            SELECT COUNT(*), COALESCE(SUM(o.observed_graduated), 0)
            FROM launches l
            LEFT JOIN observed_outcomes o ON o.mint = l.mint
            WHERE {where_sql}
            """
        ).fetchone()
        count, graduates = int(row[0]), int(row[1])
        connection.execute(
            """
            INSERT INTO fast_regime_aggregates (
                feature_name, feature_value, launches,
                confirmed_fast_graduations, lower_bound_rate
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                feature_name,
                feature_value,
                count,
                graduates,
                graduates / count if count else 0,
            ),
        )
    connection.commit()


def quality_metrics(
    connection: sqlite3.Connection,
    launch_stats: dict[str, int],
    outcome_stats: dict[str, int],
) -> dict[str, Any]:
    matched = int(
        connection.execute(
            """
            SELECT COUNT(*) FROM observed_outcomes o
            INNER JOIN launches l ON l.mint = o.mint
            """
        ).fetchone()[0]
    )
    launches_without_outcome = int(
        connection.execute(
            """
            SELECT COUNT(*) FROM launches l
            LEFT JOIN observed_outcomes o ON o.mint = l.mint
            WHERE o.mint IS NULL
            """
        ).fetchone()[0]
    )
    outcomes_without_launch = int(
        connection.execute(
            """
            SELECT COUNT(*) FROM observed_outcomes o
            LEFT JOIN launches l ON l.mint = o.mint
            WHERE l.mint IS NULL
            """
        ).fetchone()[0]
    )
    return {
        "launches": launch_stats,
        "outcomes": outcome_stats,
        "matched_outcomes": matched,
        "launches_without_observed_outcome": launches_without_outcome,
        "outcomes_without_launch": outcomes_without_launch,
    }


def write_quality_table(
    connection: sqlite3.Connection, quality: dict[str, Any]
) -> None:
    flattened: list[tuple[str, int | None, float | None, str | None]] = []
    for section, value in quality.items():
        if isinstance(value, dict):
            for metric, metric_value in value.items():
                flattened.append(
                    (f"{section}.{metric}", int(metric_value), None, None)
                )
        elif isinstance(value, int):
            flattened.append((section, value, None, None))
        elif isinstance(value, float):
            flattened.append((section, None, value, None))
        else:
            flattened.append((section, None, None, str(value)))
    connection.executemany(
        """
        INSERT INTO import_quality(metric, value_integer, value_real, value_text)
        VALUES (?, ?, ?, ?)
        """,
        flattened,
    )
    connection.commit()


def main() -> None:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    output_db = args.output_db.resolve()
    summary_path = args.summary.resolve()
    launches_path = source_dir / LAUNCHES_FILE
    outcomes_path = source_dir / OUTCOMES_FILE
    manifest_path = source_dir / "SHA256SUMS"
    limitations_path = source_dir / "KNOWN_LIMITATIONS.md"
    for required in (
        launches_path,
        outcomes_path,
        manifest_path,
        limitations_path,
    ):
        if not required.is_file():
            raise SystemExit(f"Required source file is missing: {required}")
    if (output_db.exists() or summary_path.exists()) and not args.replace:
        raise SystemExit("Output already exists; rerun with --replace to replace it.")

    expected = expected_hashes(manifest_path)
    actual_hashes = {
        LAUNCHES_FILE: sha256(launches_path),
        OUTCOMES_FILE: sha256(outcomes_path),
    }
    for filename, actual in actual_hashes.items():
        if expected.get(filename) != actual:
            raise SystemExit(
                f"SHA-256 mismatch for {filename}: expected "
                f"{expected.get(filename)!r}, got {actual!r}"
            )

    output_db.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_db = output_db.with_suffix(output_db.suffix + ".tmp")
    if temporary_db.exists():
        temporary_db.unlink()
    connection = sqlite3.connect(temporary_db)
    try:
        create_schema(connection)
        launch_stats = import_launches(connection, launches_path)
        outcome_stats = import_outcomes(connection, outcomes_path)
        populate_aggregates(connection)
        quality = quality_metrics(connection, launch_stats, outcome_stats)
        write_quality_table(connection, quality)
        imported_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        connection.execute(
            """
            INSERT INTO dataset_manifest (
                dataset_id, dataset_version, concept_doi, version_doi,
                license_id, source_window_start, source_window_end,
                imported_at, launches_sha256, outcomes_sha256, label_policy,
                limitations_path, source_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                DATASET_ID,
                DATASET_VERSION,
                CONCEPT_DOI,
                VERSION_DOI,
                LICENSE_ID,
                SOURCE_WINDOW_START,
                SOURCE_WINDOW_END,
                imported_at,
                actual_hashes[LAUNCHES_FILE],
                actual_hashes[OUTCOMES_FILE],
                "GRADUATED is confirmed fast-regime evidence; TIMEOUT is "
                "right-censored and is never a negative model label.",
                str(limitations_path),
                "https://zenodo.org/records/21923106",
            ),
        )
        connection.commit()
        connection.execute("PRAGMA optimize")
        connection.commit()
        aggregates = [
            {
                "feature": row[0],
                "value": row[1],
                "launches": row[2],
                "confirmedFastGraduations": row[3],
                "lowerBoundRate": row[4],
            }
            for row in connection.execute(
                """
                SELECT feature_name, feature_value, launches,
                       confirmed_fast_graduations, lower_bound_rate
                FROM fast_regime_aggregates
                ORDER BY feature_name, feature_value
                """
            )
        ]
    finally:
        connection.close()

    if output_db.exists():
        output_db.unlink()
    os.replace(temporary_db, output_db)
    summary = {
        "datasetId": DATASET_ID,
        "datasetVersion": DATASET_VERSION,
        "conceptDoi": CONCEPT_DOI,
        "versionDoi": VERSION_DOI,
        "license": LICENSE_ID,
        "sourceWindow": {
            "start": SOURCE_WINDOW_START,
            "end": SOURCE_WINDOW_END,
        },
        "database": str(output_db),
        "sourceHashes": actual_hashes,
        "quality": quality,
        "fastRegimeAggregates": aggregates,
        "labelPolicy": (
            "Confirmed observed graduations are positive evidence. TIMEOUT rows "
            "are right-censored after observer visibility loss and are not "
            "negative or 24-hour outcome labels."
        ),
        "knownLimitation": (
            "The source polled a rolling top-50 endpoint; it cannot provide a "
            "complete 24-hour graduation outcome or point-in-time trade history."
        ),
    }
    summary_path.write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
