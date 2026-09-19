<div align="center">

# twitui

**X (Twitter) client in your terminal — an x.com-like TUI powered by [twifork](https://github.com/PawiX25/twifork)**

`npm install -g twitui` → `twitui`

</div>

## Features

- 🏠 **Home timeline** — For You / Following tabs, auto-polling with x.com-style "new posts" badge
- 🔍 **Search / Explore** — keyword search (Top / Latest), trending topics
- ✍️ **Post** — compose modal with 280-char counter, image attach (max 4), reply, quote
- ❤️ **Actions** — like / repost / bookmark / delete, follow / mute / block from profile
- ✉️ **DM** — conversation list + chat view
- 📡 **Spaces** — view by Space ID, chat history (voice joining is out of scope for v1)
- 🖼 **Inline images** — kitty graphics protocol, with braille-art fallback
- 🌐 **i18n** — English / 日本語

## How it works

```
┌─────────────────────────────┐
│  Node.js TUI (Ink/React)    │
└──────────────┬──────────────┘
               │ JSON-RPC 2.0 over stdio
┌──────────────▼──────────────┐
│  Python bridge (twifork)    │
│  auto-installed into a venv │
└─────────────────────────────┘
```

On first launch (real mode), twitui builds an isolated venv at
`~/.config/twikit-tui/venv` and installs `twifork[impersonate]`. If Python is
missing it uses [uv](https://docs.astral.sh/uv/) to set everything up
automatically.

## Cookie setup (required)

> Password login is **no longer possible** — X closed the flow in 2026
> (`LoginFlow is currently not accessible`). Cookie auth is the only way.

1. Log in to x.com in your browser
2. Open DevTools → **Application** → **Cookies** → `https://x.com`
3. Copy `auth_token` and `ct0`
4. Launch `twitui` and paste them in the setup screen, e.g.:

   ```
   auth_token=abc123...; ct0=def456...
   ```

Cookie header strings, `name: value` lines, and raw JSON all work. They are
verified against X, then stored in `~/.config/twikit-tui/.env` (mode 600).
When the session expires, twitui shows the same screen to re-enter them.

Environment variables `AUTH_TOKEN` / `CT0` are also accepted.

## CLI

```
twitui                      # normal launch
twitui --fake               # demo mode with in-memory data (no cookies)
twitui --setup              # re-enter cookies
twitui --reinstall-backend  # rebuild the Python venv
twitui --lang ja|en         # UI language
twitui --poll <seconds>     # poll interval (default 120, min 30)
```

## Keybindings

| Key | Action | Key | Action |
|---|---|---|---|
| `j`/`k`, `↑`/`↓` | move | `Enter` | open detail |
| `n` | new post | `Q` | quote |
| `l` | like | `t` | repost |
| `b` | bookmark | `r` | reply / refresh (list) |
| `d` | delete own post | `o` | open link in browser |
| `u` | open author profile | `/` | search |
| `Tab` | For You ⇄ Following | `1-5` | jump to section |
| `x` | accept new posts | `?` | help |
| `q` | back / quit | `Ctrl+C` ×2 | force quit |

## Configuration

`~/.config/twikit-tui/config.json`:

```json
{
  "uiLang": "ja",
  "pollInterval": 120,
  "media": { "timelinePreview": true }
}
```

## Security notes

- Cookies give **full account access** — never commit your `.env`
- All bridge communication stays on local stdio; nothing network-exposed
- The bridge never logs cookie values

## Development

```bash
npm install
npm run build          # tsc → dist/
npm test               # vitest (Node side)
npm run test:py        # Python bridge tests (fake mode, no network)
npm run dev            # tsx src/cli.tsx
```

## License

MIT. `twitui` is an independent, unofficial project — not affiliated with X
Corp. "X" and "Twitter" are trademarks of X Corp. Use in accordance with
applicable terms and laws.
