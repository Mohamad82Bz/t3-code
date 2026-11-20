import { fileBasename } from "@t3tools/shared/path";
import type { V2ItemStartedNotification__CommandAction } from "effect-codex-app-server/schema";

function compactTitle(value: string) {
  const text = value.replace(/\s+/gu, " ").trim();
  return text.length > 100 ? `${text.slice(0, 97)}…` : text;
}

function explicitTitle(command: string) {
  // Only leading comments are metadata; markers inside scripts or heredocs are data.
  for (const line of command.trimStart().split(/\r?\n/u, 16)) {
    const text = line.trim();
    if (!text) continue;
    if (!text.startsWith("#")) break;
    const match = /^#\s*t3-title:\s*(.+)$/u.exec(text);
    if (match) return compactTitle(match[1]!);
  }
  return undefined;
}

function fallbackTitle(command: string) {
  const script = command.trimStart().replace(/^(?:#[^\n]*\n\s*)+/u, "");
  const program = /^(?:&\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;|&]+))/u.exec(script);
  const name = fileBasename(program?.[1] ?? program?.[2] ?? program?.[3] ?? "").replace(
    /\.exe$/iu,
    "",
  );
  if (
    /^(?:python[\d.]*|py)$/iu.test(name) ||
    /(?:^|\n)\s*[^\n]*\|\s*(?:python[\d.]*|py)\b/iu.test(script)
  ) {
    return "Run Python script";
  }
  if (/^(?:node|bun|deno)$/iu.test(name)) return `Run ${name} script`;
  if (/^(?:powershell|pwsh)$/iu.test(name) || /^(?:\$|@['"]|[A-Z][a-z]+-[A-Z])/u.test(script)) {
    return "Run PowerShell script";
  }
  if (/^(?:ba|da|z|fi|k)?sh$/iu.test(name)) return "Run shell script";
  if (/^(?:git|npm|pnpm|yarn|vp|cargo|go|dotnet)$/u.test(name)) {
    const subcommand = script
      .slice(program![0].length)
      .trimStart()
      .match(/^([a-z][\w:-]*)\b/u)?.[1];
    return `Run ${name}${subcommand ? ` ${subcommand}` : ""}`;
  }
  return /^[\w.-]+$/u.test(name) && name.length <= 30 ? `Run ${name}` : "Run command";
}

function actionTitle(action: V2ItemStartedNotification__CommandAction) {
  switch (action.type) {
    case "read":
      return `Read ${fileBasename(action.path) || action.name}`;
    case "listFiles":
      return action.path
        ? `List files in ${fileBasename(action.path) || action.path}`
        : "List files";
    case "search":
      return `Search${action.query ? ` for “${action.query}”` : " files"}${action.path ? ` in ${fileBasename(action.path) || action.path}` : ""}`;
    case "unknown":
      return fallbackTitle(action.command);
  }
}

export function codexCommandTitle(
  command: string,
  actions: ReadonlyArray<V2ItemStartedNotification__CommandAction>,
) {
  // Codex supplies the original shell payload in commandActions, without the display wrapper.
  const title = explicitTitle(actions[0]?.command ?? command);
  if (title) return title;
  const labels = [...new Set(actions.map(actionTitle))];
  if (labels.length === 0) return fallbackTitle(command);
  return compactTitle(
    `${labels.slice(0, 2).join("; ")}${labels.length > 2 ? ` (+${labels.length - 2} more)` : ""}`,
  );
}
