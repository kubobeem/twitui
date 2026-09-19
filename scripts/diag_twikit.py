#!/usr/bin/env python3
"""Diagnose which twifork endpoints actually work with the saved cookies."""
import json
import re
from pathlib import Path

from twikit.client.client import Client

ENV = Path.home() / ".config" / "twikit-tui" / ".env"
text = ENV.read_text(encoding="utf-8")
at = re.search(r"AUTH_TOKEN=(.+)", text).group(1).strip()
ct0 = re.search(r"CT0=(.+)", text).group(1).strip()

c = Client("ja", impersonate="chrome124")
c.set_cookies({"auth_token": at, "ct0": ct0})
print("is_logged_in:", c.is_logged_in())

print("\n== get_user_by_screen_name (jack) ==")
try:
    u = c.get_user_by_screen_name("jack")
    print("OK:", u.screen_name, "followers:", u.followers_count)
except Exception as e:
    print("FAIL:", type(e).__name__, str(e)[:200])

print("\n== get_timeline (For You) ==")
try:
    res = c.get_timeline()
    tw = getattr(res, "tweets", None) or []
    print("type:", type(res).__name__, "| tweets:", len(tw), "| next_cursor:", getattr(res, "next_cursor", None))
    if tw:
        t = tw[0]
        print("first:", getattr(t.user, "screen_name", "?"), ":", (t.text or "")[:50])
except Exception as e:
    print("FAIL:", type(e).__name__, str(e)[:200])

print("\n== get_latest_timeline (Following) ==")
try:
    res = c.get_latest_timeline()
    tw = getattr(res, "tweets", None) or []
    print("tweets:", len(tw))
except Exception as e:
    print("FAIL:", type(e).__name__, str(e)[:200])

print("\n== search_tweet ('hello', Latest) ==")
try:
    res = c.search_tweet("hello", "Latest")
    tw = list(res or [])
    print("tweets:", len(tw))
    if tw:
        print("first:", getattr(tw[0].user, "screen_name", "?"), ":", (tw[0].text or "")[:50])
except Exception as e:
    print("FAIL:", type(e).__name__, str(e)[:200])
