"""Manual opt-in probe; only safe metadata is printed."""

import argparse
import json

from collector.vnstock_adapter import AdapterError, collect, summarize, validate_request
from collector.transport import submit, validate_submission_options


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Manually collect bounded KBS candles in memory; print metadata only.")
    parser.add_argument("--enable-vnstock", action="store_true", help="explicitly authorize a provider call")
    parser.add_argument("--symbol", required=True, choices=["FPT", "VNINDEX"])
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=45)
    parser.add_argument("--submit", action="store_true", help="submit the normalized observed document to the internal API")
    parser.add_argument("--delivery-id", help="bounded idempotency key; default is observed-<payload digest>")
    parser.add_argument("--poll-seconds", type=int, default=None, help="wait up to 0–60 seconds for terminal status")
    args = parser.parse_args(argv)
    try:
        if not args.enable_vnstock:
            raise AdapterError("provider_opt_in_required")
        validate_request(args.symbol, args.start, args.end)
        if not 1 <= args.timeout_seconds <= 60:
            raise AdapterError("invalid_timeout")
        if not args.submit and (args.delivery_id is not None or args.poll_seconds is not None):
            raise AdapterError("submit_required")
        if args.submit:
            try:
                validate_submission_options(args.delivery_id, args.poll_seconds or 0)
            except ValueError:
                raise AdapterError("invalid_submission_configuration") from None
        document, metadata = collect(args.symbol, args.start, args.end, timeout_seconds=args.timeout_seconds)
        if args.submit:
            try:
                receipt = submit(document, args.delivery_id, args.poll_seconds or 0)
            except ValueError:
                raise AdapterError("submission_failed") from None
            print(json.dumps({**summarize(document, metadata), "delivery": receipt}, ensure_ascii=False))
            return 1 if receipt["status"] == "failure" else 0
    except AdapterError as error:
        print(json.dumps({"status": "failure", "provider": "KBS", "errorCode": error.code, **error.metadata}))
        return 1
    print(json.dumps(summarize(document, metadata), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
