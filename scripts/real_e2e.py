#!/usr/bin/env python3
"""Real-mode E2E test: initialize with saved cookies, like a timeline tweet,
create a test tweet, and verify both via RPC. Nothing is deleted (per user).
Cookie values are never printed."""
import json
import os
import re
import subprocess
import sys
import time
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


def main() -> int:
    cookies = load_env_cookies()
    print(f"cookies loaded (auth_token {len(cookies['AUTH_TOKEN'])} chars, ct0 {len(cookies['CT0'])} chars)")
    rpc = Rpc()
    failures = []
    try:
        init = rpc.call("initialize", fake=False, cookies=cookies, lang="ja")
        user = init.get("user") or {}
        print(f"logged in as @{user.get('screen_name')}")

        # --- 1) like a tweet from For You ---
        fy = rpc.call("home_foryou")
        items = fy.get("items") or []
        target = next((t for t in items if t.get("id")), None)
        if not target:
            failures.append("no timeline tweet to like")
        else:
            tid = target["id"]
            like = rpc.call("tweet_like", tweet_id=tid)
            print(f"LIKE    tweet_like({tid}) -> {like}")
            detail = rpc.call("tweet_detail", tweet_id=tid)
            print(f"LIKE    detail: favorite_count={detail.get('favorite_count')} "
                  f"(text: {(detail.get('text') or '')[:40]!r})")
            if not detail.get("id"):
                failures.append("tweet_detail returned no id after like")

        # --- 2) create a test tweet (kept, not deleted) ---
        text = f"twitui real-mode E2E test {time.strftime('%Y-%m-%d %H:%M:%S')} (自動テスト投稿です)"
        created = rpc.call("create_tweet", text=text)
        new_id = created.get("id")
        print(f"POST    create_tweet -> id={new_id} text={created.get('text', '')[:50]!r}")
        if not new_id:
            failures.append("create_tweet returned no id")
        else:
            detail = rpc.call("tweet_detail", tweet_id=new_id)
            print(f"POST    verify: id={detail.get('id')} user=@{(detail.get('user') or {}).get('screen_name')}")
            if str(detail.get("id")) != str(new_id):
                failures.append(f"tweet_detail id mismatch: {detail.get('id')} != {new_id}")

        # --- 3) verify tweet shows up in own profile timeline ---
        uid = user.get("id")
        if uid:
            ut = rpc.call("user_tweets", user_id=uid, tab="Tweets")
            found = any(str(t.get("id")) == str(new_id) for t in (ut.get("items") or []))
            print(f"POST    profile timeline contains new tweet: {found}")
            if not found:
                failures.append("new tweet not found in own profile timeline")

        if failures:
            print("\nFAILURES:")
            for f in failures:
                print("  -", f)
            return 1
        print("\nREAL-MODE E2E OK (like + post verified, nothing deleted)")
        return 0
    finally:
        rpc.close()


if __name__ == "__main__":
    sys.exit(main())
