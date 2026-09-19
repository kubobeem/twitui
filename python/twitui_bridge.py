#!/usr/bin/env python3
"""twitui Python bridge.

JSON-RPC 2.0 over stdio. One JSON message per line.
Node.js (TUI) writes requests to our stdin; we write responses/notifications
to stdout. All logs go to stderr only (stdout is RPC-dedicated).

Modes:
- fake mode: env TWITUI_FAKE=1 or initialize params {"fake": true}
  -> uses an in-memory FakeClient. No twifork dependency, no cookies.
- real mode: uses twifork (pip install "twifork[impersonate]").
  Cookie-only auth (password login is closed on X's side as of 2026-07).
"""
from __future__ import annotations

import asyncio
import base64
import inspect
import json
import os
import random
import sys
import threading
import time
from typing import Any

LOG_LEVELS = ("debug", "info", "warn", "error")
MAX_LINE = 10 * 1024 * 1024  # 10 MB guard

START = time.time()
_rand = random.Random(20260919)


def log(level: str, message: str, **data: Any) -> None:
    if level not in LOG_LEVELS:
        level = "info"
    rec: dict[str, Any] = {"t": round(time.time() - START, 3), "level": level, "message": message}
    rec.update({k: v for k, v in data.items() if k != "cookies"})  # never log cookies
    print(json.dumps(rec, ensure_ascii=True), file=sys.stderr, flush=True)


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class RpcError(Exception):
    """JSON-RPC error with kind classification."""

    def __init__(self, code: int, message: str, kind: str, **data: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.kind = kind
        self.data = data


def classify_exception(e: Exception) -> str:
    s = str(e).lower()
    if "429" in s or "rate limit" in s:
        return "rate_limited"
    if "401" in s or "unauthorized" in s or "stale" in s or "bad authentication" in s:
        return "session_expired"
    if "403" in s or "forbidden" in s or "cloudflare" in s:
        return "forbidden"
    if "404" in s or "not found" in s or "notfound" in s:
        return "not_found"
    return "upstream"


def encode_cursor(index: int) -> str:
    return base64.b64encode(str(index).encode()).decode()


def decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(base64.b64decode(cursor).decode()))
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Fake client (tests / UI dev / demo)
# ---------------------------------------------------------------------------

