from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from scripts.validate_market_data import validate_market_data


def read_fixture(path: Path) -> dict:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot read fixture: {error}") from error
    errors = validate_market_data(document, fixture_only=True)
    if errors:
        raise ValueError("Fixture validation failed:\n" + "\n".join(f"- {error}" for error in errors))
    return document


def summarize(document: dict, path: Path) -> dict:
    providers = sorted({
        row["source"]["provider"]
        for group in ("candles", "quotes", "indexObservations")
        for row in document[group]
    })
    return {
        "fixture": path.as_posix(),
        "dataset": document["dataset"]["label"],
        "mode": document["dataset"]["mode"],
        "freshness": document["dataset"]["freshness"],
        "providers": providers,
        "recordCounts": {
            "assets": len(document["assets"]),
            "candles": len(document["candles"]),
            "quotes": len(document["quotes"]),
            "indexObservations": len(document["indexObservations"]),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and summarize the synthetic market fixture.")
    parser.add_argument("fixture", type=Path, help="path to a contract-v1 fixture JSON file")
    args = parser.parse_args(argv)
    try:
        document = read_fixture(args.fixture)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(summarize(document, args.fixture), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
