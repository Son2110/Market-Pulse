"""Synthetic provider boundary for the real EOD runner and HTTP transport."""

import json
import sys
from unittest.mock import patch

from collector import eod_runner
from collector.vnstock_adapter import normalize_rows


TARGET = "2026-10-30"
COLLECTED = "2026-10-30T10:00:00.123456+00:00"
calls = []
documents = []


def collect(symbol, start, end, *, timeout_seconds):
    calls.append({"symbol": symbol, "start": start, "end": end, "timeoutSeconds": timeout_seconds})
    assert [call["symbol"] for call in calls] == ["FPT", "VNINDEX"][:len(calls)]
    assert start == end == TARGET and timeout_seconds == 45
    values = (["120000.123456789", "150000.987654321", "100000.000000001", "130000.555555555"]
              if symbol == "FPT" else ["1200.123456789", "1500.987654321", "1000.000000001", "1300.555555555"])
    row = {"t": TARGET + " 07:00", **dict(zip(("o", "h", "l", "c"), values))}
    document = normalize_rows([row], symbol, start, end, COLLECTED)
    documents.append(document)
    return document, {}


with patch.object(eod_runner, "collect", side_effect=collect):
    result = eod_runner.run(enable_eod=True, target_date=TARGET, submit_enabled=True,
                            poll_seconds=int(sys.argv[1]), delivery_retries=int(sys.argv[2]))
print(json.dumps({"result": result, "calls": calls, "documents": documents}))