class FakeClient:
    def __init__(self) -> None:
        def u(uid: str, sn: str, name: str, desc: str, followers: int, friends: int, statuses: int, verified: bool) -> dict[str, Any]:
            return {"id": uid, "screen_name": sn, "name": name, "description": desc,
                    "followers_count": followers, "friends_count": friends,
                    "statuses_count": statuses, "verified": verified, "profile_image_url": None}

        self.users: dict[str, dict[str, Any]] = {
            "1001": u("1001", "shin", "Shin", "TUI enjoyer", 1234, 200, 4200, False),
            "1002": u("1002", "tui_fan", "TUI Fan", "terminal > browser", 300, 150, 900, True),
            "1003": u("1003", "lurker", "Lurker", "read only", 42, 10, 77, False),
        }
        self.me = self.users["1001"]
        self.me_id = "1001"
        self.tweets: list[dict[str, Any]] = []
        base = time.time() - 3600 * 6
        samples = [
            ("1002", "twitui のレビューしてみた。x.com のUI感がそのまま terminal にあるの本当に良い", 8, True),
            ("1003", "Following タブの新しい順、ちゃんと時系列なのありがたい", 40, False),
            ("1002", "braille フォールバック、思ったより読める。kitty protocol での PNG 送信も綺麗", 95, True),
            ("1001", "twitui v0.1 リリースしました。npm i -g twitui で入れられます", 150, False),
            ("1003", "DM のテスト。ここには返信しないでください", 210, False),
            ("1002", "Ctrl+Enter 送信は x.com 準拠で良い判断", 260, False),
            ("1003", "rate limit 時の指数バックオフ表示、親切", 320, False),
        ]
        for i, (uid, text, minutes_ago, has_photo) in enumerate(samples):
            self.tweets.append({
                "id": f"t{1000 + i}",
                "created_at": now_iso(),
                "created_ts": base + (6 * 3600 - minutes_ago * 60),
                "user": self.users[uid],
                "text": text,
                "reply_count": i,
                "retweet_count": i * 2,
                "favorite_count": i * 3,
                "bookmark_count": 0,
                "view_count": i * 100,
                "photo_url": "https://picsum.photos/seed/twitui/800/500" if has_photo else None,
                "video_url": None,
                "quoted_tweet": None,
                "in_reply_to_id": None,
                "lang": "ja",
            })
        self.next_id = 1100
        self.liked: set[str] = set()
        self.retweeted: set[str] = set()
        self.bookmarks: set[str] = {"t1000"}
        self.dms: dict[str, list[dict[str, Any]]] = {
            "1002": [
                {"id": "m1", "user": self.users["1002"], "text": "お、TUI で DM 動いた?", "created_ts": base + 1800},
                {"id": "m2", "user": self.me, "text": "動いた", "created_ts": base + 1810},
                {"id": "m3", "user": self.users["1002"], "text": "やった", "created_ts": base + 1820},
            ],
        }
        self.spaces = [
            {"id": "sp1", "title": "TUI トーク", "state": "live", "speaker_count": 2, "listener_count": 88},
            {"id": "sp2", "title": "Node.js 24 話題", "state": "scheduled", "speaker_count": 1, "listener_count": 0},
        ]
        self._trends = [
            {"name": "#TUI", "tweet_count": 12000},
            {"name": "Node.js 24", "tweet_count": 9876},
            {"name": "#twitui", "tweet_count": 4200},
            {"name": "braille", "tweet_count": 1900},
        ]

    def _tweet_view(self, t: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": t["id"], "created_at": t.get("created_at") or now_iso(), "created_ts": t["created_ts"],
            "user": t["user"], "text": t["text"], "reply_count": t["reply_count"],
            "retweet_count": t["retweet_count"], "favorite_count": t["favorite_count"],
            "bookmark_count": t["bookmark_count"], "view_count": t["view_count"],
            "liked": t["id"] in self.liked, "retweeted": t["id"] in self.retweeted,
            "bookmarked": t["id"] in self.bookmarks,
            "photo_url": t.get("photo_url"), "video_url": t.get("video_url"),
            "quoted_tweet": t.get("quoted_tweet"),
            "in_reply_to_id": t.get("in_reply_to_id"), "lang": t.get("lang"),
        }

    def _dm_view(self, m: dict[str, Any]) -> dict[str, Any]:
        return {"id": m["id"], "user": m["user"], "text": m["text"], "created_ts": m["created_ts"],
                "created_at": now_iso()}

    def _paged(self, items: list[dict[str, Any]], cursor: str | None, page_size: int = 10,
               view=None) -> dict[str, Any]:
        start = decode_cursor(cursor)
        end = start + page_size
        page = items[start:end]
        next_cursor = encode_cursor(end) if end < len(items) else None
        v = view or self._tweet_view
        return {"items": [v(x) for x in page], "nextCursor": next_cursor}

    # ---- timeline / tweets ----
    def home_latest(self, cursor: str | None = None) -> dict[str, Any]:
        return self._paged(self.tweets, cursor)

    def home_foryou(self, cursor: str | None = None) -> dict[str, Any]:
        shuffled = list(self.tweets)
        _rand.shuffle(shuffled)
        return self._paged(shuffled, cursor)

    def create_tweet(self, text: str, media_ids: list[str] | None = None,
                     reply_to: str | None = None) -> dict[str, Any]:
        if not text or not text.strip():
            raise RpcError(-32602, "text required", "not_supported")
        if len(text) > 280:
            raise RpcError(-32602, "text too long (280 max)", "not_supported")
        t: dict[str, Any] = {
            "id": f"t{self.next_id}", "created_at": now_iso(), "created_ts": time.time(),
            "user": self.me, "text": text, "reply_count": 0, "retweet_count": 0,
            "favorite_count": 0, "bookmark_count": 0, "view_count": 0,
            "photo_url": None, "video_url": None, "quoted_tweet": None,
            "in_reply_to_id": reply_to, "lang": "ja",
        }
        self.next_id += 1
        self.tweets.insert(0, t)
        if reply_to:
            parent = next((x for x in self.tweets if x["id"] == reply_to), None)
            if parent:
                parent["reply_count"] += 1
        return self._tweet_view(t)

    def delete_tweet(self, tweet_id: str) -> dict[str, Any]:
        before = len(self.tweets)
        self.tweets = [x for x in self.tweets if x["id"] != tweet_id]
        if len(self.tweets) == before:
            raise RpcError(-32000, f"tweet not found: {tweet_id}", "not_found")
        return {"deleted": True}

    def tweet_detail(self, tweet_id: str) -> dict[str, Any]:
        t = next((x for x in self.tweets if x["id"] == tweet_id), None)
        if t is None:
            raise RpcError(-32000, f"tweet not found: {tweet_id}", "not_found")
        view = self._tweet_view(t)
        replies = [self._tweet_view(x) for x in self.tweets if x.get("in_reply_to_id") == tweet_id]
        view["replies"] = replies
        return view

    def tweet_search(self, q: str = "", mode: str = "Top", cursor: str | None = None) -> dict[str, Any]:
        ql = (q or "").strip().lower()
        if not ql:
            items = list(self.tweets)
        else:
            items = [x for x in self.tweets
                     if ql in x["text"].lower() or ql in x["user"]["screen_name"].lower()
                     or ql in x["user"]["name"].lower()]
        return self._paged(items, cursor)

    def trends(self) -> list[dict[str, Any]]:
        return self._trends

    # ---- reactions ----
    def tweet_like(self, tweet_id: str) -> dict[str, Any]:
        self.liked.add(tweet_id)
        return {"liked": True, "tweet_id": tweet_id}

    def tweet_unlike(self, tweet_id: str) -> dict[str, Any]:
        self.liked.discard(tweet_id)
        return {"liked": False, "tweet_id": tweet_id}

    def tweet_retweet(self, tweet_id: str) -> dict[str, Any]:
        self.retweeted.add(tweet_id)
        return {"retweeted": True, "tweet_id": tweet_id}

    def tweet_unretweet(self, tweet_id: str) -> dict[str, Any]:
        self.retweeted.discard(tweet_id)
        return {"retweeted": False, "tweet_id": tweet_id}

    def tweet_bookmark(self, tweet_id: str) -> dict[str, Any]:
        self.bookmarks.add(tweet_id)
        return {"bookmarked": True, "tweet_id": tweet_id}

    def tweet_unbookmark(self, tweet_id: str) -> dict[str, Any]:
        self.bookmarks.discard(tweet_id)
        return {"bookmarked": False, "tweet_id": tweet_id}

    def bookmarks_list(self, cursor: str | None = None) -> dict[str, Any]:
        items = [x for x in self.tweets if x["id"] in self.bookmarks]
        return self._paged(items, cursor)

    # ---- users ----
    def user_detail(self, screen_name: str | None = None, user_id: str | None = None) -> dict[str, Any]:
        if user_id:
            target = self.users.get(user_id)
        else:
            sn = (screen_name or "").lstrip("@")
            target = next((v for v in self.users.values() if v["screen_name"] == sn), None)
        if target is None:
            raise RpcError(-32000, f"user not found: {screen_name or user_id}", "not_found")
        return target

    def user_tweets(self, user_id: str, tab: str = "Tweets", cursor: str | None = None) -> dict[str, Any]:
        if user_id not in self.users:
            raise RpcError(-32000, f"user not found: {user_id}", "not_found")
        if tab == "TweetsAndReplies":
            items = [x for x in self.tweets if x["user"]["id"] == user_id or x.get("in_reply_to_id")]
        elif tab == "Media":
            items = [x for x in self.tweets if x["user"]["id"] == user_id
                     and (x.get("photo_url") or x.get("video_url"))]
        elif tab == "Likes":
            items = [x for x in self.tweets if x["id"] in self.liked]
        else:
            items = [x for x in self.tweets if x["user"]["id"] == user_id]
        return self._paged(items, cursor)

    def user_follow(self, user_id: str) -> dict[str, Any]:
        return {"following": True, "user_id": user_id}

    def user_unfollow(self, user_id: str) -> dict[str, Any]:
        return {"following": False, "user_id": user_id}

    def user_mute(self, user_id: str) -> dict[str, Any]:
        return {"muting": True, "user_id": user_id}

    def user_unmute(self, user_id: str) -> dict[str, Any]:
        return {"muting": False, "user_id": user_id}

    def user_block(self, user_id: str) -> dict[str, Any]:
        return {"blocking": True, "user_id": user_id}

    def user_unblock(self, user_id: str) -> dict[str, Any]:
        return {"blocking": False, "user_id": user_id}

    # ---- DM ----
    def dm_list(self) -> list[dict[str, Any]]:
        out = []
        for uid, msgs in self.dms.items():
            if not msgs:
                continue
            last = msgs[-1]
            out.append({"user": self.users.get(uid, last["user"]),
                        "last_message": last["text"], "last_ts": last["created_ts"]})
        return out

    def dm_messages(self, user_id: str, cursor: str | None = None) -> dict[str, Any]:
        # storage is oldest-first; return oldest-first so chat renders top-to-bottom
        msgs = list(self.dms.get(user_id, []))
        return self._paged(msgs, cursor, view=self._dm_view)

    def dm_send(self, user_id: str, text: str) -> dict[str, Any]:
        if not text.strip():
            raise RpcError(-32602, "text required", "not_supported")
        m = {"id": f"m{self.next_id}", "user": self.me, "text": text, "created_ts": time.time()}
        self.next_id += 1
        self.dms.setdefault(user_id, []).append(m)
        return self._dm_view(m)

    # ---- spaces ----
    def spaces_list(self) -> list[dict[str, Any]]:
        return self.spaces

    def space_detail(self, space_id: str) -> dict[str, Any]:
        s = next((x for x in self.spaces if x["id"] == space_id), None)
        if s is None:
            raise RpcError(-32000, f"space not found: {space_id}", "not_found")
        return {**s, "chat": [{"user": u, "text": t} for u, t in
                              [(self.users["1002"], "はじめまして"), (self.users["1001"], "こんばんは")]]}

    def space_create(self, title: str) -> dict[str, Any]:
        return {"id": f"sp{self.next_id}", "title": title, "state": "scheduled",
                "speaker_count": 1, "listener_count": 0}

    def space_end(self, space_id: str) -> dict[str, Any]:
        return {"ended": True, "space_id": space_id}

    # ---- media ----
    def media_upload(self, path: str) -> dict[str, Any]:
        if not os.path.exists(path):
            raise RpcError(-32602, f"file not found: {path}", "not_supported")
        return {"media_id": f"fake-media-{self.next_id}", "kind": "photo"}

    # ---- account ----
    def me(self) -> dict[str, Any]:
        return self.me

    def is_logged_in(self) -> bool:
        return True

    # RPC name aliases (tweet/create -> tweet_create, etc.)
    tweet_create = create_tweet
    tweet_delete = delete_tweet
    spaces_get = space_detail
    spaces_create = space_create
    spaces_end = space_end


