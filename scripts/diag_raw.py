#!/usr/bin/env python3
"""Raw diag: inspect actual twifork objects returned for saved cookies."""
import asyncio
import inspect
import re
from pathlib import Path

from twikit.client.client import Client

ENV = Path.home() / ".config" / "twikit-tui" / ".env"
text = ENV.read_text(encoding="utf-8")
at = re.search(r"AUTH_TOKEN=(.+)", text).group(1).strip()
ct0 = re.search(r"CT0=(.+)", text).group(1).strip()


async def main() -> None:
    c = Client("ja", impersonate="chrome124")
    c.set_cookies({"auth_token": at, "ct0": ct0})

    print("== is_logged_in ==")
    print(await c.is_logged_in())

    print("\n== me() / user ==")
    me = await c.me()
    print("me():", me)
    print("c.user:", c.user)

    print("\n== get_timeline raw ==")
    res = await c.get_timeline()
    print("type:", type(res).__name__)
    print("dir:", [a for a in dir(res) if not a.startswith("_")][:20])
    tws = getattr(res, "tweets", None)
    print("tweets attr:", type(tws).__name__, "len:", len(tws) if tws is not None else None)
    if tws:
        t0 = tws[0]
        print("tweet0 type:", type(t0).__name__)
        print("tweet0 dir:", [a for a in dir(t0) if not a.startswith("_")][:30])
        d = t0.data if hasattr(t0, "data") else None
        print("tweet0.data keys:", list(d.keys())[:40] if isinstance(d, dict) else type(d).__name__)
        if isinstance(d, dict):
            print("tweet0 legacy keys:", {k: str(v)[:40] for k, v in d.items() if k in ("full_text", "text", "id_str")})
    print("next_cursor:", getattr(res, "next_cursor", None))

    print("\n== get_user_by_screen_name (X) ==")
    try:
        u = await c.get_user_by_screen_name("X")
        print("OK:", u.screen_name, u.followers_count)
    except Exception as e:
        print("FAIL:", type(e).__name__, str(e)[:300])

    await c.http.aclose() if hasattr(c, "http") else None


asyncio.run(main())
