<div align="center">

# twitui

**X (Twitter) client in your terminal — an x.com-like TUI powered by [twifork](https://github.com/PawiX25/twifork)**

`npm i -g https://github.com/kubobeem/twitui/archive/refs/heads/main.tar.gz` → `twitui`

</div>

## Install

**From GitHub (works today, no npm registry account needed):**

```bash
# from a release (recommended — tested tarball attached to each release)
npm i -g https://github.com/kubobeem/twitui/releases/latest/download/twitui-0.1.2.tgz

# or latest main branch
npm i -g https://github.com/kubobeem/twitui/archive/refs/heads/main.tar.gz
```

> **Note on versions:** the `latest/download` URL above pins an explicit
> version in its filename. Check the
> [Releases page](https://github.com/kubobeem/twitui/releases) for the
> newest one — every release is built by CI after tests pass.

> ⚠️ **Do NOT use `npm i -g kubobeem/twitui` (git shorthand / git URL)** —
> npm has a bug (npm 10 & 11, Windows) where a git-hosted dependency is
> installed as a symlink to a temp git clone that npm deletes right
> after, so `twitui` fails with `Cannot find module ... dist/cli.js`.
> Use the tarball URL above. If you already hit the bug:
>
> ```powershell
> npm rm -g twitui
> # or manually:
> Remove-Item -Recurse -Force $env:APPDATA\npm\node_modules\twitui
> Remove-Item $env:APPDATA\npm\twitui*
> ```

**From a local clone:**

```bash
git clone https://github.com/kubobeem/twitui && cd twitui
npm i -g .
```

This package is distributed via GitHub Releases (not the npm registry —
npm now requires 2FA for new-package publishes, and registry publishing
is intentionally skipped here).

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