# ---------------------------------------------------------------------------
# Real client wrapper (twifork)
# ---------------------------------------------------------------------------

class _AsyncToSync:
    """Adapter in front of the twifork client.

    twifork ships an async Client (all methods are coroutines) while this
    bridge is synchronous. The proxy runs a dedicated event loop in a
    background thread and transparently awaits any coroutine returned by
    attribute access, so wrapper methods can stay plain synchronous code.
    Also works unchanged with older synchronous twikit builds.
    """

    AWAIT_TIMEOUT_S = 180

    def __init__(self, target: Any, loop: asyncio.AbstractEventLoop) -> None:
        self._target = target
        self._loop = loop

    def _sync(self, awaitable: Any) -> Any:
        fut = asyncio.run_coroutine_threadsafe(awaitable, self._loop)
        return fut.result(timeout=self.AWAIT_TIMEOUT_S)

    def __getattr__(self, name: str) -> Any:
        raw = getattr(self._target, name)
        if inspect.iscoroutinefunction(raw):
            def runner(*args: Any, **kwargs: Any) -> Any:
                return self._sync(raw(*args, **kwargs))
            return runner
        if callable(raw):
            def runner2(*args: Any, **kwargs: Any) -> Any:
                result = raw(*args, **kwargs)
                if inspect.isawaitable(result):
                    result = self._sync(result)
                return result
            return runner2
        if isinstance(raw, (str, int, float, bool, list, dict, type(None), bytes)):
            return raw
        # nested namespace (e.g. client.spaces) -> wrap recursively
        return _AsyncToSync(raw, self._loop)


