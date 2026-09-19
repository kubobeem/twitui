/** Terminal graphics protocol detection (kitty / sixel / iTerm2). */
import { execFile } from 'node:child_process';
import { env, platform, stderr } from 'node:process';

export type GraphicsProtocol = 'kitty' | 'sixel' | 'iterm' | 'none';

let cached: GraphicsProtocol | null = null;

export function detectProtocol(): GraphicsProtocol {
  if (cached) return cached;

  // 1) Explicit overrides
  const force = env['TWITUI_GRAPHICS'];
  if (force === 'kitty' || force === 'sixel' || force === 'iterm' || force === 'none') {
    cached = force;
    return cached;
  }

  // 2) kitty: query the kernel of the protocol itself
  if (env['KITTY_WINDOW_ID'] || env['KITTY_PID']) {
    cached = 'kitty';
    return cached;
  }

  // 3) WezTerm supports both; prefer kitty protocol
  if (env['WEZTERM_EXECUTABLE']) {
    cached = 'kitty';
    return cached;
  }

  // 4) iTerm2 (macOS)
  if (env['ITERM_SESSION_ID'] || (platform === 'darwin' && env['TERM_PROGRAM'] === 'iTerm.app')) {
    cached = 'iterm';
    return cached;
  }

  // 5) Ghostty supports kitty graphics
  if (env['GHOSTTY_RESOURCES_DIR']) {
    cached = 'kitty';
    return cached;
  }

  // 6) sixel via TERM/terminfo (xterm-*, mlterm, etc.)
  const term = env['TERM'] ?? '';
  if (/sixel/.test(term) || /^(xterm|mlterm|foot)/.test(term)) {
    cached = 'sixel';
    return cached;
  }

  cached = 'none';
  return cached;
}

/** Reset cache (mainly for tests). */
export function resetProtocolCache(): void {
  cached = null;
}

/** Query kitty terminal support with the graphics escape sequence (best effort). */
export async function probeKitty(timeoutMs = 400): Promise<boolean> {
  if (platform === 'win32') return false; // ConPTY mangles the response in most setups
  return new Promise((resolve) => {
    const child = execFile('sh', ['-c', 'printf "\\e_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\\e\\\\\\" && cat >/dev/null'], { timeout: timeoutMs }, () => {
      /* response parsing is best-effort; v1 relies on env detection */
    });
    child.on('error', () => resolve(false));
    child.on('exit', () => resolve(false));
    // v1: env detection is authoritative; probe is a stub that never resolves true
    void stderr;
  });
}
