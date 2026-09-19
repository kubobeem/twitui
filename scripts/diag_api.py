#!/usr/bin/env python3
"""Dump Client API surface + raw get_timeline object inspection."""
import asyncio
import re
from pathlib import Path

import twikit
from twikit.client.client import Client

ENV = Path.home() / ".config" / "twikit-tui" / ".env"
text = ENV.read_text(encoding="utf-8")
at = re.search(r"AUTH_TOKEN=(.+)", text).group(1).strip()
ct0 = re.search(r"CT0=(.+)", text).group(1).strip()

print("twikit module:", twikit.__file__)
print("\n== Client public methods ==")
for n in sorted(dir(Client)):
    if n.startswith("_"):
        continue
    a = getattr(Client, n, None)
    if callable(a):
        print(" ", n)

c = Client("ja", impersonate="chrome124")
c.set_cookies({"auth_token": at, "ct0": ct0})


async def main() -> None:
    print("\n== c.user before ==")
    print(repr(getattr(c, "user", "<no attr>")))

    print("\n== get_timeline raw ==")
    res = await c.get_timeline()
    print("type:", type(res).__name__)
    pub = [a for a in dir(res) if not a.startswith("_")]
    print("attrs:", pub[:25])
    tws = getattr(res, "tweets", None)
    print("tweets:", type(tws).__name__, "len:", len(tws) if tws is not None else None)
    if tws:
        t0 = tws[0]
        print("tweet0:", type(t0).__name__)
        d = getattr(t0, "data", None)
        if isinstance(d, dict):
            print("data keys:", sorted(d.keys()))
        print("repr:", repr(t0)[:300])
    print("next_cursor:", repr(getattr(res, "next_cursor", None)))

    try:
        await c.http.aclose()
    except Exception:
        pass

asyncio.run(main())