class RealClientWrapper:
    """Thin adapter: twifork (imports as `twikit`) -> RPC result dicts."""

    def __init__(self, auth_token: str, ct0: str, lang: str = "en") -> None:
        try:
            from twikit.client.client import Client  # type: ignore[import-not-found]
        except Exception as e:  # twifork not installed
            raise RpcError(-32000,
                           "twifork is not installed in the bridge venv. Run: twitui --reinstall-backend",
                           "not_supported") from e
        try:
            client = Client("ja", impersonate="chrome124")
        except TypeError:
            # older twikit/twifork without impersonate support
            client = Client("ja")
        client.set_cookies({"auth_token": auth_token, "ct0": ct0})
        # twifork's Client is async; run one loop in a background thread and
        # expose synchronous calls through the adapter below.
        self._loop = asyncio.new_event_loop()
        threading.Thread(target=self._loop.run_forever, daemon=True,
                         name="twifork-async").start()
        self.client = _AsyncToSync(client, self._loop)
        self._user_cache: dict[str, str] = {}  # screen_name -> id

    def is_logged_in(self) -> bool:
        try:
            return bool(self.client.is_logged_in())
        except Exception as e:
            raise RpcError(-32000, str(e), classify_exception(e)) from e

    @staticmethod
    def _u(u: Any) -> dict[str, Any]:
        if u is None:
            return {"id": "", "screen_name": "", "name": "", "description": "",
                    "followers_count": 0, "friends_count": 0, "statuses_count": 0,
                    "verified": False, "profile_image_url": None}
        return {
            "id": str(getattr(u, "id", "")),
            "screen_name": getattr(u, "screen_name", "") or "",
            "name": getattr(u, "name", "") or "",
            "description": getattr(u, "description", "") or "",
            "followers_count": getattr(u, "followers_count", 0) or 0,
            "friends_count": getattr(u, "friends_count", 0) or 0,
            "statuses_count": getattr(u, "statuses_count", 0) or 0,
            "verified": bool(getattr(u, "verified", False)),
            "profile_image_url": getattr(u, "profile_image_url", None),
        }

    @staticmethod
    def _t(t: Any) -> dict[str, Any]:
        photo = None
        video = None
        for m in (getattr(t, "media", None) or []):
            kind = getattr(m, "type", "")
            if kind == "photo" and photo is None:
                photo = getattr(m, "media_url_https", None) or getattr(m, "source_url", None)
            elif kind in ("video", "animated_gif") and video is None:
                video = getattr(m, "stream_url", None) or getattr(m, "source_url", None)
        quoted = None
        qt = getattr(t, "quoted_tweet", None)
        if qt is not None:
            try:
                quoted = RealClientWrapper._t(qt)
            except Exception:
                quoted = None
        created = getattr(t, "created_at", None)
        created_ts = None
        if hasattr(created, "timestamp"):
            created_ts = created.timestamp()
        return {
            "id": str(getattr(t, "id", "")),
            "created_at": str(created) if created else None,
            "created_ts": created_ts,
            "user": RealClientWrapper._u(getattr(t, "user", None)),
            "text": getattr(t, "text", "") or "",
            "reply_count": getattr(t, "reply_count", 0) or 0,
            "retweet_count": getattr(t, "retweet_count", 0) or 0,
            "favorite_count": getattr(t, "favorite_count", 0) or 0,
            "bookmark_count": getattr(t, "bookmark_count", 0) or 0,
            "view_count": getattr(t, "view_count", 0) or 0,
            "liked": bool(getattr(t, "favorited", False)),
            "retweeted": bool(getattr(t, "retweeted", False)),
            "bookmarked": bool(getattr(t, "bookmarked", False)),
            "photo_url": photo,
            "video_url": video,
            "quoted_tweet": quoted,
            "in_reply_to_id": getattr(t, "in_reply_to", None),
            "lang": getattr(t, "lang", None),
        }

    @staticmethod
    def _page(res: Any) -> tuple[list[Any], str | None]:
        """twifork Result is iterable (no .tweets attr); walk + read cursor."""
        items = list(res) if res is not None else []
        return items, getattr(res, "next_cursor", None)

    def home_latest(self, cursor: str | None = None) -> dict[str, Any]:
        res = self.client.get_latest_timeline(count=40, cursor=cursor)
        items, next_cursor = self._page(res)
        return {"items": [self._t(x) for x in items], "nextCursor": next_cursor}

    def home_foryou(self, cursor: str | None = None) -> dict[str, Any]:
        res = self.client.get_timeline(count=40, cursor=cursor)
        items, next_cursor = self._page(res)
        return {"items": [self._t(x) for x in items], "nextCursor": next_cursor}

    def create_tweet(self, text: str, media_ids: list[str] | None = None,
                     reply_to: str | None = None) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"text": text}
        if media_ids:
            kwargs["media_ids"] = media_ids
        if reply_to:
            kwargs["reply_to"] = reply_to
        created = self.client.create_tweet(**kwargs)
        return self._t(created)

    def delete_tweet(self, tweet_id: str) -> dict[str, Any]:
        self.client.delete_tweet(tweet_id)
        return {"deleted": True}

    def tweet_detail(self, tweet_id: str) -> dict[str, Any]:
        t = self.client.get_tweet_by_id(tweet_id)
        view = self._t(t)
        view["replies"] = []
        return view

    def tweet_search(self, q: str, mode: str = "Top", cursor: str | None = None) -> dict[str, Any]:
        product = mode if mode in ("Top", "Latest", "Media") else "Top"
        res = self.client.search_tweet(q, product, count=20, cursor=cursor)
        items, next_cursor = self._page(res)
        return {"items": [self._t(x) for x in items], "nextCursor": next_cursor}

    def trends(self) -> list[dict[str, Any]]:
        out = []
        for x in (self.client.get_trends("trending", count=20) or []):
            out.append({"name": getattr(x, "name", str(x)), "tweet_count": getattr(x, "tweet_count", 0)})
        return out

    def user_detail(self, screen_name: str | None = None, user_id: str | None = None) -> dict[str, Any]:
        if user_id:
            return self._u(self.client.get_user_by_id(user_id))
        sn = (screen_name or "").lstrip("@")
        return self._u(self.client.get_user_by_screen_name(sn))

    def user_tweets(self, user_id: str, tab: str = "Tweets", cursor: str | None = None) -> dict[str, Any]:
        res = self.client.get_user_tweets(user_id, tweet_type=tab, count=40, cursor=cursor)
        items, next_cursor = self._page(res)
        return {"items": [self._t(x) for x in items], "nextCursor": next_cursor}

    def bookmarks_list(self, cursor: str | None = None) -> dict[str, Any]:
        res = self.client.get_bookmarks(count=20, cursor=cursor)
        items, next_cursor = self._page(res)
        return {"items": [self._t(x) for x in items], "nextCursor": next_cursor}

    def tweet_like(self, tweet_id: str) -> dict[str, Any]:
        self.client.favorite_tweet(tweet_id)
        return {"liked": True, "tweet_id": tweet_id}

    def tweet_unlike(self, tweet_id: str) -> dict[str, Any]:
        self.client.unfavorite_tweet(tweet_id)
        return {"liked": False, "tweet_id": tweet_id}

    def tweet_retweet(self, tweet_id: str) -> dict[str, Any]:
        self.client.retweet(tweet_id)
        return {"retweeted": True, "tweet_id": tweet_id}

    def tweet_unretweet(self, tweet_id: str) -> dict[str, Any]:
        self.client.delete_retweet(tweet_id)
        return {"retweeted": False, "tweet_id": tweet_id}

    def tweet_bookmark(self, tweet_id: str) -> dict[str, Any]:
        self.client.bookmark_tweet(tweet_id)
        return {"bookmarked": True, "tweet_id": tweet_id}

    def tweet_unbookmark(self, tweet_id: str) -> dict[str, Any]:
        self.client.delete_bookmark(tweet_id)
        return {"bookmarked": False, "tweet_id": tweet_id}

    def user_follow(self, user_id: str) -> dict[str, Any]:
        self.client.follow_user(user_id)
        return {"following": True, "user_id": user_id}

    def user_unfollow(self, user_id: str) -> dict[str, Any]:
        self.client.unfollow_user(user_id)
        return {"following": False, "user_id": user_id}

    def user_mute(self, user_id: str) -> dict[str, Any]:
        self.client.mute_user(user_id)
        return {"muting": True, "user_id": user_id}

    def user_unmute(self, user_id: str) -> dict[str, Any]:
        self.client.unmute_user(user_id)
        return {"muting": False, "user_id": user_id}

    def user_block(self, user_id: str) -> dict[str, Any]:
        self.client.block_user(user_id)
        return {"blocking": True, "user_id": user_id}

    def user_unblock(self, user_id: str) -> dict[str, Any]:
        self.client.unblock_user(user_id)
        return {"blocking": False, "user_id": user_id}

    @staticmethod
    def _empty_u(uid: str = "", name: str = "") -> dict[str, Any]:
        return {"id": uid, "screen_name": "", "name": name, "description": "",
                "followers_count": 0, "friends_count": 0, "statuses_count": 0,
                "verified": False, "profile_image_url": None}

    def dm_list(self) -> list[dict[str, Any]]:
        res = self.client.get_dm_inbox()
        out = []
        for conv in self._page(res)[0]:
            partner = str(getattr(conv, "partner_id", "") or "")
            out.append({
                "user": self._empty_u(partner, getattr(conv, "name", "") or ""),
                "last_message": "",
                "last_ts": None,
                "conversation_id": str(getattr(conv, "id", "")),
                "is_group": bool(getattr(conv, "is_group", False)),
            })
        return out

    def dm_messages(self, user_id: str, cursor: str | None = None) -> dict[str, Any]:
        uid = self._user_cache.get(user_id, user_id)
        res = self.client.get_dm_history(user_id=uid, max_id=cursor)
        items = []
        for m in self._page(res)[0]:
            items.append({
                "id": str(getattr(m, "id", "")),
                "user": self._empty_u(str(getattr(m, "sender_id", "") or "")),
                "text": getattr(m, "text", "") or "",
                "created_at": str(getattr(m, "time", "") or ""),
                "created_ts": None,
            })
        return {"items": items, "nextCursor": getattr(res, "next_cursor", None)}

    def dm_send(self, user_id: str, text: str) -> dict[str, Any]:
        uid = self._user_cache.get(user_id, user_id)
        m = self.client.send_dm(user_id=uid, text=text)
        return {"id": str(getattr(m, "id", "")), "user": self._empty_u(),
                "text": text, "created_at": None, "created_ts": time.time()}

    def media_upload(self, path: str) -> dict[str, Any]:
        media_id = self.client.upload_media(path)
        return {"media_id": str(media_id), "kind": "photo"}

    def me(self) -> dict[str, Any]:
        return self._u(self.client.user())

    def space_detail(self, space_id: str) -> dict[str, Any]:
        raise RpcError(-32000, "Spaces viewing is not available in twifork 2.4.0 (planned for v2)",
                       "not_supported")

    def space_create(self, title: str) -> dict[str, Any]:
        raise RpcError(-32000, "Spaces creation is not available in twifork 2.4.0 (planned for v2)",
                       "not_supported")

    def space_end(self, space_id: str) -> dict[str, Any]:
        raise RpcError(-32000, "Spaces management is not available in twifork 2.4.0 (planned for v2)",
                       "not_supported")

    def spaces_list(self) -> list[dict[str, Any]]:
        raise RpcError(-32000, "spaces list requires a Space ID in real mode (open by ID)",
                       "not_supported")

    # RPC name aliases (tweet/create -> tweet_create, etc.)
    tweet_create = create_tweet
    tweet_delete = delete_tweet
    spaces_get = space_detail
    spaces_create = space_create
    spaces_end = space_end


