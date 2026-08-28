#!/usr/bin/env python3
"""Export the normalized RED-PUMP SQLite corpus as browser-streamable JSONL."""

from __future__ import annotations

import argparse
import gzip
import json
import sqlite3
from datetime import datetime
from pathlib import Path


def iso_to_ms(value: str | None) -> int | None:
    if not value:
        return None
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit(f"Refusing to replace existing output: {args.output}")
    connection = sqlite3.connect(f"file:{args.database.resolve()}?mode=ro", uri=True)
    count = 0
    try:
        query = """
            SELECT l.mint, l.created_at, l.seen_at, l.name, l.symbol,
                   l.initial_market_cap_sol, l.has_x, l.has_website,
                   l.has_telegram, l.description_length,
                   COALESCE(CASE WHEN o.observed_graduated = 1 THEN 1 ELSE 0 END, -1),
                   CASE WHEN o.observed_graduated = 1 THEN o.observed_at ELSE NULL END,
                   CASE WHEN o.observed_graduated = 1
                        THEN o.minutes_to_observed_graduation ELSE NULL END
            FROM launches l
            LEFT JOIN observed_outcomes o ON o.mint = l.mint
            ORDER BY l.mint
        """
        with gzip.open(args.output, "wt", encoding="utf-8", compresslevel=6) as output:
            for row in connection.execute(query):
                value = {
                    "mint": row[0],
                    "createdAtMs": iso_to_ms(row[1]),
                    "seenAtMs": iso_to_ms(row[2]),
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
                output.write(json.dumps(value, separators=(",", ":"), ensure_ascii=False))
                output.write("\n")
                count += 1
    finally:
        connection.close()
    if count != 860_194:
        args.output.unlink(missing_ok=True)
        raise SystemExit(f"Expected 860194 rows, exported {count}")
    print(json.dumps({"output": str(args.output.resolve()), "rows": count, "bytes": args.output.stat().st_size}))


if __name__ == "__main__":
    main()
