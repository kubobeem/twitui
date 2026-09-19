#!/usr/bin/env python3
"""Find 'entries' inside the raw home_timeline_urt response."""
import asyncio
import re
from pathlib import Path

from twikit.client.client import Client

ENV = Path.home() / ".config" / "twikit-tui" / ".env"
text = ENV.read_text(encoding="utf-8")
at = re.search(r"AUTH_TOKEN=(.+)", text).group(1).strip()
ct0 = re.search(r"CT0=(.+)", text).group(1).strip()

c = Client("ja", impersonate="chrome124")
c.set_cookies({"auth_token": at, "ct0": ct0})


def find_keys(o, target, path="$"):
    """Yield paths where dict key == target."""
    if isinstance(o, dict):
        for k, v in o.items():
            if k == target:
                yield f"{path}.{k}"
            yield from find_keys(v, target, f"{path}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o[:3]):
            yield from find_keys(v, target, f"{path}[{i}]")


async def main() -> None:
    resp, _ = await c.gql.home_timeline(20, None, None)
    urt = resp["data"]["home"]["home_timeline_urt"]

    print("== instructions ==")
    for ins in urt.get("instructions", []):
        keys = list(ins.keys())
        print("instruction keys:", keys, "| type:", ins.get("type"))
        entries = ins.get("entries")
        if entries is not None:
            print("  -> entries:", len(entries))
        timeline = ins.get("timeline")
        if isinstance(timeline, dict):
            print("  -> timeline keys:", list(timeline.keys()))
            e2 = timeline.get("entries")
            if e2 is not None:
                print("     timeline.entries:", len(e2))

    print("\n== paths of 'entries' ==")
    for p in find_keys(resp, "entries"):
        print(" ", p)

    print("\n== metadata ==")
    print(repr(urt.get("metadata"))[:300])

    print("\n== responseObjects ==")
    ro = urt.get("responseObjects")
    print(repr(ro)[:300] if ro is not None else None)

    # sample one entry fully
    for ins in urt.get("instructions", []):
        entries = ins.get("entries") or (ins.get("timeline") or {}).get("entries")
        if entries:
            import json
            print("\n== sample entry ==")
            print(json.dumps(entries[0], ensure_ascii=False)[:2500])
            break

    try:
        await c.http.aclose()
    except Exception:
        pass

asyncio.run(main())
