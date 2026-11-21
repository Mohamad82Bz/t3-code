import type { BotProfile } from "@t3tools/contracts";
import { cn } from "../../lib/utils";

const accentClasses: Record<BotProfile["accent"], string> = {
  sky: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  mint: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  rose: "bg-rose-500/15 text-rose-800 dark:text-rose-200",
  iris: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-200",
  slate: "bg-muted text-foreground",
};

export function BotAvatar({ name, accent }: Pick<BotProfile, "name" | "accent">) {
  const mark = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full text-sm font-medium ring-1 ring-inset ring-foreground/10",
        accentClasses[accent],
      )}
    >
      {mark}
    </span>
  );
}
