from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "fixtures" / "market" / "mp-02-synthetic.json"


class CollectorCliTests(unittest.TestCase):
    def run_cli(self, fixture: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-m", "collector.cli", str(fixture)],
            cwd=ROOT,
            env={**os.environ, "PYTHONPATH": f"{ROOT / 'services' / 'collector'}{os.pathsep}{ROOT}"},
            capture_output=True,
            text=True,
            check=False,
        )

    def test_valid_fixture_reports_source_and_record_counts(self):
        result = self.run_cli(FIXTURE)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["mode"], "fixture")
        self.assertEqual(report["providers"], ["marketpulse-fixture"])
        self.assertEqual(report["recordCounts"], {
            "assets": 11,
            "candles": 33,
            "quotes": 10,
            "indexObservations": 1,
        })

    def test_invalid_fixture_fails_with_validation_detail(self):
        document = json.loads(FIXTURE.read_text(encoding="utf-8"))
        document["candles"][0]["close"] = -1
        with tempfile.TemporaryDirectory() as folder:
            invalid = Path(folder) / "invalid.json"
            invalid.write_text(json.dumps(document), encoding="utf-8")
            result = self.run_cli(invalid)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Fixture validation failed", result.stderr)
        self.assertIn("minimum of 0", result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
