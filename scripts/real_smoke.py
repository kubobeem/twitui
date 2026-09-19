#!/usr/bin/env python3
"""Real-mode smoke test: initialize with saved cookies, fetch profile +
timelines (For You / Following). Cookie values are never printed."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # twitui/
BRIDGE = ROOT / "python" / "twitui_bridge.py"
ENV_FILE = Path.home() / ".config" / "twikit-tui" / ".env"
VENV_PY = Path.home() / ".config" / "twikit-tui" / "venv" / (
    "Scripts/python.exe" if os.name == "nt" else "bin/python"
)


def load_env_cookies() -> dict[str, str]:
    text = ENV_FILE.read_text(encoding="utf-8")
    return {
        "AUTH_TOKEN": re.search(r"AUTH_TOKEN=(.+)", text).group(1).strip(),
        "CT0": re.search(r"CT0=(.+)", text).group(1).strip(),
    }


class Rpc:
    def __init__(self) -> None:
        self.p = subprocess.Popen(
            [str(VENV_PY), "-X", "utf8", str(BRIDGE)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8",
        )
        self.i = 0

    def call(self, method: str, **params):
        self.i += 1
        req = {"jsonrpc": "2.0", "id": self.i, "method": method, "params": params}
        self.p.stdin.write(json.dumps(req) + "\n")
        self.p.stdin.flush()
        line = self.p.stdout.readline()
        while line and not line.strip().startswith("{"):
            line = self.p.stdout.readline()
        if not line:
            raise RuntimeError("no response from bridge")
        resp = json.loads(line)
        if "error" in resp:
            raise RuntimeError(f"{method} ERROR: {json.dumps(resp['error'], ensure_ascii=False)[:300]}")
        return resp["result"]

    def close(self):
        try:
            self.call("shutdown")
        except Exception:
            pass
        self.p.kill()


def head(t: dict) -> str:
    text = (t.get("text") or "").replace("\n", " ")[:60]
    u = (t.get("user") or {}).get("screen_name", "?")
    return f"@{u}: {text}"


def main() -> None:
    cookies = load_env_cookies()
    print(f"cookies loaded (auth_token {len(cookies['AUTH_TOKEN'])} chars, ct0 {len(cookies['CT0'])} chars)")
    rpc = Rpc()
    try:
        init = rpc.call("initialize", fake=False, cookies=cookies, lang="ja")
        user = init.get("user") or {}
        print(f"MODE={init.get('mode')}  logged in as @{user.get('screen_name')} ({user.get('name')})")
        print(f"  followers={user.get('followers_count')} following={user.get('friends_count')} tweets={user.get('statuses_count')}")

        fy = rpc.call("home_foryou")
        items = fy.get("items") or []
        print(f"\n[For You] {len(items)} tweets (nextCursor={'yes' if fy.get('nextCursor') else 'no'})")
        for t in items[:5]:
            print("  -", head(t))

        fl = rpc.call("home_latest")
        items = fl.get("items") or []
        print(f"\n[Following] {len(items)} tweets (nextCursor={'yes' if fl.get('nextCursor') else 'no'})")
        for t in items[:5]:
            print("  -", head(t))

        print("\nREAL-MODE TIMELINE OK")
    finally:
        rpc.close()


if __name__ == "__main__":
    sys.exit(main())
