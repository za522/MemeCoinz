#!/usr/bin/env python3
"""Train leakage-safe baselines for RED-PUMP confirmed fast graduation.

This is deliberately a ranking study, not a profitability model. The v1.4
RED-PUMP corrigendum establishes that TIMEOUT means right-censored after the
observer lost visibility, not a confirmed failure. The operational target is
therefore whether that observer confirmed a very fast graduation.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import math
import pickle
from collections import defaultdict, deque
from datetime import datetime, timezone
from itertools import groupby
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from materialize_cohort_features import classify, prune


DATASET_VERSION = "RED-PUMP-2026-v1.4"
FEATURE_VERSION = "fast-graduation-baseline-v1"
FIVE_MINUTES_MS = 5 * 60 * 1000
ONE_HOUR_MS = 60 * 60 * 1000
ONE_DAY_MS = 24 * ONE_HOUR_MS
THEMES = (
    "ai", "animal", "celebrity", "crypto", "finance",
    "food", "internet", "other", "politics", "sports",
)

BASE_FEATURES = (
    "log_initial_market_cap_sol",
    "has_x",
    "has_website",
    "has_telegram",
    "log_description_length",
    "launch_hour_sin",
    "launch_hour_cos",
)

ENGINEERED_FEATURES = BASE_FEATURES + (
    "social_link_count",
    "metadata_completeness",
    "log_name_reuse_prior_24h",
    "log_symbol_reuse_prior_24h",
    "log_theme_launches_prior_1h",
    "log_theme_launches_prior_24h",
    "log_theme_momentum_ratio",
    "log_launches_prior_5m",
    "log_launches_prior_1h",
    "copy_pressure",
) + tuple(f"theme_{theme}" for theme in THEMES)


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--launches", required=True, type=Path)
    parser.add_argument("--outcomes", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--taxonomy", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--seed", type=int, default=20261003)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_sources(launches: Path, outcomes: Path, manifest: Path) -> dict[str, str]:
    expected: dict[str, str] = {}
    for line in manifest.read_text(encoding="utf-8").splitlines():
        parts = line.strip().split(maxsplit=1)
        if len(parts) == 2:
            expected[Path(parts[1].lstrip("*")).name] = parts[0]
    actual = {launches.name: sha256(launches), outcomes.name: sha256(outcomes)}
    for name, digest in actual.items():
        if expected.get(name) != digest:
            raise SystemExit(
                f"SHA-256 mismatch for {name}: expected {expected.get(name)!r}, got {digest!r}"
            )
    return actual


def load_outcomes(path: Path) -> dict[str, int]:
    values: dict[str, int] = {}
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            mint = (row.get("mint") or "").strip()
            outcome = (row.get("outcome") or "").strip()
            if not mint or outcome not in {"GRADUATED", "TIMEOUT"}:
                continue
            try:
                duration = float(row.get("minutes_to_outcome") or 0)
            except ValueError:
                continue
            if duration <= 0:
                continue
            value = 1 if outcome == "GRADUATED" else 0
            # Confirmed graduation supersedes an earlier right-censored record.
            if mint not in values or value == 1:
                values[mint] = value
    return values


def load_launches(path: Path) -> list[tuple[Any, ...]]:
    values: dict[str, tuple[Any, ...]] = {}
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            mint = str(row.get("mint") or "").strip()
            if not mint or mint in values:
                continue
            created_at_ms = int(row["created_timestamp"])
            seen_at_ms = max(int(row["t"]), created_at_ms)
            values[mint] = (
                mint,
                seen_at_ms,
                created_at_ms,
                str(row.get("name") or ""),
                str(row.get("symbol") or ""),
                float(row["initial_market_cap_sol"])
                if row.get("initial_market_cap_sol") is not None
                else math.nan,
                int(bool(row.get("has_twitter"))),
                int(bool(row.get("has_website"))),
                int(bool(row.get("has_telegram"))),
                max(0, int(row.get("description_length") or 0)),
            )
    result = list(values.values())
    result.sort(key=lambda row: (row[1], row[0]))
    return result


def utc_iso(milliseconds: int) -> str:
    return datetime.fromtimestamp(milliseconds / 1000, tz=timezone.utc).isoformat()


def feature_rows(
    launches: list[tuple[Any, ...]],
    outcomes: dict[str, int],
    taxonomy: dict[str, list[str]],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    x_rows: list[list[float]] = []
    labels: list[int] = []
    times: list[int] = []
    mints: list[str] = []

    overall_5m: deque[int] = deque()
    overall_1h: deque[int] = deque()
    name_24h: dict[str, deque[int]] = defaultdict(deque)
    symbol_24h: dict[str, deque[int]] = defaultdict(deque)
    theme_1h: dict[str, deque[int]] = defaultdict(deque)
    theme_24h: dict[str, deque[int]] = defaultdict(deque)
    theme_index = {theme: index for index, theme in enumerate(THEMES)}

    for seen_at_ms, iterator in groupby(launches, key=lambda row: row[1]):
        group = list(iterator)
        prune(overall_5m, seen_at_ms, FIVE_MINUTES_MS)
        prune(overall_1h, seen_at_ms, ONE_HOUR_MS)
        prepared: list[tuple[tuple[Any, ...], dict[str, Any]]] = []
        for row in group:
            mint, _, created_at_ms, name, symbol, initial_cap, has_x, has_web, has_tg, desc_len = row
            item = classify(name, symbol, desc_len, has_x, has_web, has_tg, taxonomy)
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
            theme_momentum = theme_hour / (theme_day / 24) if theme_day else math.nan
            copy_pressure = min(
                100.0,
                32 * math.log1p(name_reuse)
                + 36 * math.log1p(symbol_reuse)
                + 8 * math.log1p(theme_hour),
            )
            created = datetime.fromtimestamp(created_at_ms / 1000, tz=timezone.utc)
            hour = created.hour + created.minute / 60 + created.second / 3600
            theme_vector = [0.0] * len(THEMES)
            theme_vector[theme_index.get(item["theme"], theme_index["other"])] = 1.0
            features = [
                math.log1p(max(0.0, initial_cap)) if math.isfinite(initial_cap) else math.nan,
                float(has_x),
                float(has_web),
                float(has_tg),
                math.log1p(desc_len),
                math.sin(2 * math.pi * hour / 24),
                math.cos(2 * math.pi * hour / 24),
                float(item["links"]),
                float(item["completeness"]),
                math.log1p(name_reuse),
                math.log1p(symbol_reuse),
                math.log1p(theme_hour),
                math.log1p(theme_day),
                math.log1p(theme_momentum) if math.isfinite(theme_momentum) else math.nan,
                math.log1p(len(overall_5m)),
                math.log1p(len(overall_1h)),
                copy_pressure,
                *theme_vector,
            ]
            if mint in outcomes:
                x_rows.append(features)
                labels.append(outcomes[mint])
                times.append(seen_at_ms)
                mints.append(mint)
            prepared.append((row, item))

        # Rows sharing the same millisecond are added only after all are scored.
        for row, item in prepared:
            overall_5m.append(seen_at_ms)
            overall_1h.append(seen_at_ms)
            if item["normalized_name"]:
                name_24h[item["normalized_name"]].append(seen_at_ms)
            if item["normalized_symbol"]:
                symbol_24h[item["normalized_symbol"]].append(seen_at_ms)
            theme_1h[item["theme"]].append(seen_at_ms)
            theme_24h[item["theme"]].append(seen_at_ms)

    return (
        np.asarray(x_rows, dtype=np.float32),
        np.asarray(labels, dtype=np.int8),
        np.asarray(times, dtype=np.int64),
        np.asarray(mints, dtype=str),
    )


def split_masks(times: np.ndarray) -> dict[str, np.ndarray]:
    def timestamp(value: str) -> int:
        return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp() * 1000)

    start = timestamp("2026-05-12T00:00:00")  # Excludes four-day tracker warm-up.
    train_end = timestamp("2026-06-01T00:00:00")
    validation_end = timestamp("2026-06-06T00:00:00")
    test_end = timestamp("2026-06-10T00:00:00")  # Excludes partial final day.
    return {
        "train": (times >= start) & (times < train_end),
        "validation": (times >= train_end) & (times < validation_end),
        "test": (times >= validation_end) & (times < test_end),
    }


def balanced_weights(y: np.ndarray) -> np.ndarray:
    positives = max(1, int(y.sum()))
    negatives = max(1, len(y) - positives)
    return np.where(y == 1, len(y) / (2 * positives), len(y) / (2 * negatives))


def wilson(successes: int, trials: int, z: float = 1.959963984540054) -> list[float]:
    if trials <= 0:
        return [math.nan, math.nan]
    p = successes / trials
    denominator = 1 + z * z / trials
    centre = (p + z * z / (2 * trials)) / denominator
    margin = z * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator
    return [max(0.0, centre - margin), min(1.0, centre + margin)]


def ranking_metrics(y: np.ndarray, score: np.ndarray) -> dict[str, Any]:
    prevalence = float(y.mean())
    order = np.argsort(-score, kind="stable")
    result: dict[str, Any] = {
        "rows": int(len(y)),
        "positives": int(y.sum()),
        "prevalence": prevalence,
        "average_precision": float(average_precision_score(y, score)),
        "roc_auc": float(roc_auc_score(y, score)),
        "top": {},
    }
    for fraction in (0.001, 0.005, 0.01, 0.05):
        count = max(1, math.ceil(len(y) * fraction))
        positives = int(y[order[:count]].sum())
        precision = positives / count
        result["top"][f"{fraction:.3f}"] = {
            "rows": count,
            "positives": positives,
            "precision": precision,
            "precision_wilson_95": wilson(positives, count),
            "lift_over_test_prevalence": precision / prevalence if prevalence else math.nan,
            "recall": positives / int(y.sum()) if y.sum() else math.nan,
        }
    top100_count = min(100, len(y))
    top100_positives = int(y[order[:top100_count]].sum())
    result["top_100"] = {
        "rows": top100_count,
        "positives": top100_positives,
        "precision": top100_positives / top100_count,
        "lift_over_test_prevalence": (top100_positives / top100_count) / prevalence,
    }
    return result


def daily_stability(y: np.ndarray, score: np.ndarray, times: np.ndarray) -> list[dict[str, Any]]:
    days = np.asarray([utc_iso(int(value))[:10] for value in times])
    rows: list[dict[str, Any]] = []
    for day in sorted(set(days)):
        mask = days == day
        count = int(mask.sum())
        if count == 0:
            continue
        day_y = y[mask]
        day_score = score[mask]
        top_count = max(1, math.ceil(count * 0.01))
        selected = np.argsort(-day_score, kind="stable")[:top_count]
        precision = float(day_y[selected].mean())
        prevalence = float(day_y.mean())
        rows.append({
            "day": day,
            "rows": count,
            "positives": int(day_y.sum()),
            "prevalence": prevalence,
            "top_1pct_rows": top_count,
            "top_1pct_positives": int(day_y[selected].sum()),
            "top_1pct_precision": precision,
            "top_1pct_lift": precision / prevalence if prevalence else None,
        })
    return rows


def fit_logistic(x: np.ndarray, y: np.ndarray) -> Any:
    model = make_pipeline(
        SimpleImputer(strategy="median"),
        StandardScaler(),
        LogisticRegression(
            C=1.0,
            class_weight="balanced",
            max_iter=500,
            solver="lbfgs",
            random_state=20261003,
        ),
    )
    model.fit(x, y)
    return model


def fit_boosted(x: np.ndarray, y: np.ndarray, seed: int) -> HistGradientBoostingClassifier:
    model = HistGradientBoostingClassifier(
        learning_rate=0.06,
        max_iter=160,
        max_leaf_nodes=15,
        min_samples_leaf=100,
        l2_regularization=1.0,
        early_stopping=False,
        random_state=seed,
    )
    model.fit(x, y, sample_weight=balanced_weights(y))
    return model


def coefficient_table(model: Any, names: tuple[str, ...]) -> list[dict[str, Any]]:
    coefficients = model.named_steps["logisticregression"].coef_[0]
    order = np.argsort(-np.abs(coefficients))
    return [
        {"feature": names[index], "standardized_coefficient": float(coefficients[index])}
        for index in order
    ]


def write_report(output: Path, result: dict[str, Any]) -> None:
    best = result["models"]["engineered_boosted"]["test"]
    metadata_no_cap = result["models"]["metadata_no_market_cap_boosted"]["test"]
    no_cap = result["models"]["engineered_no_market_cap_boosted"]["test"]
    top = best["top"]["0.010"]
    no_cap_top = no_cap["top"]["0.010"]
    metadata_no_cap_top = metadata_no_cap["top"]["0.010"]
    daily = result["models"]["engineered_boosted"]["daily_test_top_1pct"]
    positive_days = sum(1 for row in daily if (row["top_1pct_lift"] or 0) > 1)
    lines = [
        "# RED-PUMP fast-graduation baseline",
        "",
        "## Verdict",
        "",
        (
            f"There is genuine out-of-time ranking signal for the source observer's confirmed "
            f"very-fast graduation event. The full model ranked the top 1% of the chronological test set at "
            f"{top['precision'] * 100:.3f}% confirmed fast graduation, versus "
            f"{best['prevalence'] * 100:.3f}% across the full test set "
            f"({top['lift_over_test_prevalence']:.2f}x lift)."
        ),
        "",
        (
            f"However, the first-observed market cap is overwhelmingly the strongest feature. "
            f"This means much of the headline result is imminent-threshold detection, not narrative edge."
        ),
        "",
        (
            f"After removing market cap, the engineered model's top 1% contained "
            f"{no_cap_top['positives']} of {no_cap_top['rows']} observed fast graduations "
            f"({no_cap_top['precision'] * 100:.3f}%; "
            f"95% Wilson interval {no_cap_top['precision_wilson_95'][0] * 100:.3f}%–"
            f"{no_cap_top['precision_wilson_95'][1] * 100:.3f}%), or "
            f"{no_cap_top['lift_over_test_prevalence']:.2f}x the test prevalence."
        ),
        "",
        (
            f"The comparable plain-metadata/no-market-cap model found "
            f"{metadata_no_cap_top['positives']} of {metadata_no_cap_top['rows']} "
            f"({metadata_no_cap_top['precision'] * 100:.3f}%). Engineered context improved average "
            f"precision from {metadata_no_cap['average_precision']:.6f} to {no_cap['average_precision']:.6f}, "
            f"but the top-1% confidence intervals overlap, so the incremental narrative/context edge is "
            f"suggestive rather than established."
        ),
        "",
        (
            f"Daily top-1% lift exceeded 1x on {positive_days} of {len(daily)} chronological test days."
        ),
        "",
        "## What this means",
        "",
        "This is evidence of ranking signal for the source observer's confirmed very-fast graduation event. "
        "It is not evidence of trading profitability, because the dataset contains no trade path, executable entry, exit, fees, or slippage.",
        "",
        "TIMEOUT rows are right-censored after observer visibility loss. They are used here only as the operational non-event class and must not be described as confirmed failures or 24-hour non-graduations.",
        "",
        "## Test design",
        "",
        f"- Train: {result['splits']['train']['start']} to {result['splits']['train']['end']} ({result['splits']['train']['rows']:,} rows).",
        f"- Validation: {result['splits']['validation']['start']} to {result['splits']['validation']['end']} ({result['splits']['validation']['rows']:,} rows).",
        f"- Test: {result['splits']['test']['start']} to {result['splits']['test']['end']} ({result['splits']['test']['rows']:,} rows).",
        "- The four-day tracker warm-up and the partial final day were excluded.",
        "- Every engineered context feature uses only launches observed strictly earlier than the current timestamp.",
        "",
        "## Candidate status",
        "",
        "The saved model is a research candidate only. It must not be surfaced as a live probability, alert, or trading instruction.",
        "The class-balanced model outputs are ranking scores and are not calibrated probabilities.",
        "This is one short chronological holdout with several reported model variants; replication on a later cohort is required before treating the result as stable.",
        "",
    ]
    (output / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    config = args()
    output = config.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    hashes = verify_sources(config.launches, config.outcomes, config.manifest)
    taxonomy_doc = json.loads(config.taxonomy.read_text(encoding="utf-8"))
    outcomes = load_outcomes(config.outcomes)
    launches = load_launches(config.launches)
    print(f"Loaded {len(launches):,} unique launches and {len(outcomes):,} outcome records", flush=True)
    x, y, times, mints = feature_rows(launches, outcomes, taxonomy_doc["themes"])
    print(f"Materialized {len(y):,} labelled operational rows with {int(y.sum()):,} positives", flush=True)
    masks = split_masks(times)
    for name, mask in masks.items():
        if not mask.any() or y[mask].sum() == 0:
            raise SystemExit(f"Split {name!r} is empty or contains no positive events")

    base_count = len(BASE_FEATURES)
    train = masks["train"]
    validation = masks["validation"]
    test = masks["test"]
    metadata_model = fit_logistic(x[train, :base_count], y[train])
    engineered_logistic = fit_logistic(x[train], y[train])
    boosted = fit_boosted(x[train], y[train], config.seed)

    metadata_boosted = fit_boosted(x[train, :base_count], y[train], config.seed)
    metadata_no_cap_boosted = fit_boosted(
        x[train, 1:base_count], y[train], config.seed
    )
    no_cap_features = ENGINEERED_FEATURES[1:]
    engineered_no_cap_logistic = fit_logistic(x[train, 1:], y[train])
    engineered_no_cap_boosted = fit_boosted(x[train, 1:], y[train], config.seed)
    models = {
        "metadata_logistic": (metadata_model, x[:, :base_count], BASE_FEATURES),
        "metadata_boosted": (metadata_boosted, x[:, :base_count], BASE_FEATURES),
        "metadata_no_market_cap_boosted": (
            metadata_no_cap_boosted, x[:, 1:base_count], BASE_FEATURES[1:],
        ),
        "engineered_logistic": (engineered_logistic, x, ENGINEERED_FEATURES),
        "engineered_boosted": (boosted, x, ENGINEERED_FEATURES),
        "engineered_no_market_cap_logistic": (
            engineered_no_cap_logistic, x[:, 1:], no_cap_features,
        ),
        "engineered_no_market_cap_boosted": (
            engineered_no_cap_boosted, x[:, 1:], no_cap_features,
        ),
    }
    model_results: dict[str, Any] = {}
    test_scores: dict[str, np.ndarray] = {}
    for name, (model, matrix, feature_names) in models.items():
        val_score = model.predict_proba(matrix[validation])[:, 1]
        test_score = model.predict_proba(matrix[test])[:, 1]
        test_scores[name] = test_score
        model_results[name] = {
            "feature_count": len(feature_names),
            "validation": ranking_metrics(y[validation], val_score),
            "test": ranking_metrics(y[test], test_score),
            "daily_test_top_1pct": daily_stability(y[test], test_score, times[test]),
        }
        if name.endswith("logistic"):
            model_results[name]["standardized_coefficients"] = coefficient_table(model, feature_names)
        if name in {
            "metadata_boosted",
            "engineered_boosted",
            "engineered_no_market_cap_boosted",
        }:
            rng = np.random.default_rng(config.seed)
            test_rows = np.flatnonzero(test)
            sample_rows = rng.choice(
                test_rows, size=min(50_000, len(test_rows)), replace=False
            )
            importance = permutation_importance(
                model,
                matrix[sample_rows],
                y[sample_rows],
                scoring="average_precision",
                n_repeats=3,
                random_state=config.seed,
            )
            importance_order = np.argsort(-importance.importances_mean)
            model_results[name]["permutation_importance_average_precision"] = [
                {
                    "feature": feature_names[index],
                    "mean_ap_drop": float(importance.importances_mean[index]),
                    "std_ap_drop": float(importance.importances_std[index]),
                }
                for index in importance_order
            ]
    cap_validation = ranking_metrics(y[validation], x[validation, 0])
    cap_test = ranking_metrics(y[test], x[test, 0])
    model_results["market_cap_rank_only"] = {
        "feature_count": 1,
        "validation": cap_validation,
        "test": cap_test,
        "daily_test_top_1pct": daily_stability(y[test], x[test, 0], times[test]),
    }

    def split_summary(mask: np.ndarray) -> dict[str, Any]:
        split_times = times[mask]
        return {
            "start": utc_iso(int(split_times.min())),
            "end": utc_iso(int(split_times.max())),
            "rows": int(mask.sum()),
            "positives": int(y[mask].sum()),
            "prevalence": float(y[mask].mean()),
        }

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": DATASET_VERSION,
        "feature_version": FEATURE_VERSION,
        "source_hashes": hashes,
        "unique_launches": len(launches),
        "operational_labelled_rows": int(len(y)),
        "confirmed_fast_graduations": int(y.sum()),
        "label_warning": (
            "TIMEOUT is right-censored after visibility loss. The target is confirmed fast graduation "
            "under the source observer, not true failure, 24-hour graduation, or profit."
        ),
        "splits": {name: split_summary(mask) for name, mask in masks.items()},
        "models": model_results,
    }

    best_score = test_scores["engineered_boosted"]
    test_indices = np.flatnonzero(test)
    ranked = np.argsort(-best_score, kind="stable")[:100]
    with (output / "test_top_100.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(("rank", "mint", "seen_at_utc", "score", "confirmed_fast_graduation"))
        for rank, local_index in enumerate(ranked, start=1):
            global_index = test_indices[local_index]
            writer.writerow((
                rank,
                mints[global_index],
                utc_iso(int(times[global_index])),
                f"{best_score[local_index]:.10f}",
                int(y[global_index]),
            ))

    (output / "results.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    with (output / "candidate_engineered_boosted.pkl").open("wb") as handle:
        pickle.dump({
            "status": "candidate_research_only",
            "dataset": DATASET_VERSION,
            "feature_version": FEATURE_VERSION,
            "feature_names": ENGINEERED_FEATURES,
            "model": boosted,
        }, handle, protocol=pickle.HIGHEST_PROTOCOL)
    with (output / "candidate_engineered_no_market_cap_boosted.pkl").open("wb") as handle:
        pickle.dump({
            "status": "candidate_research_only",
            "dataset": DATASET_VERSION,
            "feature_version": FEATURE_VERSION,
            "feature_names": no_cap_features,
            "model": engineered_no_cap_boosted,
        }, handle, protocol=pickle.HIGHEST_PROTOCOL)
    write_report(output, result)
    print(json.dumps({
        "output": str(output),
        "test": model_results["engineered_boosted"]["test"],
    }, indent=2))


if __name__ == "__main__":
    main()
