"""Manual opt-in probe; only safe metadata is printed."""

import argparse
import json

from collector.vnstock_adapter import AdapterError, collect, summarize


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Manually collect bounded KBS candles in memory; print metadata only.")
    parser.add_argument("--enable-vnstock", action="store_true", help="explicitly authorize a provider call")
    parser.add_argument("--symbol", required=True, choices=["FPT", "VNINDEX"])
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=45)
    args = parser.parse_args(argv)
    try:
        if not args.enable_vnstock:
            raise AdapterError("provider_opt_in_required")
        document, metadata = collect(args.symbol, args.start, args.end, timeout_seconds=args.timeout_seconds)
    except AdapterError as error:
        print(json.dumps({"status": "failure", "provider": "KBS", "errorCode": error.code, **error.metadata}))
        return 1
    print(json.dumps(summarize(document, metadata), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
