#!/usr/bin/env python3
"""
Stub LNbits, standing in for the real node during settlement tests.

It implements only GET /api/v1/payments/{checking_id} — the endpoint
_shared/lnbits.ts treats as the authority on whether an invoice settled.

The verdict is controlled by a file rather than a flag so a single running
stub can be flipped between unpaid and paid mid-test:

    supabase/tests/.stub_verdict   ->  "unpaid" (default) | "paid"

Every request is appended to supabase/tests/.stub_requests.log, which is what
proves the webhook actually consulted this endpoint instead of trusting the
payload it was handed.
"""

import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
VERDICT_FILE = os.path.join(HERE, ".stub_verdict")
REQUEST_LOG = os.path.join(HERE, ".stub_requests.log")

# Must match the fixture's amount_sats so a "paid" verdict passes the
# amount cross-check in isSettled() rather than failing for the wrong reason.
AMOUNT_SATS = 2500


def verdict() -> str:
    try:
        with open(VERDICT_FILE) as fh:
            return fh.read().strip() or "unpaid"
    except FileNotFoundError:
        return "unpaid"


def log(line: str) -> None:
    stamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    with open(REQUEST_LOG, "a") as fh:
        fh.write(f"{stamp}  {line}\n")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path
        prefix = "/api/v1/payments/"

        if not path.startswith(prefix):
            log("Unrecognised request -> 404")
            self.send_error(404, "Not found")
            return

        checking_id = unquote(path[len(prefix):])
        current = verdict()

        if current == "paid":
            body = {
                "paid": True,
                "details": {
                    "checking_id": checking_id,
                    "amount": AMOUNT_SATS,
                    "fee": 0,
                    "status": "success",
                    "time": int(datetime.now(timezone.utc).timestamp()),
                },
            }
        else:
            body = {
                "paid": False,
                "details": {
                    "checking_id": checking_id,
                    "amount": AMOUNT_SATS,
                    "fee": 0,
                    "status": "pending",
                    "time": int(datetime.now(timezone.utc).timestamp()),
                },
            }

        log(f"Payment status lookup -> paid={body['paid']}")

        payload = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):  # silence default stderr noise
        pass


if __name__ == "__main__":
    port = int(os.environ.get("STUB_PORT", "9777"))
    host = os.environ.get("STUB_HOST", "127.0.0.1")
    print(f"stub LNbits listening on {host}:{port}", flush=True)
    HTTPServer((host, port), Handler).serve_forever()