# ---------------------------------------------------------------------------
# RPC dispatcher
# ---------------------------------------------------------------------------

SPECIAL_METHODS = {"initialize", "ping", "shutdown"}


class Bridge:
    def __init__(self) -> None:
        self.mode = "uninitialized"
        self.fake: FakeClient | None = None
        self.real: RealClientWrapper | None = None
        self.lock = threading.RLock()

    def client(self) -> Any:
        if self.mode == "fake":
            assert self.fake is not None
            return self.fake
        if self.mode == "real":
            assert self.real is not None
            return self.real
        raise RpcError(-32002, "bridge not initialized", "not_supported")

    def rpc_initialize(self, params: dict[str, Any]) -> dict[str, Any]:
        fake = bool(params.get("fake")) or os.environ.get("TWITUI_FAKE") == "1"
        if fake:
            self.fake = FakeClient()
            self.mode = "fake"
            log("info", "bridge initialized (fake mode)")
            return {"mode": "fake", "user": self.fake.me, "languages": ["ja", "en"]}

        cookies = params.get("cookies") or {}
        auth_token = str(cookies.get("AUTH_TOKEN", "")).strip()
        ct0 = str(cookies.get("CT0", "")).strip()
        if not auth_token or not ct0:
            raise RpcError(-32602, "AUTH_TOKEN and CT0 are required in real mode", "auth")
        lang = str(params.get("lang", "en"))
        self.real = RealClientWrapper(auth_token, ct0, lang)
        if not self.real.is_logged_in():
            self.real = None
            raise RpcError(-32000, "cookies are stale - re-enter them (auth_token + ct0)", "session_expired")
        self.mode = "real"
        user = self.real.me()
        log("info", "bridge initialized (real mode)", user=user.get("screen_name"))
        return {"mode": "real", "user": user, "languages": ["ja", "en"]}

    def rpc_ping(self) -> dict[str, Any]:
        return {"pong": True, "mode": self.mode, "uptime_s": round(time.time() - START, 1)}

    def rpc_shutdown(self) -> dict[str, Any]:
        return {"exiting": True}

    def dispatch(self, method: str, params: dict[str, Any]) -> Any:
        if method == "initialize":
            return self.rpc_initialize(params)
        if method == "ping":
            return self.rpc_ping()
        if method == "shutdown":
            return self.rpc_shutdown()
        handler_name = method.replace("/", "_").replace("-", "_")
        c = self.client()
        handler = getattr(c, handler_name, None)
        if not callable(handler):
            raise RpcError(-32601, f"unknown method: {method}", "not_supported")
        return handler(**params)

    def handle_line(self, raw: str) -> None:
        def reply(payload: dict[str, Any]) -> None:
            # ensure_ascii=True: Windows console / pipe encoding safety
            print(json.dumps(payload, ensure_ascii=True, default=str), file=sys.stdout, flush=True)

        def send_error(id_: Any, code: int, message: str, kind: str = "upstream",
                       **data: Any) -> None:
            reply({"jsonrpc": "2.0", "id": id_,
                   "error": {"code": code, "message": message,
                             "data": {"kind": kind, **data}}})

        try:
            msg = json.loads(raw)
        except json.JSONDecodeError as e:
            send_error(None, -32700, f"parse error: {e}")
            return
        if not isinstance(msg, dict):
            send_error(None, -32600, "request must be an object")
            return
        id_ = msg.get("id")
        method = msg.get("method")
        params = msg.get("params") or {}
        if not isinstance(params, dict):
            send_error(id_, -32600, "params must be an object")
            return
        if not method or not isinstance(method, str):
            send_error(id_, -32600, "method required")
            return

        with self.lock:
            try:
                result = self.dispatch(method, params)
                reply({"jsonrpc": "2.0", "id": id_, "result": result})
            except RpcError as e:
                send_error(id_, e.code, e.message, e.kind, **e.data)
            except KeyError as e:
                send_error(id_, -32000, f"not found: {e.args[0] if e.args else e}", "not_found")
            except TypeError as e:
                send_error(id_, -32602, f"invalid params: {e}", "not_supported")
            except Exception as e:  # noqa: BLE001 - never crash the loop
                kind = classify_exception(e)
                log("error", "dispatch failed", method=method, err=str(e), kind=kind)
                if kind == "rate_limited":
                    send_error(id_, -32000, str(e), kind, retryAfter=600)
                else:
                    send_error(id_, -32000, str(e), kind)


def main() -> None:
    bridge = Bridge()
    log("info", "bridge starting", pid=os.getpid(), python=sys.version.split()[0])
    try:
        while True:
            line = sys.stdin.readline()
            if not line:  # EOF -> parent closed stdin, exit
                log("info", "stdin EOF, exiting")
                break
            line = line.strip()
            if not line:
                continue
            if len(line) > MAX_LINE:
                log("error", "line too long, skipped")
                continue
            bridge.handle_line(line)
    except KeyboardInterrupt:
        pass
    log("info", "bridge exiting")
    print(json.dumps({"jsonrpc": "2.0", "method": "exiting"}, ensure_ascii=True), file=sys.stdout, flush=True)


if __name__ == "__main__":
    main()
