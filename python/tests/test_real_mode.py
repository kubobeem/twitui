#!/usr/bin/env python3
"""Real-mode integration test: boots the bridge with the actual venv python
and verifies the twifork path is reached (auth validation without cookies)."""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # -> python/
BRIDGE = ROOT / "twitui_bridge.py"
VENV_PY = Path.home() / ".config" / "twikit-tui" / "venv" / (
    "Scripts/python.exe" if os.name == "nt" else "bin/python"
)


def main() -> None:
    if not VENV_PY.exists():
        print("SKIP: venv not found (run uv venv first)")
        return

    p = subprocess.Popen(
        [str(VENV_PY), "-X", "utf8", str(BRIDGE)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8",
    )
    try:
        req = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"fake": False, "cookies": {}}}
        p.stdin.write(json.dumps(req) + "\n")
        p.stdin.flush()
        line = p.stdout.readline()
        while line and not line.strip().startswith("{"):
            line = p.stdout.readline()
        resp = json.loads(line)
        print("initialize response:", json.dumps(resp)[:200])
        err = resp.get("error")
        assert err is not None, "expected error without cookies"
        kind = (err.get("data") or {}).get("kind")
        assert kind == "auth", f"expected kind=auth, got {kind}"
        print("REAL-MODE INTEGRATION OK (twifork path reached, auth validation works)")
    finally:
        p.kill()


if __name__ == "__main__":
    sys.exit(main())
