"""Manual opt-in single-date EOD command; output is metadata only."""

import argparse
import json

from collector.eod_runner import EodError, run


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Explicit single-date local EOD collection; metadata only.")
    parser.add_argument("--enable-eod", action="store_true")
    parser.add_argument("--target-date", required=True, help="one explicit YYYY-MM-DD calendar date")
    parser.add_argument("--submit", action="store_true")
    parser.add_argument("--poll-seconds", type=int, default=None)
    parser.add_argument("--delivery-retries", type=int, default=None, help="0 or 1 extra transport attempt; requires --submit")
    args = parser.parse_args(argv)
    try:
        result = run(enable_eod=args.enable_eod, target_date=args.target_date, submit_enabled=args.submit,
                     poll_seconds=args.poll_seconds, delivery_retries=args.delivery_retries)
    except EodError as error:
        result = {"status": "failed", "provider": "KBS", "errorCode": error.code}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["status"] in {"collected", "persisted"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
