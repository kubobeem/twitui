#!/usr/bin/env python3
"""Unit tests for twitui_bridge (fake mode, no network)."""
import base64
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "twitui_bridge.py"


class FakeBridge:
    """Runs the bridge as a subprocess in fake mode and speaks JSON-RPC."""

    def __init__(self, fake_env: bool = True):
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        if fake_env:
            env["TWITUI_FAKE"] = "1"
        else:
            env.pop("TWITUI_FAKE", None)
        self.proc = subprocess.Popen(
            [sys.executable, "-X", "utf8", str(SCRIPT)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=env, text=True, encoding="utf-8",
        )
        self._id = 0

    def request(self, method, **params):
        self._id += 1
        req = json.dumps({"jsonrpc": "2.0", "id": self._id, "method": method, "params": params})
        self.proc.stdin.write(req + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        assert line, f"no response (stderr: {self.proc.stderr.read()})"
        msg = json.loads(line)
        if "error" in msg:
            raise BridgeError(msg["error"])
        return msg["result"]

    def close(self):
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        self.proc.wait(timeout=5)


class BridgeError(Exception):
    def __init__(self, error):
        super().__init__(error.get("message", ""))
        self.code = error.get("code")
        self.kind = (error.get("data") or {}).get("kind")


class TestBridge(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bridge = FakeBridge()
        res = cls.bridge.request("initialize", fake=True)
        assert res["mode"] == "fake"

    @classmethod
    def tearDownClass(cls):
        cls.bridge.close()

    def test_ping(self):
        res = self.bridge.request("ping")
        self.assertTrue(res["pong"])
        self.assertEqual(res["mode"], "fake")

    def test_home_latest_shape(self):
        page = self.bridge.request("home/latest")
        self.assertIn("items", page)
        self.assertGreater(len(page["items"]), 0)
        tweet = page["items"][0]
        for key in ("id", "text", "user", "created_at", "favorite_count", "liked"):
            self.assertIn(key, tweet)
        self.assertIn("screen_name", tweet["user"])

    def test_cursor_roundtrip(self):
        cur = base64.b64encode(b"3").decode()
        page = self.bridge.request("home/latest", cursor=cur)
        self.assertEqual(page["items"][0]["id"], "t1003")

    def test_create_and_delete(self):
        created = self.bridge.request("tweet/create", text="unit test tweet")
        self.assertEqual(created["text"], "unit test tweet")
        detail = self.bridge.request("tweet/detail", tweet_id=created["id"])
        self.assertEqual(detail["id"], created["id"])
        deleted = self.bridge.request("tweet/delete", tweet_id=created["id"])
        self.assertTrue(deleted["deleted"])
        with self.assertRaises(BridgeError) as ctx:
            self.bridge.request("tweet/detail", tweet_id=created["id"])
        self.assertEqual(ctx.exception.kind, "not_found")

    def test_tweet_length_limit(self):
        with self.assertRaises(BridgeError) as ctx:
            self.bridge.request("tweet/create", text="a" * 281)
        self.assertEqual(ctx.exception.code, -32602)
        with self.assertRaises(BridgeError):
            self.bridge.request("tweet/create", text="")

    def test_reply_increments_count(self):
        parent_id = "t1004"  # reply_count starts at 4
        before = self.bridge.request("tweet/detail", tweet_id=parent_id)
        self.bridge.request("tweet/create", text="a reply", reply_to=parent_id)
        after = self.bridge.request("tweet/detail", tweet_id=parent_id)
        self.assertEqual(after["reply_count"], before["reply_count"] + 1)

    def test_like_toggle(self):
        self.assertTrue(self.bridge.request("tweet/like", tweet_id="t1002")["liked"])
        page = self.bridge.request("home/latest")
        target = next(t for t in page["items"] if t["id"] == "t1002")
        self.assertTrue(target["liked"])
        self.assertFalse(self.bridge.request("tweet/unlike", tweet_id="t1002")["liked"])

    def test_bookmarks_flow(self):
        self.assertTrue(self.bridge.request("tweet/bookmark", tweet_id="t1005")["bookmarked"])
        bm = self.bridge.request("bookmarks/list")
        ids = {t["id"] for t in bm["items"]}
        self.assertIn("t1005", ids)
        self.assertIn("t1000", ids)  # pre-seeded
        self.bridge.request("tweet/unbookmark", tweet_id="t1005")

    def test_search(self):
        res = self.bridge.request("tweet/search", q="twitui", mode="Top")
        self.assertGreater(len(res["items"]), 0)
        res2 = self.bridge.request("tweet/search", q="shin", mode="Latest")
        self.assertGreater(len(res2["items"]), 0)

    def test_user_detail_and_tweets(self):
        user = self.bridge.request("user/detail", screen_name="@shin")
        self.assertEqual(user["id"], "1001")
        page = self.bridge.request("user/tweets", user_id="1001", tab="Tweets")
        self.assertTrue(all(t["user"]["id"] == "1001" for t in page["items"]))
        with self.assertRaises(BridgeError) as ctx:
            self.bridge.request("user/detail", screen_name="nonexistent_user_xyz")
        self.assertEqual(ctx.exception.kind, "not_found")

    def test_dm_flow(self):
        convs = self.bridge.request("dm/list")
        self.assertEqual(len(convs), 1)
        self.assertEqual(convs[0]["user"]["screen_name"], "tui_fan")
        msgs = self.bridge.request("dm/messages", user_id="1002")
        self.assertGreaterEqual(len(msgs["items"]), 3)
        sent = self.bridge.request("dm/send", user_id="1002", text="hello bridge")
        self.assertEqual(sent["text"], "hello bridge")
        msgs2 = self.bridge.request("dm/messages", user_id="1002")
        self.assertEqual(msgs2["items"][-1]["text"], "hello bridge")

    def test_trends(self):
        trends = self.bridge.request("trends")
        self.assertEqual([t["name"] for t in trends][0], "#TUI")

    def test_spaces(self):
        spaces = self.bridge.request("spaces/list")
        self.assertEqual(len(spaces), 2)
        detail = self.bridge.request("spaces/get", space_id="sp1")
        self.assertIn("chat", detail)
        with self.assertRaises(BridgeError):
            self.bridge.request("spaces/get", space_id="nope")

    def test_unknown_method(self):
        with self.assertRaises(BridgeError) as ctx:
            self.bridge.request("totally/unknown")
        self.assertEqual(ctx.exception.code, -32601)

    def test_session_error_kind(self):
        # classify_exception maps auth-ish messages to session_expired
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        import twitui_bridge as b  # noqa: PLC0415
        self.assertEqual(b.classify_exception(Exception("401 Unauthorized")), "session_expired")
        self.assertEqual(b.classify_exception(Exception("Rate limit exceeded (429)")), "rate_limited")
        self.assertEqual(b.classify_exception(Exception("403 Forbidden")), "forbidden")
        self.assertEqual(b.classify_exception(Exception("404 Not Found")), "not_found")
        self.assertEqual(b.classify_exception(Exception("weird failure")), "upstream")


class TestRealModeValidation(unittest.TestCase):
    def test_initialize_requires_cookies(self):
        # no TWITUI_FAKE env: real mode with empty cookies must fail with -32602
        bridge = FakeBridge(fake_env=False)
        try:
            with self.assertRaises(BridgeError) as ctx:
                bridge.request("initialize", fake=False, cookies={})
            self.assertEqual(ctx.exception.code, -32602)
            self.assertEqual(ctx.exception.kind, "auth")
        finally:
            bridge.proc.kill()


if __name__ == "__main__":
    unittest.main()
