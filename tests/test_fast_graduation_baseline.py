from __future__ import annotations

import importlib.util
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location(
    "train_fast_graduation_baseline",
    SCRIPTS / "train_fast_graduation_baseline.py",
)
assert SPEC and SPEC.loader
BASELINE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASELINE)


class FastGraduationBaselineTests(unittest.TestCase):
    def test_wilson_contains_observed_precision(self) -> None:
        low, high = BASELINE.wilson(40, 990)
        self.assertLess(low, 40 / 990)
        self.assertGreater(high, 40 / 990)

    def test_ranking_metrics_put_highest_scores_first(self) -> None:
        labels = np.array([0, 1, 0, 1, 0], dtype=np.int8)
        scores = np.array([0.1, 0.9, 0.2, 0.8, 0.3])
        result = BASELINE.ranking_metrics(labels, scores)
        self.assertEqual(result["top"]["0.050"]["rows"], 1)
        self.assertEqual(result["top"]["0.050"]["positives"], 1)

    def test_split_masks_are_disjoint_and_chronological(self) -> None:
        timestamps = np.array([
            int(datetime(2026, 5, 11, tzinfo=timezone.utc).timestamp() * 1000),
            int(datetime(2026, 5, 12, tzinfo=timezone.utc).timestamp() * 1000),
            int(datetime(2026, 6, 1, tzinfo=timezone.utc).timestamp() * 1000),
            int(datetime(2026, 6, 6, tzinfo=timezone.utc).timestamp() * 1000),
            int(datetime(2026, 6, 10, tzinfo=timezone.utc).timestamp() * 1000),
        ])
        masks = BASELINE.split_masks(timestamps)
        stacked = np.stack(list(masks.values()))
        self.assertTrue(np.all(stacked.sum(axis=0) <= 1))
        self.assertEqual([int(mask.sum()) for mask in masks.values()], [1, 1, 1])


if __name__ == "__main__":
    unittest.main()
