// @effect-diagnostics globalTimers:off -- The child-process shutdown watchdog runs outside an Effect fiber.
// @effect-diagnostics nodeBuiltinImport:off -- This desktop-only helper owns a Node child process.
import * as NodeChildProcess from "node:child_process";

import type { KeybindingShortcut } from "@t3tools/contracts";

export function startGlobalDictationShortcutProcess(
  workerPath: string,
  shortcut: KeybindingShortcut,
  onDown: () => void,
  onUp: () => void,
): Promise<() => void> {
  const worker = NodeChildProcess.fork(workerPath, [JSON.stringify(shortcut)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    execArgv: [],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      worker.kill();
      const forceKill = setTimeout(() => worker.kill("SIGKILL"), 1_000);
      forceKill.unref?.();
      worker.once("exit", () => clearTimeout(forceKill));
    };
    const fail = (error: Error) => {
      if (stopped) return;
      stop();
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    worker.on("message", (message) => {
      if (message === "ready" && !settled) {
        settled = true;
        resolve(stop);
      } else if (message === "down" && settled && !stopped) {
        onDown();
      } else if (message === "up" && settled && !stopped) {
        onUp();
      }
    });
    worker.once("error", fail);
    worker.once("exit", (code) => {
      if (!stopped) fail(new Error(`Dictation shortcut helper exited with code ${code}`));
    });
  });
}
