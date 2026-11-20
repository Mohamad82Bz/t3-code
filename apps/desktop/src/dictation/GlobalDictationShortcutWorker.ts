// @effect-diagnostics globalTimers:off -- This child process polls Win32 key state outside an Effect fiber.
import type { KeybindingShortcut } from "@t3tools/contracts";

import { loadWindowsForegroundApi } from "../electron/WindowsForeground.ts";

const VIRTUAL_KEYS: Readonly<Record<string, number>> = {
  backspace: 0x08,
  tab: 0x09,
  enter: 0x0d,
  escape: 0x1b,
  space: 0x20,
  pageup: 0x21,
  pagedown: 0x22,
  end: 0x23,
  home: 0x24,
  arrowleft: 0x25,
  arrowup: 0x26,
  arrowright: 0x27,
  arrowdown: 0x28,
  insert: 0x2d,
  delete: 0x2e,
  "-": 0xbd,
  "=": 0xbb,
  "[": 0xdb,
  "]": 0xdd,
  "\\": 0xdc,
  ";": 0xba,
  "'": 0xde,
  ",": 0xbc,
  ".": 0xbe,
  "/": 0xbf,
  "`": 0xc0,
};

function virtualKeyFor(key: string): number | null {
  if (/^[a-z]$/.test(key)) return key.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
  if (/^f(?:[1-9]|1[0-2])$/.test(key)) return 0x70 + Number(key.slice(1)) - 1;
  return VIRTUAL_KEYS[key] ?? null;
}

function pressed(
  api: Awaited<ReturnType<typeof loadWindowsForegroundApi>>,
  shortcut: KeybindingShortcut,
) {
  const key = virtualKeyFor(shortcut.key);
  if (key === null) return false;
  const ctrl = shortcut.ctrlKey || shortcut.modKey;
  const meta = shortcut.metaKey;
  return (
    api.isKeyDown(key) &&
    api.isKeyDown(0x10) === shortcut.shiftKey &&
    api.isKeyDown(0x12) === shortcut.altKey &&
    api.isKeyDown(0x11) === ctrl &&
    api.isKeyDown(0x5b) === meta
  );
}

const shortcut = JSON.parse(process.argv[2] ?? "null") as KeybindingShortcut | null;
if (!shortcut || virtualKeyFor(shortcut.key) === null) process.exit(1);
const activeShortcut = shortcut;

async function poll() {
  const api = await loadWindowsForegroundApi();
  let active = false;
  process.send?.("ready");
  const timer = setInterval(() => {
    const next = pressed(api, activeShortcut);
    if (next !== active) {
      active = next;
      try {
        process.send?.(next ? "down" : "up");
      } catch {}
    }
  }, 30);
  const shutdown = () => {
    clearInterval(timer);
    process.exit(0);
  };
  process.once("disconnect", shutdown);
  process.once("SIGTERM", shutdown);
}

void poll().catch(() => process.exit(1));
