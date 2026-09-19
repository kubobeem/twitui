#!/usr/bin/env python3
"""Dump the raw gql.home_timeline response structure."""
import asyncio
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


def shape(o, depth=0, max_depth=6):
    pad = "  " * depth
    if depth > max_depth:
        return pad + "..."
    if isinstance(o, dict):
        lines = [f"{pad}dict({len(o)})"]
        for k, v in list(o.items())[:12]:
            lines.append(f"{pad}  {k}:")
            lines.append(shape(v, depth + 2, max_depth))
        return "\n".join(lines)
    if isinstance(o, list):
        lines = [f"{pad}list({len(o)})"]
        if o:
            lines.append(shape(o[0], depth + 1, max_depth))
        return "\n".join(lines)
    return f"{pad}{type(o).__name__}: {str(o)[:80]}"


async def main() -> None:
    resp, headers = await c.gql.home_timeline(20, None, None)
    s = json.dumps(resp, ensure_ascii=False)[:200]
    print("top-level type:", type(resp).__name__)
    if isinstance(resp, dict):
        print("keys:", list(resp.keys()))
        print("\n=== shape (first 80 lines) ===")
        print(shape(resp)[:6000])
    else:
        print(repr(resp)[:2000])

    try:
        await c.http.aclose()
    except Exception:
        pass

asyncio.run(main())
